import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { SocialMediaPost } from '../../types/social-media.types';
import { SourceNode } from '../schemas';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { BaseSocialMediaConnector } from './base-social-media.connector';
import { SubprocessUtil } from './utils/subprocess.util';

interface BirdTweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  author_name: string;
  author_username: string;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  quote_count: number;
  impression_count: number;
  url: string;
}

interface BirdUser {
  id: string;
  name: string;
  username: string;
  followers_count: number;
  following_count: number;
  verified: boolean;
  description: string;
}

/**
 * API-free Twitter/X connector using the bird CLI.
 * Uses browser cookie authentication — no API key needed.
 * Requires: npm install -g @steipete/bird
 * Requires: Browser cookies exported to a file (use Cookie-Editor extension)
 */
@Injectable()
export class TwitterFreeConnector
  extends BaseSocialMediaConnector
  implements OnModuleInit, OnModuleDestroy
{
  override platform = 'twitter' as const;
  private birdPath: string;
  private readonly pollingInterval = 60000;

  constructor(
    protected override readonly configService: ConfigService,
    protected override readonly transformService: TransformOnIngestService,
    private readonly subprocessUtil: SubprocessUtil
  ) {
    super(configService, transformService);
    this.birdPath = this.configService.get<string>('BIRD_CLI_PATH') || 'bird';
  }

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  protected async connectToApi(): Promise<void> {
    const available = await this.subprocessUtil.checkAvailability(
      this.birdPath
    );
    if (!available) {
      throw new Error(
        `bird CLI is not installed or not found at "${this.birdPath}". ` +
          'Install it with: npm install -g @steipete/bird'
      );
    }

    // Verify cookies are valid
    const cookiesValid = await this.checkCredentialsValidity();
    if (!cookiesValid) {
      throw new Error(
        'bird CLI cookies are invalid or expired. ' +
          'Export fresh cookies from your browser using the Cookie-Editor extension.'
      );
    }

    this.logger.log('bird CLI connected with valid cookies');
  }

  protected async disconnectFromApi(): Promise<void> {
    // No persistent connection to close
  }

  protected async checkCredentialsValidity(): Promise<boolean> {
    try {
      const result = await this.subprocessUtil.exec(
        this.birdPath,
        ['whoami'],
        { timeout: 15000 }
      );
      return result.exitCode === 0 && result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async searchContent(
    query: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      [key: string]: unknown;
    }
  ): Promise<SocialMediaPost[]> {
    const limit = options?.limit || 50;

    try {
      const args = ['search', query, '--count', String(limit), '--format', 'json'];

      const result = await this.subprocessUtil.exec(this.birdPath, args, {
        timeout: 30000,
      });

      if (result.exitCode !== 0) {
        throw new Error(`bird search failed: ${result.stderr}`);
      }

      let tweets: BirdTweet[];
      try {
        tweets = JSON.parse(result.stdout);
      } catch {
        // bird may output one tweet per line
        tweets = result.stdout
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line));
      }

      // Filter by date client-side if needed
      let filteredTweets = tweets;
      if (options?.startDate) {
        const start = options.startDate.getTime();
        filteredTweets = filteredTweets.filter(
          (t) => new Date(t.created_at).getTime() >= start
        );
      }
      if (options?.endDate) {
        const end = options.endDate.getTime();
        filteredTweets = filteredTweets.filter(
          (t) => new Date(t.created_at).getTime() <= end
        );
      }

      return filteredTweets.map((tweet) =>
        this.transformTweetToSocialMediaPost(tweet)
      );
    } catch (error) {
      this.logger.error('Error searching Twitter with bird CLI:', error);
      throw error;
    }
  }

  streamContent(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const interval = setInterval(async () => {
      try {
        const posts = await this.searchContent(keywords.join(' OR '), {
          startDate: new Date(Date.now() - 3600000),
          limit: 100,
        });

        const filteredPosts = posts.filter((post) =>
          this.postMatchesKeywords(post, keywords)
        );

        for (const post of filteredPosts) {
          emitter.emit('data', post);
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in Twitter stream:', error);
      }
    }, this.pollingInterval);

    this.streamConnections.set(streamId, interval);

    const wrappedEmitter = Object.assign(emitter, {
      close: () => {
        clearInterval(interval);
        this.streamConnections.delete(streamId);
        emitter.removeAllListeners();
      },
    });

    return wrappedEmitter;
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    try {
      const result = await this.subprocessUtil.exec(
        this.birdPath,
        ['user', authorId, '--format', 'json'],
        { timeout: 15000 }
      );

      if (result.exitCode !== 0) {
        throw new Error(`bird user lookup failed: ${result.stderr}`);
      }

      const user = JSON.parse(result.stdout) as BirdUser;

      return {
        id: user.id,
        name: user.name,
        platform: this.platform,
        url: `https://twitter.com/${user.username}`,
        description: user.description,
        credibilityScore: this.calculateCredibilityScore(user),
        verificationStatus: user.verified ? 'verified' : 'unverified',
        metadata: {
          followersCount: user.followers_count,
          followingCount: user.following_count,
        },
      } as Partial<SourceNode>;
    } catch (error) {
      this.logger.error('Error fetching Twitter author details:', error);
      throw error;
    }
  }

  // --- Private helpers ---

  private transformTweetToSocialMediaPost(tweet: BirdTweet): SocialMediaPost {
    return {
      id: tweet.id,
      text: tweet.text,
      platform: this.platform,
      authorId: tweet.author_id,
      authorName: tweet.author_name,
      authorHandle: tweet.author_username,
      url: tweet.url || `https://twitter.com/${tweet.author_username}/status/${tweet.id}`,
      timestamp: new Date(tweet.created_at),
      engagementMetrics: {
        likes: tweet.like_count || 0,
        shares: (tweet.retweet_count || 0) + (tweet.quote_count || 0),
        comments: tweet.reply_count || 0,
        reach: tweet.impression_count || 0,
        viralityScore: this.calculateTweetViralityScore(tweet),
      },
    };
  }

  private calculateTweetViralityScore(tweet: BirdTweet): number {
    const impressions = tweet.impression_count || 0;
    if (impressions === 0) return 0;

    const engagement =
      (tweet.like_count || 0) +
      (tweet.retweet_count || 0) +
      (tweet.reply_count || 0);
    return Math.min(engagement / impressions * 10, 1);
  }

  private calculateCredibilityScore(user: BirdUser): number {
    const verificationScore = user.verified ? 0.5 : 0.0;
    const followerScore = Math.min((user.followers_count || 0) / 10000, 0.5);
    return verificationScore + followerScore;
  }

  private postMatchesKeywords(
    post: SocialMediaPost,
    keywords: string[]
  ): boolean {
    if (!post.text || !keywords.length) return false;
    const text = post.text.toLowerCase();
    return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  }
}
