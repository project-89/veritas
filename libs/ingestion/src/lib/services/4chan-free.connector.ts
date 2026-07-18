import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'events';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { PostMedia, SocialMediaPost } from '../../types/social-media.types';
import { DataConnector } from '../interfaces/data-connector.interface';
import { SourceNode } from '../schemas';
import { extractSignificantTerms, matchesQuery } from '../utils/query-match.util';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { SourceRateLimiter } from './utils/source-rate-limiter';

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  maxResults?: number;
}

/** 4chan thread from catalog.json */
interface ChanThread {
  no: number;
  now?: string;
  name?: string;
  sub?: string;
  com?: string;
  time: number;
  replies?: number;
  images?: number;
  /** OP attachment: renamed-file timestamp id + extension (e.g. ".jpg", ".webm"). */
  tim?: number;
  ext?: string;
}

const CHAN_VIDEO_EXTS = new Set(['.webm', '.mp4']);

/** OP attachment as PostMedia (files are served from i.4cdn.org). */
function extractChanMedia(thread: ChanThread, board: string): PostMedia[] {
  if (!thread.tim || !thread.ext) return [];
  return [
    {
      type: CHAN_VIDEO_EXTS.has(thread.ext) ? 'video' : 'image',
      url: `https://i.4cdn.org/${board}/${thread.tim}${thread.ext}`,
    },
  ];
}

interface CatalogPage {
  page: number;
  threads: ChanThread[];
}

/** Boards relevant for intelligence gathering */
const INTEL_BOARDS = ['pol', 'biz', 'news', 'int'] as const;

/**
 * API-free 4chan connector using the public JSON API.
 * No authentication required.
 * Rate limit: max 1 request per second per 4chan guidelines.
 *
 * API docs: https://github.com/4chan/4chan-API
 */
@Injectable()
export class FourChanFreeConnector implements DataConnector, OnModuleInit, OnModuleDestroy {
  platform = '4chan' as const;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 600000; // 10 minutes
  private readonly logger = new Logger(FourChanFreeConnector.name);

  constructor(private transformService: TransformOnIngestService) {}

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    this.logger.log('4chan public API connector ready (no auth needed)');
  }

  async disconnect(): Promise<void> {
    this.streamConnections.forEach((interval) => {
      clearInterval(interval);
    });
    this.streamConnections.clear();
  }

  async searchAndTransform(query: string, options?: SearchOptions): Promise<NarrativeInsight[]> {
    const posts = await this.searchContent(query, options);
    const insights = await this.transformService.transformBatch(posts);
    this.logger.log(`Transformed ${insights.length} 4chan results into insights`);
    return insights;
  }

  async searchWithRawData(
    query: string,
    options?: SearchOptions,
  ): Promise<{ posts: SocialMediaPost[]; insights: NarrativeInsight[] }> {
    const posts = await this.searchContent(query, options);
    if (posts.length === 0) return { posts: [], insights: [] };
    const insights = await this.transformService.transformBatch(posts);
    this.logger.log(`4chan: ${posts.length} posts, ${insights.length} insights`);
    return { posts, insights };
  }

  streamAndTransform(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const poll = async () => {
      try {
        const posts = await this.searchContent(keywords.join(' '), { limit: 10 });
        if (posts.length > 0) {
          const insights = await this.transformService.transformBatch(posts);
          for (const insight of insights) {
            emitter.emit('data', insight);
          }
        }
      } catch (error) {
        emitter.emit('error', error);
      }
    };

    void poll();
    const interval = setInterval(poll, this.pollingInterval);
    interval.unref?.();
    this.streamConnections.set(streamId, interval);

    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(streamId);
    });

    return emitter;
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    void authorId;
    // 4chan is anonymous — no author details available
    return {
      name: 'Anonymous',
      platform: this.platform,
      credibilityScore: 0.1,
      verificationStatus: 'unverified',
    } as Partial<SourceNode>;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const response = await fetch('https://a.4cdn.org/boards.json', {
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        this.logger.log('4chan public API connector validated');
        return true;
      }
      this.logger.warn(`4chan API returned HTTP ${response.status}`);
      return false;
    } catch {
      this.logger.debug('4chan API not reachable');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  async searchContent(query: string, options?: SearchOptions): Promise<SocialMediaPost[]> {
    const limit = options?.maxResults || options?.limit || 25;

    // No significant query terms (empty or all stopwords) — nothing to match
    // against a board-wide catalog, so return nothing rather than everything.
    if (extractSignificantTerms(query).length === 0) return [];

    const allThreads: Array<{ thread: ChanThread; board: string }> = [];
    const failures: string[] = [];

    for (const board of INTEL_BOARDS) {
      try {
        const url = `https://a.4cdn.org/${board}/catalog.json`;
        const catalog = await this.fetchJson<CatalogPage[]>(url);

        if (!Array.isArray(catalog)) continue;

        for (const page of catalog) {
          if (!Array.isArray(page.threads)) continue;
          for (const thread of page.threads) {
            const subject = thread.sub ?? '';
            const comment = this.stripHtml(thread.com ?? '');
            const text = `${subject} ${comment}`;

            // Word-boundary, stopword-aware match so an "AI" query doesn't pull
            // in every /biz/ thread mentioning "blockchain" or "chain".
            if (matchesQuery(text, query)) {
              allThreads.push({ thread, board });
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(message);
        this.logger.warn(`4chan catalog fetch failed for /${board}/: ${message}`);
      }
    }

    // Total failure: every board catalog fetch errored — fail loudly instead
    // of reporting a misleading "0 results".
    if (failures.length === INTEL_BOARDS.length) {
      throw new Error(
        `4chan search failed: all ${INTEL_BOARDS.length} board catalogs failed: ${failures[0]}`,
      );
    }

    // Sort by time descending (newest first)
    allThreads.sort((a, b) => b.thread.time - a.thread.time);

    // Date filter
    let filtered = allThreads;
    if (options?.startDate || options?.endDate) {
      const start = options?.startDate?.getTime() ?? 0;
      const end = options?.endDate?.getTime() ?? Date.now();
      filtered = allThreads.filter((t) => {
        const ts = t.thread.time * 1000;
        return ts >= start && ts <= end;
      });
    }

    return filtered.slice(0, limit).map((t) => this.transformToSocialMediaPost(t.thread, t.board));
  }

  private transformToSocialMediaPost(thread: ChanThread, board: string): SocialMediaPost {
    const text = thread.sub
      ? `${thread.sub}\n${this.stripHtml(thread.com ?? '')}`
      : this.stripHtml(thread.com ?? '');

    return {
      id: `${board}-${thread.no}`,
      text: text.slice(0, 2000),
      platform: this.platform,
      authorId: 'anonymous',
      authorName: thread.name || 'Anonymous',
      authorHandle: 'Anonymous',
      url: `https://boards.4chan.org/${board}/thread/${thread.no}`,
      timestamp: new Date(thread.time * 1000),
      media: extractChanMedia(thread, board),
      engagementMetrics: {
        likes: 0,
        shares: thread.images ?? 0,
        comments: thread.replies ?? 0,
        reach: 0,
        viralityScore: this.calculateViralityScore(thread),
      },
    };
  }

  private async fetchJson<T>(url: string): Promise<T> {
    // The shared limiter enforces 4chan's max 1 request/second guideline.
    return SourceRateLimiter.instance.schedule('4chan', async () => {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        if (response.status === 429) {
          SourceRateLimiter.instance.notifyRateLimited(
            '4chan',
            SourceRateLimiter.retryAfterMsFrom(response.headers),
          );
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as T;
    });
  }

  /** Strip HTML tags and decode common entities. */
  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private calculateViralityScore(thread: ChanThread): number {
    const total = (thread.replies ?? 0) + (thread.images ?? 0);
    if (total === 0) return 0;
    return Math.min(Math.log10(total + 1) / 4, 1);
  }
}
