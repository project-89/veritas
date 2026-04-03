import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { readFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A confirmed account on a specific platform */
export interface DiscoveredAccount {
  platform: string;
  url: string;
  username: string;
}

/** Result of cross-platform identity resolution for one username */
export interface IdentityResolutionResult {
  queriedUsername: string;
  accounts: DiscoveredAccount[];
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
  private readonly cache = new Map<string, { result: IdentityResolutionResult; timestamp: number }>();
  private readonly cacheTTL = 3600000; // 1 hour

  constructor() {
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
  async resolveIdentity(username: string): Promise<IdentityResolutionResult> {
    const cleanUsername = username.replace(/^@/, '').replace(/^u\//, '');

    // Check cache
    const cached = this.cache.get(cleanUsername);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      this.logger.debug(`Cache hit for "${cleanUsername}"`);
      return cached.result;
    }

    const start = Date.now();
    this.logger.log(`Resolving cross-platform identity for "${cleanUsername}"...`);

    const accounts = await this.runSherlock(cleanUsername);
    const relevantAccounts = accounts.filter((a) =>
      RELEVANT_PLATFORMS.has(a.platform),
    );

    const result: IdentityResolutionResult = {
      queriedUsername: cleanUsername,
      accounts,
      relevantAccounts,
      totalFound: accounts.length,
      searchDuration: Date.now() - start,
    };

    // Cache result
    this.cache.set(cleanUsername, { result, timestamp: Date.now() });

    this.logger.log(
      `Found ${accounts.length} accounts for "${cleanUsername}" ` +
      `(${relevantAccounts.length} relevant) in ${result.searchDuration}ms`,
    );

    return result;
  }

  /**
   * Batch resolve multiple usernames.
   * Processes sequentially to avoid overwhelming Sherlock / rate limits.
   */
  async batchResolve(
    usernames: string[],
  ): Promise<Map<string, IdentityResolutionResult>> {
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

      await this.exec(this.sherlockPath, [
        username,
        '--csv',
        '--output', outputFile,
        '--timeout', String(this.timeout),
        '--print-found',
      ], 120000); // 2 min max total

      // Parse CSV output
      const csvContent = await readFile(outputFile, 'utf-8').catch(() => '');
      return this.parseCsvOutput(csvContent, username);
    } catch (err) {
      this.logger.error(`Sherlock execution failed for "${username}": ${err}`);
      return [];
    } finally {
      // Cleanup temp directory
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private parseCsvOutput(csv: string, username: string): DiscoveredAccount[] {
    const accounts: DiscoveredAccount[] = [];
    const lines = csv.split('\n').filter((l) => l.trim());

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!;
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
      });
    }

    return accounts;
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

  private exec(
    command: string,
    args: string[],
    timeout = 15000,
  ): Promise<string> {
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
