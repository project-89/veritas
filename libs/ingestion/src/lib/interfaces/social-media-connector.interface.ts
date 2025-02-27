import { ContentNode, SourceNode } from "@/schemas/base.schema";
import { EventEmitter } from "events";

export interface SocialMediaPost {
  id: string;
  text: string;
  timestamp: Date;
  platform: string;
  authorId: string;
  authorName?: string;
  authorHandle?: string;
  url?: string;
  engagementMetrics: {
    likes: number;
    shares: number;
    comments: number;
    reach: number;
    viralityScore: number;
  };
}

export interface SocialMediaConnector {
  platform: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  searchContent(
    query: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<SocialMediaPost[]>;

  getAuthorDetails(authorId: string): Promise<Partial<SourceNode>>;

  streamContent(keywords: string[]): EventEmitter;

  validateCredentials(): Promise<boolean>;
}
