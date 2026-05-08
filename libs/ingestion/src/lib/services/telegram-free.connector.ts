import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { SocialMediaPost } from '../../types/social-media.types';
import { DataConnector } from '../interfaces/data-connector.interface';
import { SourceNode } from '../schemas';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  maxResults?: number;
}

/**
 * A single message parsed from the Telegram web preview HTML.
 */
interface TelegramMessage {
  id: string;
  text: string;
  datetime: string;
  views: number;
  channel: string;
  channelTitle: string;
}

/**
 * Channel metadata from the Telegram web preview or Bot API.
 */
interface TelegramChannelInfo {
  title: string;
  description: string;
  subscriberCount: number;
  photoUrl: string;
  username: string;
}

/**
 * Curated list of OSINT / crypto / geopolitical Telegram channels.
 * Used when searching across channels for narrative content.
 */
const CURATED_CHANNELS = [
  // Crypto
  'whale_alert_io',
  'cryptonews',
  'defaboratory',
  // Geopolitical OSINT
  'inaboratory',
  'ryaboratory',
  // News
  'bbcnews',
  'reuters',
  'breakingnews',
];

/**
 * API-free Telegram connector using public web preview scraping.
 *
 * Primary method: Parse HTML from `https://t.me/s/{channel_username}` — the
 * public web preview of any Telegram channel. No API key or bot token required.
 *
 * Optional enhancement: When TELEGRAM_BOT_TOKEN is set, uses the Telegram Bot
 * API for richer metadata (subscriber counts, channel descriptions).
 */
@Injectable()
export class TelegramFreeConnector implements DataConnector, OnModuleInit, OnModuleDestroy {
  platform = 'telegram' as const;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 600000; // 10 minutes
  private readonly logger = new Logger(TelegramFreeConnector.name);
  private botToken: string | undefined;
  private available = false;
  private readonly fetchTimeout = 15000; // 15s per request
  private readonly maxRetries = 2;

  constructor(
    private configService: ConfigService,
    private transformService: TransformOnIngestService,
  ) {
    this.botToken =
      this.configService.get<string>('TELEGRAM_BOT_TOKEN') || process.env['TELEGRAM_BOT_TOKEN'];
  }

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    // Test that we can reach Telegram's web preview
    try {
      const res = await this.fetchWithRetry('https://t.me/s/telegram', {
        timeout: this.fetchTimeout,
      });
      if (res.ok) {
        this.available = true;
        this.logger.log('Telegram web preview is reachable');
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (error) {
      throw new Error(
        `Cannot reach Telegram web preview: ${error}. ` +
          'Ensure outbound HTTPS to t.me is allowed.',
      );
    }
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
    this.logger.log(`Transformed ${insights.length} Telegram results into insights`);
    return insights;
  }

  async searchWithRawData(
    query: string,
    options?: SearchOptions,
  ): Promise<{ posts: SocialMediaPost[]; insights: NarrativeInsight[] }> {
    const posts = await this.searchContent(query, options);
    if (posts.length === 0) return { posts: [], insights: [] };
    const insights = await this.transformService.transformBatch(posts);
    this.logger.log(`Telegram: ${posts.length} posts, ${insights.length} insights`);
    return { posts, insights };
  }

  streamAndTransform(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const poll = async () => {
      try {
        const posts = await this.searchContent(keywords.join(' '), {
          limit: 10,
        });
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
    try {
      const channel = authorId.replace(/^@/, '');
      const info = await this.fetchChannelInfo(channel);

      return {
        id: channel,
        name: info.title || channel,
        platform: this.platform,
        url: `https://t.me/${channel}`,
        description: info.description,
        credibilityScore: this.estimateCredibilityScore(info),
        verificationStatus: 'unverified',
        metadata: {
          subscriberCount: info.subscriberCount,
          photoUrl: info.photoUrl,
          username: info.username,
        },
      } as Partial<SourceNode>;
    } catch (error) {
      this.logger.error('Error fetching Telegram channel details:', error);
      throw error;
    }
  }

  /**
   * Fetch recent messages from a specific Telegram channel.
   */
  async getUserTimeline(
    username: string,
    options?: { limit?: number },
  ): Promise<SocialMediaPost[]> {
    const limit = options?.limit ?? 50;
    const channel = username.replace(/^@/, '');

    try {
      const messages = await this.fetchChannelMessages(channel);
      return messages.slice(0, limit).map((m) => this.transformToSocialMediaPost(m));
    } catch (error) {
      this.logger.debug(`Timeline fetch failed for @${channel}:`, error);
      return [];
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const res = await this.fetchWithRetry('https://t.me/s/telegram', {
        timeout: this.fetchTimeout,
      });

      if (res.ok) {
        this.available = true;
        this.logger.log('Telegram connector validated (web preview reachable)');

        if (this.botToken) {
          this.logger.log('TELEGRAM_BOT_TOKEN is set — enhanced metadata available');
        } else {
          this.logger.debug(
            'No TELEGRAM_BOT_TOKEN — using web preview only (still fully functional)',
          );
        }

        return true;
      }

      this.logger.debug('Telegram web preview unreachable — connector disabled');
      return false;
    } catch {
      this.logger.debug('Cannot reach Telegram — connector disabled');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async searchContent(query: string, options?: SearchOptions): Promise<SocialMediaPost[]> {
    if (!this.available) return [];

    const limit = options?.maxResults || options?.limit || 20;
    const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);

    try {
      // Fetch messages from all curated channels in parallel
      const channelResults = await Promise.allSettled(
        CURATED_CHANNELS.map((ch) => this.fetchChannelMessages(ch)),
      );

      let allMessages: TelegramMessage[] = [];
      for (const result of channelResults) {
        if (result.status === 'fulfilled') {
          allMessages.push(...result.value);
        }
      }

      // Filter by keywords
      if (keywords.length > 0) {
        allMessages = allMessages.filter((msg) => {
          const text = msg.text.toLowerCase();
          return keywords.some((kw) => text.includes(kw));
        });
      }

      // Date filter
      if (options?.startDate || options?.endDate) {
        const start = options?.startDate?.getTime() ?? 0;
        const end = options?.endDate?.getTime() ?? Date.now();
        allMessages = allMessages.filter((msg) => {
          const ts = new Date(msg.datetime).getTime();
          return ts >= start && ts <= end;
        });
      }

      // Sort by date descending
      allMessages.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());

      return allMessages.slice(0, limit).map((m) => this.transformToSocialMediaPost(m));
    } catch (error) {
      this.logger.error('Error searching Telegram:', error);
      return [];
    }
  }

  /**
   * Fetch recent messages from a Telegram channel's public web preview.
   * Parses HTML from `https://t.me/s/{channel}`.
   */
  private async fetchChannelMessages(channel: string): Promise<TelegramMessage[]> {
    const url = `https://t.me/s/${channel}`;

    try {
      const res = await this.fetchWithRetry(url, {
        timeout: this.fetchTimeout,
      });

      if (!res.ok) {
        this.logger.debug(`Failed to fetch channel ${channel}: HTTP ${res.status}`);
        return [];
      }

      const html = await res.text();
      return this.parseChannelHtml(html, channel);
    } catch (error) {
      this.logger.debug(`Error fetching channel ${channel}:`, error);
      return [];
    }
  }

  /**
   * Parse the Telegram web preview HTML to extract messages.
   *
   * The HTML structure uses `tgme_widget_message` containers with:
   * - `data-post="{channel}/{id}"` for the message ID
   * - `.tgme_widget_message_text` for message text
   * - `.tgme_widget_message_date time[datetime]` for timestamp
   * - `.tgme_widget_message_views` for view count
   * - Page title contains channel name
   */
  private parseChannelHtml(html: string, channel: string): TelegramMessage[] {
    const messages: TelegramMessage[] = [];

    // Extract channel title from page
    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"[^>]*>/i);
    const channelTitle = titleMatch ? this.decodeHtmlEntities(titleMatch[1] ?? '') : channel;

    // Use a more reliable chunked approach
    const chunks = html.split('tgme_widget_message_wrap');

    for (let i = 1; i < chunks.length; i++) {
      const chunk = chunks[i] ?? '';

      // Extract message ID from data-post
      const postMatch = chunk.match(/data-post="([^"]+)"/);
      if (!postMatch) continue;

      const dataPost = postMatch[1] ?? '';
      const parts = dataPost.split('/');
      const msgId = parts[parts.length - 1] ?? '';

      // Extract text content
      const textMatch = chunk.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/);
      const rawText = textMatch ? (textMatch[1] ?? '') : '';
      const text = this.stripHtml(rawText);

      if (!text.trim()) continue;

      // Extract datetime
      const dateMatch = chunk.match(/<time[^>]*datetime="([^"]*)"/);
      const datetime = dateMatch ? (dateMatch[1] ?? '') : new Date().toISOString();

      // Extract view count
      const viewMatch = chunk.match(/tgme_widget_message_views[^>]*>([\s\S]*?)<\/span>/);
      const viewStr = viewMatch ? (viewMatch[1] ?? '').trim() : '0';
      const views = this.parseViewCount(viewStr);

      messages.push({
        id: `${channel}_${msgId}`,
        text,
        datetime,
        views,
        channel,
        channelTitle,
      });
    }

    return messages;
  }

  /**
   * Fetch channel info. Uses Bot API if token is available, otherwise
   * scrapes the web preview for basic metadata.
   */
  private async fetchChannelInfo(channel: string): Promise<TelegramChannelInfo> {
    // Try Bot API first if token is available
    if (this.botToken) {
      try {
        return await this.fetchChannelInfoFromBotApi(channel);
      } catch {
        this.logger.debug(`Bot API failed for ${channel}, falling back to web preview`);
      }
    }

    // Fallback: scrape web preview
    return this.fetchChannelInfoFromWeb(channel);
  }

  private async fetchChannelInfoFromBotApi(channel: string): Promise<TelegramChannelInfo> {
    const url = `https://api.telegram.org/bot${this.botToken}/getChat?chat_id=@${channel}`;
    const res = await this.fetchWithRetry(url, { timeout: this.fetchTimeout });

    if (!res.ok) {
      throw new Error(`Bot API returned HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      ok: boolean;
      result?: {
        title?: string;
        description?: string;
        photo?: { big_file_id?: string };
        username?: string;
      };
    };

    if (!data.ok || !data.result) {
      throw new Error('Bot API returned error');
    }

    const chat = data.result;
    // Bot API getChatMemberCount for subscriber count
    let subscriberCount = 0;
    try {
      const countRes = await this.fetchWithRetry(
        `https://api.telegram.org/bot${this.botToken}/getChatMemberCount?chat_id=@${channel}`,
        { timeout: this.fetchTimeout },
      );
      if (countRes.ok) {
        const countData = (await countRes.json()) as {
          ok: boolean;
          result?: number;
        };
        subscriberCount = countData.result ?? 0;
      }
    } catch {
      // Subscriber count is optional
    }

    return {
      title: chat.title ?? channel,
      description: chat.description ?? '',
      subscriberCount,
      photoUrl: '',
      username: chat.username ?? channel,
    };
  }

  private async fetchChannelInfoFromWeb(channel: string): Promise<TelegramChannelInfo> {
    const url = `https://t.me/s/${channel}`;
    const res = await this.fetchWithRetry(url, { timeout: this.fetchTimeout });

    if (!res.ok) {
      return {
        title: channel,
        description: '',
        subscriberCount: 0,
        photoUrl: '',
        username: channel,
      };
    }

    const html = await res.text();

    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"[^>]*>/i);
    const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]*)"[^>]*>/i);
    const imgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"[^>]*>/i);

    // Try to extract subscriber count from the page
    const subsMatch = html.match(/tgme_page_extra[^>]*>([\s\S]*?)<\/div>/);
    let subscriberCount = 0;
    if (subsMatch) {
      const subsText = (subsMatch[1] ?? '').trim();
      const numMatch = subsText.match(/([\d\s]+)\s*(?:members|subscribers)/i);
      if (numMatch) {
        subscriberCount = parseInt((numMatch[1] ?? '0').replace(/\s/g, ''), 10) || 0;
      }
    }

    return {
      title: titleMatch ? this.decodeHtmlEntities(titleMatch[1] ?? '') : channel,
      description: descMatch ? this.decodeHtmlEntities(descMatch[1] ?? '') : '',
      subscriberCount,
      photoUrl: imgMatch ? (imgMatch[1] ?? '') : '',
      username: channel,
    };
  }

  private transformToSocialMediaPost(msg: TelegramMessage): SocialMediaPost {
    return {
      id: msg.id,
      text: msg.text,
      platform: this.platform,
      authorId: msg.channel,
      authorName: msg.channelTitle,
      authorHandle: msg.channel,
      url: `https://t.me/${msg.channel}/${msg.id.split('_').pop() ?? ''}`,
      timestamp: new Date(msg.datetime),
      engagementMetrics: {
        likes: 0,
        shares: 0, // forwards not available in web preview
        comments: 0,
        reach: msg.views,
        viralityScore: this.calculateViralityScore(msg.views),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Utility methods
  // ---------------------------------------------------------------------------

  /**
   * fetch() wrapper with timeout and retry.
   */
  private async fetchWithRetry(url: string, options?: { timeout?: number }): Promise<Response> {
    const timeout = options?.timeout ?? this.fetchTimeout;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });

        clearTimeout(timer);
        return res;
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.maxRetries) {
          // Exponential backoff: 1s, 2s
          await this.sleep(1000 * (attempt + 1));
        }
      }
    }

    throw lastError ?? new Error(`Failed to fetch ${url}`);
  }

  /** Strip HTML tags and decode entities */
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
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** Decode basic HTML entities */
  private decodeHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  /**
   * Parse view count strings like "1.2K", "3.5M", "850".
   */
  private parseViewCount(str: string): number {
    const cleaned = str.trim().toUpperCase();
    if (!cleaned || cleaned === '0') return 0;

    const match = cleaned.match(/^([\d.]+)\s*([KMB]?)$/);
    if (!match) return 0;

    const num = parseFloat(match[1] ?? '0');
    const suffix = match[2] ?? '';

    switch (suffix) {
      case 'K':
        return Math.round(num * 1000);
      case 'M':
        return Math.round(num * 1000000);
      case 'B':
        return Math.round(num * 1000000000);
      default:
        return Math.round(num);
    }
  }

  private calculateViralityScore(views: number): number {
    if (views === 0) return 0;
    return Math.min(Math.log10(views + 1) / 6, 1);
  }

  private estimateCredibilityScore(info: TelegramChannelInfo): number {
    let score = 0.1;
    const subs = info.subscriberCount;
    if (subs > 1000000) score += 0.4;
    else if (subs > 100000) score += 0.3;
    else if (subs > 10000) score += 0.2;
    else if (subs > 1000) score += 0.1;

    // Known news channels get a boost
    if (info.description && info.description.length > 50) score += 0.1;

    return Math.min(score, 1.0);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
