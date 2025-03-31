/**
 * Extended ContentNode interface to include social media specific fields
 * used by the ingestion controllers
 */
import {
  ContentNode,
  EngagementMetrics as BaseEngagementMetrics,
} from '@veritas/shared/types';

/**
 * Common social media engagement metrics interface
 */
export interface SocialMediaEngagementMetrics extends BaseEngagementMetrics {
  // Base interface has views, likes, shares, comments, saves
  likes: number;
  shares: number;
  comments: number;
  views?: number;
  reach?: number;
  impressions?: number;
  clicks?: number;
  saves?: number;
  viralityScore?: number;
}

/**
 * Extended social media post interface with type safety
 */
export interface SocialMediaContentNode extends Partial<ContentNode> {
  // Required in our social media connectors
  id: string;
  text: string;
  timestamp: Date;
  platform: string;

  // Optional fields
  authorId?: string;
  authorName?: string;
  authorHandle?: string;
  url?: string;
  engagementMetrics?: SocialMediaEngagementMetrics;
  metadata?: Record<string, unknown>;
}

/**
 * Enhanced social media post interface with mapping to ContentNode
 */
export interface EnhancedSocialMediaPost extends SocialMediaContentNode {
  title?: string;
  content?: string;
  // Add any other fields needed for the mapping
  createdAt?: Date;
  updatedAt?: Date;
  sourceId?: string;
}

/**
 * Reddit-specific post type
 */
export interface RedditPost extends SocialMediaContentNode {
  platform: 'reddit';
  subreddit: string;
  threadId?: string;
  isComment: boolean;
}

/**
 * Facebook-specific post type
 */
export interface FacebookPost extends SocialMediaContentNode {
  platform: 'facebook';
  pageId?: string;
  groupId?: string;
  isGroupPost?: boolean;
  isPagePost?: boolean;
}

/**
 * Twitter/X-specific post type
 */
export interface TwitterPost extends SocialMediaContentNode {
  platform: 'twitter';
  isRetweet?: boolean;
  inReplyToId?: string;
  hashtags?: string[];
}

/**
 * YouTube-specific post/comment type
 */
export interface YouTubeComment extends SocialMediaContentNode {
  platform: 'youtube';
  videoId: string;
  channelId?: string | null;
  parentId?: string; // For replies to comments
  isReply: boolean;
  likeCount?: number;
  publishedAt: Date;
  updatedAt?: Date;
  metadata?: {
    replyCount?: number;
    [key: string]: any;
  };
}
