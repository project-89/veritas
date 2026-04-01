// API service for the Veritas veritas-client app.
// Provides a fetch-based client for narrative search, insights, and trends.

// ---------------------------------------------------------------------------
// Response types -- these mirror the shapes returned by the backend API.
// ---------------------------------------------------------------------------

export interface RawPost {
  id: string;
  text: string;
  platform: string;
  authorName: string;
  authorHandle: string;
  url: string;
  timestamp: string; // ISO-8601
  sentiment: { score: number; label: string; confidence: number };
  themes: string[];
  engagement: {
    likes: number;
    shares: number;
    comments: number;
    reach: number;
    viralityScore: number;
  };
}

export interface NarrativeInsight {
  id: string;
  contentHash: string;
  sourceHash: string;
  platform: string;
  timestamp: string; // ISO-8601
  themes: string[];
  entities: Array<{ name: string; type: string; relevance: number }>;
  sentiment: { score: number; label: string; confidence: number };
  engagement: { total: number; breakdown: Record<string, number> };
  narrativeScore: number; // 0 ... 1
  processedAt: string;
  expiresAt: string;
}

export interface NarrativeTrend {
  theme: string;
  direction: 'rising' | 'falling' | 'stable';
  magnitude: number; // 0 ... 1
  sentiment: number; // -1 ... 1
  insightCount: number;
  startDate: string;
  endDate: string;
}

export interface SearchResult {
  posts: RawPost[];
  insights: NarrativeInsight[];
  summary: {
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    byPlatform: Record<string, number>;
  };
}

export interface InsightsResponse {
  insights: NarrativeInsight[];
  timeframe: string;
  generatedAt: string;
}

export interface TrendsResponse {
  trends: NarrativeTrend[];
  timeframe: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new ApiError(
      `API request failed: ${res.status} ${res.statusText}`,
      res.status,
      body,
    );
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search narratives by query, with optional platform and limit filters.
 */
export async function searchNarratives(
  query: string,
  platforms?: string[],
  limit?: number,
): Promise<SearchResult> {
  return request<SearchResult>('/api/narratives/search', {
    method: 'POST',
    body: JSON.stringify({ query, platforms, limit }),
  });
}

/**
 * Fetch narrative insights for a given timeframe (e.g. "7d", "30d", "24h").
 */
export async function fetchInsights(
  timeframe: string,
): Promise<InsightsResponse> {
  return request<InsightsResponse>(
    `/api/narratives/insights/${encodeURIComponent(timeframe)}`,
  );
}

/**
 * Fetch narrative trend data for a given timeframe.
 */
export async function fetchTrends(
  timeframe: string,
): Promise<TrendsResponse> {
  return request<TrendsResponse>(
    `/api/narratives/trends/${encodeURIComponent(timeframe)}`,
  );
}
