import { Logger } from '@nestjs/common';
import type { ExternalSignal, SignalAdapter } from './signal-adapter.interface';

const USER_AGENT = 'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';

/**
 * CoinGecko adapter — free crypto market data.
 *
 * Fetches top coins by market cap and trending coins from the CoinGecko
 * free API (no key required). Global scope — data is independent of keywords.
 *
 * Docs: https://www.coingecko.com/en/api/documentation
 */
export class CoinGeckoAdapter implements SignalAdapter {
  readonly domain = 'market';
  readonly scope = 'global' as const;
  readonly maxAgeMs = 30 * 60 * 1000; // 30 minutes
  readonly name = 'CoinGecko Crypto Markets';

  private readonly logger = new Logger(CoinGeckoAdapter.name);
  private readonly baseUrl = 'https://api.coingecko.com/api/v3';

  async fetchSignals(_params: {
    keywords: string[];
    startDate: string;
    endDate: string;
  }): Promise<ExternalSignal[]> {
    const [marketSignals, trendingSignals] = await Promise.all([
      this.fetchMarkets(),
      this.fetchTrending(),
    ]);
    return [...marketSignals, ...trendingSignals];
  }

  // ---------------------------------------------------------------------------
  // Fetchers
  // ---------------------------------------------------------------------------

  /** Fetch top 50 coins by market cap. */
  private async fetchMarkets(): Promise<ExternalSignal[]> {
    const url = `${this.baseUrl}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&sparkline=false`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          this.logger.warn(`CoinGecko markets returned HTTP ${response.status}`);
          return [];
        }

        const coins = (await response.json()) as CoinGeckoMarketCoin[];
        return this.mapMarketCoins(coins);
      } catch (err) {
        if (attempt === 0) {
          this.logger.debug(`CoinGecko markets attempt 1 failed, retrying: ${err}`);
          continue;
        }
        this.logger.warn(`CoinGecko markets fetch failed after 2 attempts: ${err}`);
        return [];
      }
    }

    return [];
  }

  /** Fetch trending coins. */
  private async fetchTrending(): Promise<ExternalSignal[]> {
    const url = `${this.baseUrl}/search/trending`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          this.logger.warn(`CoinGecko trending returned HTTP ${response.status}`);
          return [];
        }

        const data = (await response.json()) as CoinGeckoTrendingResponse;
        return this.mapTrendingCoins(data);
      } catch (err) {
        if (attempt === 0) {
          this.logger.debug(`CoinGecko trending attempt 1 failed, retrying: ${err}`);
          continue;
        }
        this.logger.warn(`CoinGecko trending fetch failed after 2 attempts: ${err}`);
        return [];
      }
    }

    return [];
  }

  // ---------------------------------------------------------------------------
  // Mappers
  // ---------------------------------------------------------------------------

  private mapMarketCoins(coins: CoinGeckoMarketCoin[]): ExternalSignal[] {
    if (!Array.isArray(coins)) return [];

    return coins.map((coin, i) => ({
      id: `coingecko-market-${coin.id ?? i}`,
      domain: 'market' as const,
      source: 'CoinGecko',
      title: `${coin.name ?? 'Unknown'} (${(coin.symbol ?? '').toUpperCase()})`,
      description: `24h change: ${coin.price_change_percentage_24h?.toFixed(2) ?? 'N/A'}% | Price: $${coin.current_price?.toLocaleString() ?? 'N/A'}`,
      timestamp: coin.last_updated ?? new Date().toISOString(),
      magnitude: this.priceChangeMagnitude(coin.price_change_percentage_24h),
      metadata: {
        symbol: coin.symbol ?? '',
        current_price: coin.current_price ?? 0,
        price_change_24h: coin.price_change_percentage_24h ?? 0,
        market_cap: coin.market_cap ?? 0,
        volume: coin.total_volume ?? 0,
      },
    }));
  }

  private mapTrendingCoins(data: CoinGeckoTrendingResponse): ExternalSignal[] {
    if (!data.coins || !Array.isArray(data.coins)) return [];

    return data.coins.map((entry, i) => {
      const coin = entry.item;
      return {
        id: `coingecko-trending-${coin.id ?? i}`,
        domain: 'market' as const,
        source: 'CoinGecko',
        title: `[Trending] ${coin.name ?? 'Unknown'} (${(coin.symbol ?? '').toUpperCase()})`,
        description: `Market cap rank: ${coin.market_cap_rank ?? 'N/A'} | Score: ${coin.score ?? 'N/A'}`,
        timestamp: new Date().toISOString(),
        magnitude: 0.5, // trending coins get a baseline magnitude
        metadata: {
          symbol: coin.symbol ?? '',
          current_price: 0,
          price_change_24h: 0,
          market_cap: 0,
          volume: 0,
          trending_score: coin.score ?? 0,
          market_cap_rank: coin.market_cap_rank ?? 0,
        },
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Map absolute 24h price change percentage to a 0-1 magnitude. */
  private priceChangeMagnitude(pctChange?: number | null): number {
    if (pctChange == null || !Number.isFinite(pctChange)) return 0.1;
    // 0% = 0.05, 5% = 0.5, 10%+ = 1.0
    return Math.min(1, Math.max(0.05, Math.abs(pctChange) / 10));
  }
}

// ---------------------------------------------------------------------------
// CoinGecko response types
// ---------------------------------------------------------------------------

export interface CoinGeckoMarketCoin {
  id?: string;
  symbol?: string;
  name?: string;
  current_price?: number;
  market_cap?: number;
  total_volume?: number;
  price_change_percentage_24h?: number | null;
  last_updated?: string;
}

export interface CoinGeckoTrendingCoin {
  id?: string;
  symbol?: string;
  name?: string;
  market_cap_rank?: number;
  score?: number;
}

export interface CoinGeckoTrendingResponse {
  coins?: { item: CoinGeckoTrendingCoin }[];
}
