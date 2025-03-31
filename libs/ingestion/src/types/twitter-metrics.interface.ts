/**
 * Standardized interface for Twitter metrics
 */
export interface TwitterMetrics {
  like_count?: number;
  retweet_count?: number;
  reply_count?: number;
  impression_count?: number;
}

/**
 * Interface for Twitter user data
 */
export interface TwitterUser {
  id: string;
  name: string;
  username: string;
  verified?: boolean;
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    tweet_count?: number;
    listed_count?: number;
  };
}
