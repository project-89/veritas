/**
 * External signal from a real-world data source (economic, political, social, etc.).
 */
export interface ExternalSignal {
  id: string;
  domain: 'economic' | 'political' | 'social' | 'market' | 'media';
  source: string; // e.g. "Yahoo Finance", "GDELT", "Google Trends"
  title: string;
  description: string;
  timestamp: string;
  magnitude: number; // 0-1, how significant
  metadata: Record<string, unknown>;
}

/**
 * Pluggable adapter for fetching external signals from a specific domain.
 * Future adapters: Yahoo Finance, GDELT, Google Trends, etc.
 */
export interface SignalAdapter {
  domain: string;
  name: string;
  /**
   * 'global' = same data regardless of query (market prices, economic indicators).
   *            Can be cached once per day and shared across all searches.
   * 'query'  = results depend on the search keywords (news articles, LLM hypotheses).
   *            Must be fetched fresh per query.
   */
  scope: 'global' | 'query';
  /**
   * How long cached signals remain valid before re-fetching (milliseconds).
   * Adapters declare this based on how often their underlying data changes.
   */
  maxAgeMs: number;
  /** Fetch signals for a time range relevant to the given narrative keywords. */
  fetchSignals(params: {
    keywords: string[];
    startDate: string;
    endDate: string;
  }): Promise<ExternalSignal[]>;
}
