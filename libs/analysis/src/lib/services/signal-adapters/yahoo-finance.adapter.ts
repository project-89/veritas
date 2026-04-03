import { Logger } from '@nestjs/common';
import type { ExternalSignal, SignalAdapter } from './signal-adapter.interface';

const USER_AGENT =
  'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';

/** Human-readable names for tracked symbols. */
const SYMBOL_NAMES: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^DJI': 'Dow Jones',
  '^IXIC': 'Nasdaq',
  'CL=F': 'Crude Oil',
  'GC=F': 'Gold',
  'SI=F': 'Silver',
  'BTC-USD': 'Bitcoin',
};

/** Minimum absolute percent change to count as a "significant move". */
const SIGNIFICANCE_THRESHOLD = 2.0;

/**
 * Yahoo Finance adapter for market signal detection.
 *
 * Uses the free Yahoo Finance v8 chart API to identify significant daily
 * moves in major indices and commodities. No API key needed, but Yahoo may
 * occasionally block server-side requests with 403 — handled gracefully.
 */
export class YahooFinanceAdapter implements SignalAdapter {
  readonly domain = 'market';
  readonly scope = 'global' as const;
  readonly maxAgeMs = 24 * 60 * 60 * 1000; // 24h — daily market data
  readonly name = 'Yahoo Finance Markets';

  private readonly logger = new Logger(YahooFinanceAdapter.name);
  private readonly symbols = ['^GSPC', '^DJI', 'CL=F', 'GC=F', 'BTC-USD'];
  private readonly baseUrl = 'https://query1.finance.yahoo.com/v8/finance/chart';

  async fetchSignals(params: {
    keywords: string[];
    startDate: string;
    endDate: string;
  }): Promise<ExternalSignal[]> {
    const results = await Promise.allSettled(
      this.symbols.map((symbol) => this.fetchSymbol(symbol, params.startDate, params.endDate)),
    );

    const signals: ExternalSignal[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        signals.push(...result.value);
      }
    }
    return signals;
  }

  // ---------------------------------------------------------------------------
  // Per-symbol fetch
  // ---------------------------------------------------------------------------

  private async fetchSymbol(
    symbol: string,
    startDate: string,
    endDate: string,
  ): Promise<ExternalSignal[]> {
    try {
      const period1 = Math.floor(new Date(startDate).getTime() / 1000);
      const period2 = Math.floor(new Date(endDate).getTime() / 1000);

      const url = `${this.baseUrl}/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;

      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        if (response.status === 403) {
          this.logger.warn(`Yahoo Finance 403 for ${symbol} — skipping`);
        } else {
          this.logger.warn(`Yahoo Finance HTTP ${response.status} for ${symbol}`);
        }
        return [];
      }

      const data = (await response.json()) as YahooChartResponse;
      return this.parseChart(symbol, data, startDate, endDate);
    } catch (err) {
      this.logger.warn(`Yahoo Finance fetch failed for ${symbol}: ${err}`);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Chart parsing
  // ---------------------------------------------------------------------------

  /**
   * Parse Yahoo chart response and extract significant daily moves.
   */
  parseChart(
    symbol: string,
    data: YahooChartResponse,
    startDate: string,
    endDate: string,
  ): ExternalSignal[] {
    const result = data.chart?.result?.[0];
    if (!result) return [];

    const timestamps = result.timestamp;
    const opens = result.indicators?.quote?.[0]?.open;
    const closes = result.indicators?.quote?.[0]?.close;

    if (!timestamps || !opens || !closes) return [];

    const startTs = new Date(startDate).getTime() / 1000;
    const endTs = new Date(endDate).getTime() / 1000;
    const name = SYMBOL_NAMES[symbol] ?? symbol;
    const signals: ExternalSignal[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      if (ts === undefined || ts < startTs || ts > endTs) continue;

      const open = opens[i];
      const close = closes[i];
      if (open == null || close == null || open === 0) continue;

      const pctChange = ((close - open) / open) * 100;

      if (Math.abs(pctChange) >= SIGNIFICANCE_THRESHOLD) {
        const direction = pctChange > 0 ? 'surged' : 'dropped';
        signals.push({
          id: `yahoo-${symbol}-${ts}`,
          domain: 'market',
          source: 'Yahoo Finance',
          title: `${name} ${direction} ${Math.abs(pctChange).toFixed(1)}%`,
          description: `${name} (${symbol}) moved ${pctChange > 0 ? '+' : ''}${pctChange.toFixed(2)}% in a single session`,
          timestamp: new Date(ts * 1000).toISOString(),
          magnitude: Math.min(1, Math.abs(pctChange) / 10),
          metadata: {
            symbol,
            symbolName: name,
            open,
            close,
            pctChange: Math.round(pctChange * 100) / 100,
          },
        });
      }
    }

    return signals;
  }
}

// ---------------------------------------------------------------------------
// Yahoo Finance chart response types
// ---------------------------------------------------------------------------

export interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          close?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
    error?: { code?: string; description?: string } | null;
  };
}
