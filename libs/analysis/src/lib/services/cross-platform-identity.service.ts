import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { execFile } from 'child_process';
import { randomBytes } from 'crypto';
import { mkdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/** Injection token for identity record persistence (optional — provided by app module) */
export const IDENTITY_RECORD_STORE = Symbol('IDENTITY_RECORD_STORE');

/** Interface to avoid hard dependency on ingestion lib */
interface IdentityRecordStore {
  findByHandle(
    handle: string,
    platform: string,
  ): Promise<{
    _id: string;
    id: string;
    primaryHandle: string;
    primaryPlatform: string;
    platformAccounts: Array<{
      platform: string;
      handle: string;
      url: string;
      discoveredAt: Date;
      discoveryMethod: string;
      discoveryTier?: string;
      verified: boolean;
    }>;
    [key: string]: unknown;
  } | null>;
  updatePlatformAccounts?(
    id: string,
    accounts: Array<{
      platform: string;
      handle: string;
      url: string;
      discoveredAt: Date;
      discoveryMethod: 'sherlock' | 'investigation' | 'manual';
      discoveryTier?: 'actionable' | 'corroborating' | 'extended';
      verified: boolean;
    }>,
    sherlockResolvedAt: Date,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A confirmed account on a specific platform */
export interface DiscoveredAccount {
  platform: string;
  url: string;
  username: string;
  tier: 'actionable' | 'corroborating' | 'extended';
}

/** Result of cross-platform identity resolution for one username */
export interface IdentityResolutionResult {
  queriedUsername: string;
  accounts: DiscoveredAccount[];
  actionableAccounts: DiscoveredAccount[];
  corroboratingAccounts: DiscoveredAccount[];
  extendedAccounts: DiscoveredAccount[];
  /** Platforms we care about for narrative analysis */
  relevantAccounts: DiscoveredAccount[];
  totalFound: number;
  searchDuration: number;
}

/** Platforms that have timeline fetching support in Veritas */
const RELEVANT_PLATFORMS = new Set([
  'twitter',
  'reddit',
  'youtube',
  'bluesky',
  'threads',
  'instagram',
  'facebook',
  'tiktok',
  'mastodon',
  'tumblr',
  'medium',
  'substack',
  'linkedin',
  'telegram',
  'discord',
  'truthsocial',
  'farcaster',
  'wikipedia',
]);

/** Platforms we can materially act on in the investigation pipeline today. */
const ACTIONABLE_PLATFORMS = new Set([
  'twitter',
  'reddit',
  'bluesky',
  'telegram',
  'truthsocial',
  'farcaster',
]);

/**
 * Map Sherlock site names to normalized platform names.
 * Sherlock uses site names like "Twitter", "Reddit", "YouTube" etc.
 */
const SITE_NAME_MAP: Record<string, string> = {
  twitter: 'twitter',
  x: 'twitter',
  reddit: 'reddit',
  youtube: 'youtube',
  bluesky: 'bluesky',
  threads: 'threads',
  instagram: 'instagram',
  facebook: 'facebook',
  tiktok: 'tiktok',
  mastodon: 'mastodon',
  'mastodon.social': 'mastodon',
  tumblr: 'tumblr',
  medium: 'medium',
  substack: 'substack',
  linkedin: 'linkedin',
  telegram: 'telegram',
  discord: 'discord',
  github: 'github',
  gitlab: 'gitlab',
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Cross-platform identity resolution using Sherlock.
 *
 * Given a username, discovers all accounts across 400+ social networks.
 * Filters to platforms relevant for narrative analysis and returns
 * structured results for the deep investigation pipeline.
 */
@Injectable()
export class CrossPlatformIdentityService {
  private readonly logger = new Logger(CrossPlatformIdentityService.name);
  private readonly sherlockPath: string;
  private readonly timeout: number = 15; // seconds per site
  private readonly cache = new Map<
    string,
    { result: IdentityResolutionResult; timestamp: number }
  >();
  private readonly cacheTTL = 3600000; // 1 hour

  constructor(
    @Optional() @Inject(IDENTITY_RECORD_STORE) private readonly identityStore?: IdentityRecordStore,
  ) {
    this.sherlockPath = 'sherlock';
    this.checkAvailability();
  }

  private async checkAvailability(): Promise<void> {
    try {
      await this.exec(this.sherlockPath, ['--version']);
      this.logger.log('Sherlock is available for cross-platform identity resolution');
    } catch {
      this.logger.warn(
        'Sherlock is not installed. Cross-platform identity resolution will be unavailable. ' +
          'Install with: pip install sherlock-project',
      );
    }
  }

  /**
   * Resolve a username across all platforms Sherlock supports.
   * Returns discovered accounts filtered to platforms relevant for narrative analysis.
   */
  /** 24 hours — Sherlock runs at most once per user per day */
  private static readonly PERSIST_TTL_MS = 24 * 60 * 60 * 1000;

  async resolveIdentity(username: string): Promise<IdentityResolutionResult> {
    const cleanUsername = username.replace(/^@/, '').replace(/^u\//, '');

    // Check in-memory cache first
    const cached = this.cache.get(cleanUsername);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      this.logger.debug(`Cache hit for "${cleanUsername}"`);
      return cached.result;
    }

    // Check persisted identity record for recent Sherlock data (< 24 hours)
    if (this.identityStore) {
      try {
        // Try multiple platform guesses since we don't know the primary
        const record =
          (await this.identityStore.findByHandle(cleanUsername, 'twitter')) ??
          (await this.identityStore.findByHandle(cleanUsername, 'reddit')) ??
          (await this.identityStore.findByHandle(cleanUsername, 'unknown'));

        if (record?.platformAccounts && record.platformAccounts.length > 0) {
          // Check if any sherlock-discovered accounts exist and are recent
          const sherlockAccounts = record.platformAccounts.filter(
            (a) => a.discoveryMethod === 'sherlock',
          );
          if (sherlockAccounts.length > 0) {
            const newest = sherlockAccounts.reduce((latest, a) => {
              const t = new Date(a.discoveredAt).getTime();
              return t > latest ? t : latest;
            }, 0);
            if (Date.now() - newest < CrossPlatformIdentityService.PERSIST_TTL_MS) {
              this.logger.debug(
                `Using persisted Sherlock data for "${cleanUsername}" (${sherlockAccounts.length} accounts, age: ${Math.round((Date.now() - newest) / 3600000)}h)`,
              );
              const accounts: DiscoveredAccount[] = sherlockAccounts.map((a) => ({
                platform: a.platform,
                url: a.url,
                username: a.handle,
                tier: this.normalizeTier(a.platform, a.discoveryTier),
              }));
              const {
                actionableAccounts,
                corroboratingAccounts,
                extendedAccounts,
                relevantAccounts,
              } = this.partitionAccounts(accounts);

              const result: IdentityResolutionResult = {
                queriedUsername: cleanUsername,
                accounts,
                actionableAccounts,
                corroboratingAccounts,
                extendedAccounts,
                relevantAccounts,
                totalFound: accounts.length,
                searchDuration: 0,
              };

              // Warm in-memory cache
              this.cache.set(cleanUsername, { result, timestamp: Date.now() });
              return result;
            }
          }
        }
      } catch (err) {
        this.logger.debug(`Identity store lookup failed for "${cleanUsername}": ${err}`);
      }
    }

    const start = Date.now();
    this.logger.log(`Resolving cross-platform identity for "${cleanUsername}"...`);

    const accounts = await this.runSherlock(cleanUsername);
    const { actionableAccounts, corroboratingAccounts, extendedAccounts, relevantAccounts } =
      this.partitionAccounts(accounts);

    const result: IdentityResolutionResult = {
      queriedUsername: cleanUsername,
      accounts,
      actionableAccounts,
      corroboratingAccounts,
      extendedAccounts,
      relevantAccounts,
      totalFound: accounts.length,
      searchDuration: Date.now() - start,
    };

    // Cache result in memory
    this.cache.set(cleanUsername, { result, timestamp: Date.now() });

    // Persist discovered accounts to identity record (fire-and-forget)
    if (this.identityStore && accounts.length > 0) {
      this.persistSherlockResults(cleanUsername, accounts).catch((err) => {
        this.logger.debug(`Failed to persist Sherlock results: ${err}`);
      });
    }

    this.logger.log(
      `Found ${accounts.length} accounts for "${cleanUsername}" ` +
        `(${relevantAccounts.length} relevant) in ${result.searchDuration}ms`,
    );

    return result;
  }

  /**
   * Persist Sherlock-discovered accounts to the identity record in MongoDB.
   */
  private async persistSherlockResults(
    username: string,
    accounts: DiscoveredAccount[],
  ): Promise<void> {
    if (!this.identityStore) return;

    try {
      const record =
        (await this.identityStore.findByHandle(username, 'twitter')) ??
        (await this.identityStore.findByHandle(username, 'reddit')) ??
        (await this.identityStore.findByHandle(username, 'unknown'));

      if (!record) {
        this.logger.debug(`No identity record for "${username}" — skipping Sherlock persistence`);
        return;
      }

      const now = new Date();
      const existingKeys = new Set(record.platformAccounts.map((a) => `${a.platform}:${a.handle}`));

      const newAccounts = accounts
        .filter((a) => !existingKeys.has(`${a.platform}:${a.username}`))
        .map((a) => ({
          platform: a.platform,
          handle: a.username,
          url: a.url,
          discoveredAt: now,
          discoveryMethod: 'sherlock' as const,
          discoveryTier: a.tier,
          verified: false,
        }));

      if (newAccounts.length === 0) return;

      // Use updatePlatformAccounts if available, otherwise fall back to direct approach
      if (this.identityStore.updatePlatformAccounts) {
        await this.identityStore.updatePlatformAccounts(
          record._id?.toString() ?? record.id,
          [...record.platformAccounts, ...newAccounts] as Array<{
            platform: string;
            handle: string;
            url: string;
            discoveredAt: Date;
            discoveryMethod: 'sherlock' | 'investigation' | 'manual';
            discoveryTier?: 'actionable' | 'corroborating' | 'extended';
            verified: boolean;
          }>,
          now,
        );
      }

      this.logger.debug(
        `Persisted ${newAccounts.length} new Sherlock accounts for "${username}" to identity record`,
      );
    } catch (err) {
      this.logger.warn(`Failed to persist Sherlock results for "${username}": ${err}`);
    }
  }

  /**
   * Batch resolve multiple usernames.
   * Processes sequentially to avoid overwhelming Sherlock / rate limits.
   */
  async batchResolve(usernames: string[]): Promise<Map<string, IdentityResolutionResult>> {
    const results = new Map<string, IdentityResolutionResult>();

    for (const username of usernames) {
      try {
        const result = await this.resolveIdentity(username);
        results.set(username, result);
      } catch (err) {
        this.logger.warn(`Failed to resolve "${username}": ${err}`);
        results.set(username, {
          queriedUsername: username.replace(/^@/, ''),
          accounts: [],
          actionableAccounts: [],
          corroboratingAccounts: [],
          extendedAccounts: [],
          relevantAccounts: [],
          totalFound: 0,
          searchDuration: 0,
        });
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Sherlock wrapper
  // ---------------------------------------------------------------------------

  private async runSherlock(username: string): Promise<DiscoveredAccount[]> {
    // Create a temp directory for output
    const tmpDir = join(tmpdir(), `sherlock-${randomBytes(4).toString('hex')}`);
    await mkdir(tmpDir, { recursive: true });

    try {
      const outputFile = join(tmpDir, `${username}.csv`);

      await this.exec(
        this.sherlockPath,
        [
          username,
          '--csv',
          '--output',
          outputFile,
          '--timeout',
          String(this.timeout),
          '--print-found',
        ],
        120000,
      ); // 2 min max total

      // Parse CSV output
      const csvContent = await readFile(outputFile, 'utf-8').catch(() => '');
      return this.parseCsvOutput(csvContent, username);
    } catch (err) {
      this.logger.error(`Sherlock execution failed for "${username}": ${err}`);
      return [];
    } finally {
      // Cleanup temp directory
      await rm(tmpDir, { recursive: true, force: true }).catch((cleanupError) => {
        this.logger.debug(`Failed to clean Sherlock temp dir "${tmpDir}": ${cleanupError}`);
      });
    }
  }

  private parseCsvOutput(csv: string, username: string): DiscoveredAccount[] {
    const accounts: DiscoveredAccount[] = [];
    const lines = csv.split('\n').filter((l) => l.trim());

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        continue;
      }
      // CSV format: username,name,url_main,url_user,exists,http_status,response_time_s
      const parts = line.split(',');
      if (parts.length < 4) continue;

      const siteName = (parts[1] ?? '').trim().toLowerCase();
      const url = (parts[3] ?? '').trim();
      const exists = (parts[4] ?? '').trim().toLowerCase();

      if (exists !== 'claimed') continue;
      if (!url) continue;

      // Normalize platform name
      const platform = this.normalizePlatform(siteName, url);

      accounts.push({
        platform,
        url,
        username,
        tier: this.classifyPlatform(platform),
      });
    }

    return accounts;
  }

  private classifyPlatform(platform: string): 'actionable' | 'corroborating' | 'extended' {
    if (ACTIONABLE_PLATFORMS.has(platform)) return 'actionable';
    if (RELEVANT_PLATFORMS.has(platform)) return 'corroborating';
    return 'extended';
  }

  private normalizeTier(
    platform: string,
    tier?: string,
  ): 'actionable' | 'corroborating' | 'extended' {
    if (tier === 'actionable' || tier === 'corroborating' || tier === 'extended') {
      return tier;
    }
    return this.classifyPlatform(platform);
  }

  private partitionAccounts(accounts: DiscoveredAccount[]) {
    const actionableAccounts = accounts.filter((a) => a.tier === 'actionable');
    const corroboratingAccounts = accounts.filter((a) => a.tier === 'corroborating');
    const extendedAccounts = accounts.filter((a) => a.tier === 'extended');
    return {
      actionableAccounts,
      corroboratingAccounts,
      extendedAccounts,
      relevantAccounts: [...actionableAccounts, ...corroboratingAccounts],
    };
  }

  private normalizePlatform(siteName: string, url: string): string {
    // Try direct site name mapping
    const mapped = SITE_NAME_MAP[siteName];
    if (mapped) return mapped;

    // Try URL-based detection
    const urlLower = url.toLowerCase();
    if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) return 'twitter';
    if (urlLower.includes('reddit.com')) return 'reddit';
    if (urlLower.includes('youtube.com')) return 'youtube';
    if (urlLower.includes('instagram.com')) return 'instagram';
    if (urlLower.includes('facebook.com')) return 'facebook';
    if (urlLower.includes('tiktok.com')) return 'tiktok';
    if (urlLower.includes('threads.net')) return 'threads';
    if (urlLower.includes('bsky.app')) return 'bluesky';
    if (urlLower.includes('mastodon')) return 'mastodon';
    if (urlLower.includes('tumblr.com')) return 'tumblr';
    if (urlLower.includes('medium.com')) return 'medium';
    if (urlLower.includes('substack.com')) return 'substack';
    if (urlLower.includes('linkedin.com')) return 'linkedin';
    if (urlLower.includes('t.me')) return 'telegram';
    if (urlLower.includes('github.com')) return 'github';

    return siteName || 'other';
  }

  // ---------------------------------------------------------------------------
  // Util
  // ---------------------------------------------------------------------------

  private exec(command: string, args: string[], timeout = 15000): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(command, args, { timeout }, (error, stdout, stderr) => {
        if (error && error.killed) {
          reject(new Error(`Command timed out after ${timeout}ms`));
          return;
        }
        // Sherlock exits 0 even when finding results, but may write to stderr
        resolve(stdout || stderr || '');
      });
    });
  }
}
