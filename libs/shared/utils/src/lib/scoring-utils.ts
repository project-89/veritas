/**
 * Scoring utility functions for calculating various metrics
 */

/**
 * Normalizes a value to a range between 0 and 1
 * @param value Value to normalize
 * @param min Minimum value in the original range
 * @param max Maximum value in the original range
 * @returns Normalized value between 0 and 1
 */
export function normalizeValue(
  value: number,
  min: number,
  max: number
): number {
  if (min === max) {
    return 0.5; // Default to middle value if range is invalid
  }

  // Clamp the value to the range
  const clampedValue = Math.max(min, Math.min(max, value));

  // Normalize to [0, 1]
  return (clampedValue - min) / (max - min);
}

/**
 * Calculates a credibility score based on user metrics
 * Similar to what's used in social media connectors
 * @param userData User data with various credibility indicators
 * @returns Credibility score between 0 and 1
 */
export function calculateCredibilityScore(userData: {
  accountAgeInDays?: number;
  isVerified?: boolean;
  followersCount?: number;
  statusesCount?: number;
  reputation?: number;
  engagementRate?: number;
}): number {
  let score = 0.5; // Default score

  // Account age factor (up to 0.3 points)
  if (userData.accountAgeInDays) {
    // Normalize age: max 5 years (1825 days)
    const normalizedAge = Math.min(userData.accountAgeInDays / 1825, 1);
    score += normalizedAge * 0.3;
  }

  // Verification bonus (0.2 points)
  if (userData.isVerified) {
    score += 0.2;
  }

  // Followers factor (up to 0.25 points)
  if (userData.followersCount) {
    // Logarithmic scale to handle wide range of follower counts
    const followersScore = Math.min(
      Math.log10(userData.followersCount + 1) / 5,
      1
    );
    score += followersScore * 0.25;
  }

  // Activity level factor (up to 0.15 points)
  if (userData.statusesCount) {
    // Logarithmic scale for activity level
    const activityScore = Math.min(
      Math.log10(userData.statusesCount + 1) / 4,
      1
    );
    score += activityScore * 0.15;
  }

  // Reputation factor (up to 0.2 points)
  if (userData.reputation !== undefined) {
    // Assuming reputation is already normalized to [0, 1]
    score += userData.reputation * 0.2;
  }

  // Engagement rate factor (up to 0.3 points)
  if (userData.engagementRate !== undefined) {
    // Assuming engagement rate is already normalized to [0, 1]
    score += userData.engagementRate * 0.3;
  }

  // Cap the total score at 1
  return Math.min(Math.max(score, 0), 1);
}

/**
 * Calculates an engagement score based on social media metrics
 * @param metrics Engagement metrics
 * @returns Engagement score between 0 and 1
 */
export function calculateEngagementScore(metrics: {
  likes?: number;
  shares?: number;
  comments?: number;
  reach?: number;
}): number {
  // Default values
  const likes = metrics.likes || 0;
  const shares = metrics.shares || 0;
  const comments = metrics.comments || 0;
  const reach = metrics.reach || 1; // Avoid division by zero

  // Calculate raw engagement rate
  const totalEngagement = likes + shares * 2 + comments * 3; // Weighted sum
  const engagementRate = totalEngagement / reach;

  // Normalize to [0, 1] using sigmoid function
  // This handles a wide range of engagement rates
  return 1 / (1 + Math.exp(-5 * engagementRate + 3));
}

/**
 * Calculates a virality score based on content spread metrics
 * @param metrics Content spread metrics
 * @returns Virality score between 0 and 1
 */
export function calculateViralityScore(metrics: {
  shareRate: number;
  reachGrowthRate: number;
  velocity: number;
}): number {
  // Weight factors
  const shareWeight = 0.4;
  const reachWeight = 0.3;
  const velocityWeight = 0.3;

  // Normalize each component to [0, 1]
  const normalizedShareRate = normalizeValue(metrics.shareRate, 0, 0.5);
  const normalizedReachGrowth = normalizeValue(metrics.reachGrowthRate, 0, 5);
  const normalizedVelocity = normalizeValue(metrics.velocity, 0, 1000);

  // Weighted sum
  return (
    normalizedShareRate * shareWeight +
    normalizedReachGrowth * reachWeight +
    normalizedVelocity * velocityWeight
  );
}

/**
 * Calculates a weighted average of multiple scores
 * @param scores Object with scores and their weights
 * @returns Weighted average score
 */
export function calculateWeightedAverage(
  scores: Record<
    string,
    {
      value: number;
      weight: number;
    }
  >
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  Object.values(scores).forEach(({ value, weight }) => {
    totalWeight += weight;
    weightedSum += value * weight;
  });

  if (totalWeight === 0) {
    return 0;
  }

  return weightedSum / totalWeight;
}

/**
 * Normalizes engagement metrics to a standard format
 * @param metrics Raw engagement metrics from different platforms
 * @returns Normalized engagement metrics
 */
export function normalizeEngagementMetrics(metrics: Record<string, number>): {
  likes: number;
  shares: number;
  comments: number;
  reach: number;
} {
  // Default values
  const result = {
    likes: 0,
    shares: 0,
    comments: 0,
    reach: 0,
  };

  // Map common metric names to standard properties
  const metricsMap: Record<string, keyof typeof result> = {
    // Likes and reactions
    likes: 'likes',
    reactions: 'likes',
    favorite: 'likes',
    upvotes: 'likes',

    // Shares and reposts
    shares: 'shares',
    retweets: 'shares',
    reposts: 'shares',

    // Comments and replies
    comments: 'comments',
    replies: 'comments',

    // Reach and impressions
    reach: 'reach',
    impressions: 'reach',
    views: 'reach',
  };

  // Map metrics to standard format
  Object.entries(metrics).forEach(([key, value]) => {
    const lowerKey = key.toLowerCase();

    for (const [pattern, target] of Object.entries(metricsMap)) {
      if (lowerKey.includes(pattern)) {
        result[target] += value;
        break;
      }
    }
  });

  return result;
}
