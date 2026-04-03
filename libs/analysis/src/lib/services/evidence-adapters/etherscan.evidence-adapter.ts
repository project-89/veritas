import { Logger } from '@nestjs/common';
import type { EvidenceAdapter, EvidenceSource } from './evidence-adapter.interface';

const ETH_ADDRESS_RE = /0x[a-fA-F0-9]{40}/g;
const CRYPTO_KEYWORDS = ['crypto', 'ethereum', 'eth', 'wallet', 'token', 'contract', 'transfer', '0x'];

export class EtherscanEvidenceAdapter implements EvidenceAdapter {
  readonly name = 'Etherscan';
  readonly sourceType = 'on-chain' as const;
  readonly claimDomains = ['crypto', 'ethereum', 'wallet', 'token', 'contract', 'transfer'];

  private readonly logger = new Logger(EtherscanEvidenceAdapter.name);
  private readonly baseUrl = 'https://api.etherscan.io/api';
  private readonly apiKey: string | undefined;
  private loggedMissingKey = false;

  constructor() {
    this.apiKey = process.env['ETHERSCAN_API_KEY'];
  }

  canVerify(claim: string, entities: string[]): boolean {
    const text = `${claim} ${entities.join(' ')}`.toLowerCase();
    const hasAddress = ETH_ADDRESS_RE.test(text);
    const hasKeyword = CRYPTO_KEYWORDS.some((kw) => text.includes(kw));
    return hasAddress || hasKeyword;
  }

  async fetchEvidence(params: {
    claim: string;
    entities: string[];
    timeRange?: { start: string; end: string };
  }): Promise<EvidenceSource[]> {
    if (!this.apiKey) {
      if (!this.loggedMissingKey) {
        this.logger.debug('ETHERSCAN_API_KEY not set — Etherscan adapter disabled');
        this.loggedMissingKey = true;
      }
      return [];
    }

    const text = `${params.claim} ${params.entities.join(' ')}`;
    const addresses = text.match(ETH_ADDRESS_RE) ?? [];
    if (addresses.length === 0) return [];

    const unique = [...new Set(addresses)];
    const results: EvidenceSource[] = [];

    for (const address of unique.slice(0, 3)) {
      const [balance, txList, tokenTx] = await Promise.all([
        this.apiCall({ module: 'account', action: 'balance', address }),
        this.apiCall({ module: 'account', action: 'txlist', address, startblock: '0', endblock: '99999999', page: '1', offset: '10', sort: 'desc' }),
        this.apiCall({ module: 'account', action: 'tokentx', address, page: '1', offset: '10', sort: 'desc' }),
      ]);

      if (balance?.result) {
        const ethBalance = Number(balance.result) / 1e18;
        results.push({
          source: `Etherscan: ${address}`,
          sourceType: 'on-chain',
          credibilityScore: 0.95,
          url: `https://etherscan.io/address/${address}`,
          data: { address, balanceWei: balance.result, balanceEth: ethBalance },
          excerpt: `Wallet ${address.slice(0, 10)}... holds ${ethBalance.toFixed(4)} ETH`,
          relevance: 0.8,
          freshness: 1.0,
          stance: 'neutral',
          retrievedAt: new Date().toISOString(),
        });
      }

      if (Array.isArray(txList?.result) && txList.result.length > 0) {
        const recentTx = txList.result[0] as Record<string, unknown>;
        const txCount = txList.result.length;
        results.push({
          source: `Etherscan TX: ${address}`,
          sourceType: 'on-chain',
          credibilityScore: 0.95,
          url: `https://etherscan.io/address/${address}`,
          data: { address, transactionCount: txCount, mostRecent: recentTx },
          excerpt: `Address ${address.slice(0, 10)}... has ${txCount} recent transactions`,
          relevance: 0.7,
          freshness: 0.9,
          stance: 'neutral',
          retrievedAt: new Date().toISOString(),
        });
      }

      if (Array.isArray(tokenTx?.result) && tokenTx.result.length > 0) {
        const tokens = tokenTx.result as Record<string, unknown>[];
        const tokenNames = [...new Set(tokens.map((t) => t['tokenName']).filter(Boolean))];
        results.push({
          source: `Etherscan Tokens: ${address}`,
          sourceType: 'on-chain',
          credibilityScore: 0.95,
          url: `https://etherscan.io/address/${address}#tokentxns`,
          data: { address, tokenTransfers: tokens.length, tokens: tokenNames },
          excerpt: `Address ${address.slice(0, 10)}... has token activity: ${tokenNames.slice(0, 5).join(', ')}`,
          relevance: 0.7,
          freshness: 0.9,
          stance: 'neutral',
          retrievedAt: new Date().toISOString(),
        });
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async apiCall(queryParams: Record<string, string>): Promise<EtherscanResponse | null> {
    const url = new URL(this.baseUrl);
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set('apikey', this.apiKey!);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          this.logger.warn(`Etherscan returned HTTP ${response.status}`);
          return null;
        }
        return (await response.json()) as EtherscanResponse;
      } catch (err) {
        if (attempt === 0) {
          this.logger.debug(`Etherscan attempt 1 failed, retrying: ${err}`);
          continue;
        }
        this.logger.warn(`Etherscan fetch failed after 2 attempts: ${err}`);
        return null;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface EtherscanResponse {
  status: string;
  message: string;
  result: unknown;
}
