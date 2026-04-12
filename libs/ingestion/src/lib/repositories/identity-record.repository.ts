import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService, Repository } from '@veritas/database';
import { randomUUID } from 'crypto';
import {
  IdentityRecordModel,
  type IdentityRecord,
  type InvestigationSnapshot,
  type ObservedPost,
  type PlatformAccount,
  type ProfileImage,
  type PsychologicalProfile,
} from '../schemas/identity-record.schema';

@Injectable()
export class IdentityRecordRepository implements OnModuleInit {
  private readonly logger = new Logger(IdentityRecordRepository.name);
  private static readonly MAX_OBSERVED_POSTS = 600;
  private repo!: Repository<IdentityRecord>;
  private initialized = false;

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    this.initializeRepositories();
  }

  private initializeRepositories() {
    try {
      try {
        this.databaseService.registerModel('IdentityRecord', IdentityRecordModel);
      } catch {
        // Already registered
      }
      this.repo = this.databaseService.getRepository<IdentityRecord>('IdentityRecord');
      this.initialized = true;
      this.logger.log('IdentityRecord repository initialized');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to initialize: ${err.message}`, err.stack);
    }
  }

  private ensureInitialized() {
    if (!this.initialized) {
      try { this.initializeRepositories(); } catch { /* swallow */ }
    }
    if (!this.initialized) {
      throw new Error('IdentityRecordRepository not initialized');
    }
  }

  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------

  async findByHandle(handle: string, platform: string): Promise<IdentityRecord | null> {
    this.ensureInitialized();
    try {
      const results = await this.repo.find(
        { primaryHandle: handle.toLowerCase(), primaryPlatform: platform } as Record<string, unknown>,
        { limit: 1 },
      );
      return results[0] ?? null;
    } catch {
      return null;
    }
  }

  async findById(id: string): Promise<IdentityRecord | null> {
    this.ensureInitialized();
    try {
      return await this.repo.findById(id);
    } catch {
      return null;
    }
  }

  async findByClusterId(clusterId: string): Promise<IdentityRecord[]> {
    this.ensureInitialized();
    return this.repo.find(
      { identityClusterId: clusterId } as Record<string, unknown>,
      {},
    );
  }

  async search(query: string, limit = 20): Promise<IdentityRecord[]> {
    this.ensureInitialized();
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return this.repo.find(
      { primaryHandle: { $regex: regex } } as Record<string, unknown>,
      { limit, sort: { lastInvestigatedAt: -1 } },
    );
  }

  async getRecentlyInvestigated(limit = 20): Promise<IdentityRecord[]> {
    this.ensureInitialized();
    return this.repo.find(
      {} as Record<string, unknown>,
      { limit, sort: { lastInvestigatedAt: -1 } },
    );
  }

  // -------------------------------------------------------------------------
  // Upsert from investigation
  // -------------------------------------------------------------------------

  async upsertFromInvestigation(params: {
    handle: string;
    platform: string;
    displayName?: string;
    snapshot: InvestigationSnapshot;
    authorProfile?: {
      followersCount?: number | null;
      followingCount?: number | null;
      postsCount?: number | null;
      isVerified?: boolean;
      bio?: string | null;
      joinDate?: string | null;
    } | null;
    sherlockAccounts?: PlatformAccount[];
    profileImageUrl?: string | null;
    bannerImageUrl?: string | null;
    credibilityScore?: number | null;
    botProbability?: number | null;
    flags?: string[];
    observedPosts?: ObservedPost[];
  }): Promise<IdentityRecord> {
    this.ensureInitialized();

    const handle = params.handle.toLowerCase();
    const existing = await this.findByHandle(handle, params.platform);

    if (existing) {
      return this.enrichExisting(existing, params);
    }

    return this.createNew(params);
  }

  private async createNew(params: {
    handle: string;
    platform: string;
    displayName?: string;
    snapshot: InvestigationSnapshot;
    authorProfile?: Record<string, unknown> | null;
    sherlockAccounts?: PlatformAccount[];
    profileImageUrl?: string | null;
    bannerImageUrl?: string | null;
    credibilityScore?: number | null;
    botProbability?: number | null;
    flags?: string[];
    observedPosts?: ObservedPost[];
  }): Promise<IdentityRecord> {
    const handle = params.handle.toLowerCase();
    const now = new Date();

    const platformAccounts: PlatformAccount[] = [
      {
        platform: params.platform,
        handle,
        url: '',
        discoveredAt: now,
        discoveryMethod: 'investigation',
        discoveryTier: 'actionable',
        verified: true,
      },
      ...(params.sherlockAccounts ?? []),
    ];

    const profileImages: ProfileImage[] = [];
    if (params.profileImageUrl) {
      profileImages.push({ url: params.profileImageUrl, platform: params.platform, capturedAt: now, isCurrent: true });
    }

    const bannerImages: ProfileImage[] = [];
    if (params.bannerImageUrl) {
      bannerImages.push({ url: params.bannerImageUrl, platform: params.platform, capturedAt: now, isCurrent: true });
    }

    const record = await this.repo.create({
      primaryHandle: handle,
      primaryPlatform: params.platform,
      displayName: params.displayName ?? null,
      platformAccounts,
      identityClusterId: null,
      linkedIdentityIds: [],
      authorProfile: params.authorProfile as IdentityRecord['authorProfile'] ?? null,
      profileImages,
      bannerImages,
      currentCredibility: params.credibilityScore ?? null,
      currentBotProbability: params.botProbability ?? null,
      credibilityHistory: params.credibilityScore != null
        ? [{ value: params.credibilityScore, timestamp: now, investigationQuery: params.snapshot.query }]
        : [],
      botProbabilityHistory: params.botProbability != null
        ? [{ value: params.botProbability, timestamp: now, investigationQuery: params.snapshot.query }]
        : [],
      investigations: [params.snapshot],
      totalInvestigations: 1,
      firstInvestigatedAt: now,
      lastInvestigatedAt: now,
      psychologicalProfile: null,
      profileGenerationStatus: 'none',
      observedPosts: this.mergeObservedPostLists([], params.observedPosts ?? []),
      aggregatedFlags: params.flags ?? [],
      totalPostsAnalyzed: params.snapshot.postCount,
    } as Partial<IdentityRecord>);

    this.logger.log(`Created identity record for @${handle} [${params.platform}]`);
    return record;
  }

  private async enrichExisting(
    existing: IdentityRecord,
    params: {
      handle: string;
      platform: string;
      displayName?: string;
      snapshot: InvestigationSnapshot;
      authorProfile?: Record<string, unknown> | null;
      sherlockAccounts?: PlatformAccount[];
      profileImageUrl?: string | null;
      bannerImageUrl?: string | null;
      credibilityScore?: number | null;
      botProbability?: number | null;
      flags?: string[];
      observedPosts?: ObservedPost[];
    },
  ): Promise<IdentityRecord> {
    const id = existing._id?.toString() ?? existing.id;
    const now = new Date();

    // Merge platform accounts (deduplicate by platform + handle)
    const existingAccountKeys = new Set(
      existing.platformAccounts.map((a) => `${a.platform}:${a.handle}`),
    );
    const newAccounts = (params.sherlockAccounts ?? []).filter(
      (a) => !existingAccountKeys.has(`${a.platform}:${a.handle}`),
    );

    // Update profile images (mark old as not current, add new)
    const profileImages = [...existing.profileImages];
    if (params.profileImageUrl) {
      const existingUrl = profileImages.find((img) => img.isCurrent && img.platform === params.platform);
      if (!existingUrl || existingUrl.url !== params.profileImageUrl) {
        profileImages.forEach((img) => { if (img.platform === params.platform) img.isCurrent = false; });
        profileImages.push({ url: params.profileImageUrl, platform: params.platform, capturedAt: now, isCurrent: true });
      }
    }

    const bannerImages = [...existing.bannerImages];
    if (params.bannerImageUrl) {
      const existingBanner = bannerImages.find((img) => img.isCurrent && img.platform === params.platform);
      if (!existingBanner || existingBanner.url !== params.bannerImageUrl) {
        bannerImages.forEach((img) => { if (img.platform === params.platform) img.isCurrent = false; });
        bannerImages.push({ url: params.bannerImageUrl, platform: params.platform, capturedAt: now, isCurrent: true });
      }
    }

    // Merge flags (deduplicate)
    const allFlags = new Set([...existing.aggregatedFlags, ...(params.flags ?? [])]);

    const update: Partial<IdentityRecord> = {
      displayName: params.displayName ?? existing.displayName,
      platformAccounts: [...existing.platformAccounts, ...newAccounts],
      authorProfile: params.authorProfile as IdentityRecord['authorProfile'] ?? existing.authorProfile,
      profileImages,
      bannerImages,
      currentCredibility: params.credibilityScore ?? existing.currentCredibility,
      currentBotProbability: params.botProbability ?? existing.currentBotProbability,
      credibilityHistory: params.credibilityScore != null
        ? [...existing.credibilityHistory, { value: params.credibilityScore, timestamp: now, investigationQuery: params.snapshot.query }]
        : existing.credibilityHistory,
      botProbabilityHistory: params.botProbability != null
        ? [...existing.botProbabilityHistory, { value: params.botProbability, timestamp: now, investigationQuery: params.snapshot.query }]
        : existing.botProbabilityHistory,
      investigations: [...existing.investigations, params.snapshot],
      totalInvestigations: existing.totalInvestigations + 1,
      lastInvestigatedAt: now,
      observedPosts: this.mergeObservedPostLists(existing.observedPosts ?? [], params.observedPosts ?? []),
      aggregatedFlags: Array.from(allFlags),
      totalPostsAnalyzed: existing.totalPostsAnalyzed + params.snapshot.postCount,
    };

    await this.repo.updateById(id, update);
    this.logger.log(`Enriched identity record for @${params.handle} (investigation #${existing.totalInvestigations + 1})`);

    return { ...existing, ...update } as IdentityRecord;
  }

  // -------------------------------------------------------------------------
  // Profile management
  // -------------------------------------------------------------------------

  async updatePsychologicalProfile(
    id: string,
    profile: PsychologicalProfile,
  ): Promise<void> {
    this.ensureInitialized();
    await this.repo.updateById(id, {
      psychologicalProfile: profile,
      profileGenerationStatus: 'complete',
    } as Partial<IdentityRecord>);
  }

  async updateProfileStatus(id: string, status: string): Promise<void> {
    this.ensureInitialized();
    await this.repo.updateById(id, {
      profileGenerationStatus: status,
    } as Partial<IdentityRecord>);
  }

  // -------------------------------------------------------------------------
  // Historical post archive
  // -------------------------------------------------------------------------

  async mergeObservedPostsByHandle(
    handle: string,
    platform: string,
    posts: ObservedPost[],
  ): Promise<void> {
    this.ensureInitialized();
    const record = await this.findByHandle(handle.toLowerCase(), platform);
    if (!record || posts.length === 0) return;

    const id = record._id?.toString() ?? record.id;
    await this.repo.updateById(id, {
      observedPosts: this.mergeObservedPostLists(record.observedPosts ?? [], posts),
    } as Partial<IdentityRecord>);
  }

  // -------------------------------------------------------------------------
  // Platform account management (Sherlock persistence)
  // -------------------------------------------------------------------------

  async updatePlatformAccounts(
    id: string,
    accounts: PlatformAccount[],
    sherlockResolvedAt: Date,
  ): Promise<void> {
    this.ensureInitialized();
    await this.repo.updateById(id, {
      platformAccounts: accounts,
    } as Partial<IdentityRecord>);
    this.logger.debug(`Updated platform accounts for identity ${id} (${accounts.length} total, Sherlock at ${sherlockResolvedAt.toISOString()})`);
  }

  // -------------------------------------------------------------------------
  // Timeline caching
  // -------------------------------------------------------------------------

  /**
   * Get cached timeline posts if they exist and are within maxAgeMs.
   */
  async getCachedTimeline(
    handle: string,
    platform: string,
    maxAgeMs: number,
    minPosts = 1,
  ): Promise<Array<{
    text: string;
    timestamp: string;
    platform: string;
    url?: string;
    engagement: { likes: number; comments: number; shares: number };
    sentiment: { score: number; label: string };
  }> | null> {
    this.ensureInitialized();
    try {
      const record = await this.findByHandle(handle, platform);
      if (!record?.cachedTimeline) return null;

      const fetchedAt = new Date(record.cachedTimeline.fetchedAt).getTime();
      const age = Date.now() - fetchedAt;
      if (age > maxAgeMs) {
        this.logger.debug(
          `Timeline cache expired for @${handle} (age: ${Math.round(age / 3600000)}h, max: ${Math.round(maxAgeMs / 3600000)}h)`,
        );
        return null;
      }

      if (record.cachedTimeline.posts.length < minPosts) {
        this.logger.debug(
          `Timeline cache for @${handle} only has ${record.cachedTimeline.posts.length} posts, need ${minPosts}`,
        );
        return null;
      }

      this.logger.debug(`Timeline cache hit for @${handle} (${record.cachedTimeline.posts.length} posts)`);
      return record.cachedTimeline.posts as Array<{
        text: string;
        timestamp: string;
        platform: string;
        url?: string;
        engagement: { likes: number; comments: number; shares: number };
        sentiment: { score: number; label: string };
      }>;
    } catch {
      return null;
    }
  }

  /**
   * Cache timeline posts on the identity record.
   */
  async setCachedTimeline(
    handle: string,
    platform: string,
    posts: Array<{
      text: string;
      timestamp: string;
      platform: string;
      url?: string;
      engagement: { likes: number; comments: number; shares: number };
      sentiment: { score: number; label: string };
    }>,
    platforms: string[],
  ): Promise<void> {
    this.ensureInitialized();
    try {
      const record = await this.findByHandle(handle, platform);
      if (!record) {
        this.logger.debug(`No identity record for @${handle} — skipping timeline cache`);
        return;
      }

      const id = record._id?.toString() ?? record.id;
      await this.repo.updateById(id, {
        cachedTimeline: {
          posts,
          fetchedAt: new Date().toISOString(),
          platforms,
        },
        observedPosts: this.mergeObservedPostLists(
          record.observedPosts ?? [],
          posts.map((post) => ({
            ...post,
            sourceKind: 'timeline',
            capturedAt: new Date(),
          })),
        ),
      } as Partial<IdentityRecord>);

      this.logger.debug(`Cached ${posts.length} timeline posts for @${handle}`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error caching timeline for @${handle}: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Identity linking
  // -------------------------------------------------------------------------

  async linkIdentities(idA: string, idB: string): Promise<string> {
    this.ensureInitialized();

    const recordA = await this.repo.findById(idA);
    const recordB = await this.repo.findById(idB);
    if (!recordA || !recordB) throw new Error('One or both identity records not found');

    // Use existing cluster ID or generate a new one
    const clusterId = recordA.identityClusterId ?? recordB.identityClusterId ?? randomUUID();

    await this.repo.updateById(idA, {
      identityClusterId: clusterId,
      linkedIdentityIds: [...new Set([...recordA.linkedIdentityIds, idB])],
    } as Partial<IdentityRecord>);

    await this.repo.updateById(idB, {
      identityClusterId: clusterId,
      linkedIdentityIds: [...new Set([...recordB.linkedIdentityIds, idA])],
    } as Partial<IdentityRecord>);

    this.logger.log(`Linked identities ${idA} <-> ${idB} (cluster: ${clusterId})`);
    return clusterId;
  }

  private mergeObservedPostLists(
    existingPosts: ObservedPost[],
    incomingPosts: ObservedPost[],
  ): ObservedPost[] {
    const merged = new Map<string, ObservedPost>();

    for (const post of [...existingPosts, ...incomingPosts]) {
      const normalized = this.normalizeObservedPost(post);
      const key = this.getObservedPostKey(normalized);
      const prior = merged.get(key);
      if (!prior) {
        merged.set(key, normalized);
        continue;
      }

      merged.set(key, {
        ...prior,
        ...normalized,
        investigationQuery: normalized.investigationQuery ?? prior.investigationQuery ?? null,
        url: normalized.url ?? prior.url ?? null,
      });
    }

    return Array.from(merged.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, IdentityRecordRepository.MAX_OBSERVED_POSTS);
  }

  private normalizeObservedPost(post: ObservedPost): ObservedPost {
    return {
      text: typeof post.text === 'string' ? post.text : '',
      timestamp: typeof post.timestamp === 'string' ? post.timestamp : new Date().toISOString(),
      platform: typeof post.platform === 'string' && post.platform.length > 0 ? post.platform : 'unknown',
      url: typeof post.url === 'string' && post.url.length > 0 ? post.url : null,
      engagement: {
        likes: post.engagement?.likes ?? 0,
        comments: post.engagement?.comments ?? 0,
        shares: post.engagement?.shares ?? 0,
      },
      sentiment: {
        score: post.sentiment?.score ?? 0,
        label: typeof post.sentiment?.label === 'string' ? post.sentiment.label : 'neutral',
      },
      investigationQuery:
        typeof post.investigationQuery === 'string' && post.investigationQuery.length > 0
          ? post.investigationQuery
          : null,
      sourceKind: post.sourceKind === 'timeline' ? 'timeline' : 'investigation',
      capturedAt: post.capturedAt instanceof Date ? post.capturedAt : new Date(),
    };
  }

  private getObservedPostKey(post: ObservedPost): string {
    const normalizedText = post.text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 180);
    const timeBucket = post.timestamp.slice(0, 16);
    return [post.platform, post.url ?? '', timeBucket, normalizedText].join('::');
  }
}
