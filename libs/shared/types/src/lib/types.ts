export function types(): string {
  return 'types';
}

// Common types used across the application

// Define base node properties
export interface BaseNode {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// Content node representing a piece of content
export interface ContentNode extends BaseNode {
  title: string;
  content: string;
  sourceId: string;
  authorId?: string;
  url?: string;
  engagementMetrics?: EngagementMetrics;
  metadata?: Record<string, any>;
}

// Source node representing a content source
export interface SourceNode extends BaseNode {
  name: string;
  type: 'social' | 'news' | 'blog' | 'forum' | 'other';
  url?: string;
  description?: string;
  trustScore?: number;
  metadata?: Record<string, any>;
}

// Engagement metrics for content
export interface EngagementMetrics {
  views?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  saves?: number;
}
