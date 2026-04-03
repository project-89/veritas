import { Logger } from '@nestjs/common';
import type { EvidenceAdapter, EvidenceSource } from './evidence-adapter.interface';

const CRYPTO_KEYWORDS = ['crypto', 'token', 'liquidity', 'trading', 'price', 'defi', 'swap', 'dex'];

export class DexScreenerEvidenceAdapter implements EvidenceAdapter {
  readonly name = 'DexScreener';
  readonly sourceType = 'financial' as const;
  readonly claimDomains = ['crypto', 'token', 'liquidity', 'trading', 'price', 'defi'];

  private readonly logger = new Logger(DexScreenerEvidenceAdapter.name);
  private readonly baseUrl = 'https://api.dexscreener.com/latest/dex';

  canVerify(claim: string, entities: string[]): boolean {
    const text = `${claim} ${entities.join(' ')}`.toLowerCase();
    return CRYPTO_KEYWORDS.some((kw) => text.includes(kw));
  }

  async fetchEvidence(params: {
    claim: string;
    entities: string[];
    timeRange?: { start: string; end: string };
  }): Promise<EvidenceSource[]> {
    const results: EvidenceSource[] = [];

    // Search for each entity as a potential token symbol or name
    for (const entity of params.entities.slice(0, 3)) {
      const searchResult = await this.apiCall(`/search?q=${encodeURIComponent(entity)}`);
      if (!searchResult) continue;

      const pairs = (searchResult as DexScreenerSearchResponse).pairs ?? [];
      if (pairs.length === 0) continue;

      // Take the top pair by liquidity
      const topPair = pairs[0];
      if (!topPair) continue;

      const priceChange = topPair.priceChange ?? {};
      const liquidity = topPair.liquidity ?? {};
      const volume = topPair.volume ?? {};

      results.push({
        source: `DexScreener: ${topPair.baseToken?.symbol ?? entity}`,
        sourceType: 'financial',
        credibilityScore: 0.9,
        url: topPair.url ?? `https://dexscreener.com`,
        data: {
          pair: topPair.pairAddress,
          chain: topPair.chainId,
          baseToken: topPair.baseToken,
          quoteToken: topPair.quoteToken,
          priceUsd: topPair.priceUsd,
          priceChange,
          liquidity,
          volume,
          fdv: topPair.fdv,
        },
        excerpt: this.buildExcerpt(topPair),
        relevance: 0.8,
        freshness: 1.0,
        stance: this.determinePriceStance(params.claim, priceChange),
        retrievedAt: new Date().toISOString(),
      });
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async apiCall(path: string): Promise<unknown | null> {
    const url = `${this.baseUrl}${path}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          this.logger.warn(`DexScreener returned HTTP ${response.status}`);
          return null;
        }
        return await response.json();
      } catch (err) {
        if (attempt === 0) {
          this.logger.debug(`DexScreener attempt 1 failed, retrying: ${err}`);
          continue;
        }
        this.logger.warn(`DexScreener fetch failed after 2 attempts: ${err}`);
        return null;
      }
    }
    return null;
  }

  private buildExcerpt(pair: DexScreenerPair): string {
    const symbol = pair.baseToken?.symbol ?? 'Unknown';
    const price = pair.priceUsd ? `$${pair.priceUsd}` : 'N/A';
    const liq = pair.liquidity?.usd ? `$${Number(pair.liquidity.usd).toLocaleString()}` : 'N/A';
    const vol24h = pair.volume?.['h24'] ? `$${Number(pair.volume['h24']).toLocaleString()}` : 'N/A';
    const change24h = pair.priceChange?.['h24'] != null ? `${pair.priceChange['h24']}%` : 'N/A';
    return `${symbol}: price ${price}, 24h change ${change24h}, liquidity ${liq}, 24h volume ${vol24h}`;
  }

  private determinePriceStance(
    claim: string,
    priceChange: Record<string, number | undefined>,
  ): 'supports' | 'contradicts' | 'neutral' {
    const claimLower = claim.toLowerCase();
    const change24h = priceChange['h24'] ?? 0;

    const bullish = /pump|moon|ris|up|bull|gain|surge/i.test(claimLower);
    const bearish = /dump|crash|fall|drop|bear|rug|scam/i.test(claimLower);

    if (bullish && change24h > 5) return 'supports';
    if (bullish && change24h < -5) return 'contradicts';
    if (bearish && change24h < -5) return 'supports';
    if (bearish && change24h > 5) return 'contradicts';

    return 'neutral';
  }
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface DexScreenerPair {
  pairAddress?: string;
  chainId?: string;
  baseToken?: { symbol?: string; name?: string; address?: string };
  quoteToken?: { symbol?: string; name?: string; address?: string };
  priceUsd?: string;
  priceChange?: Record<string, number | undefined>;
  liquidity?: { usd?: number; base?: number; quote?: number };
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  fdv?: number;
  url?: string;
}

interface DexScreenerSearchResponse {
  pairs?: DexScreenerPair[];
}
