import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ProjectDossierOnChainAddressSummary,
  ProjectDossierOnChainCounterparty,
  ProjectDossierOnChainSummary,
  ProjectDossierOnChainTokenContract,
} from '../schemas/project-dossier.schema';

type FetchLike = typeof fetch;

@Injectable()
export class OnChainCorrelationService {
  private readonly logger = new Logger(OnChainCorrelationService.name);
  private readonly apiKey: string | undefined;
  private readonly baseUrl = 'https://api.etherscan.io/api';

  constructor(
    private readonly configService: ConfigService,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    this.apiKey =
      this.configService.get<string>('ETHERSCAN_API_KEY') ||
      process.env['ETHERSCAN_API_KEY'];
  }

  async buildSummary(addresses: string[]): Promise<ProjectDossierOnChainSummary> {
    const normalizedAddresses = [...new Set(addresses.map((address) => address.toLowerCase()))].slice(0, 6);
    if (normalizedAddresses.length === 0) {
      return {
        status: 'unavailable',
        analyzedAddresses: [],
        addressSummaries: [],
        commonCounterparties: [],
        tokenContracts: [],
        note: 'No EVM addresses available in this dossier yet.',
      };
    }

    if (!this.apiKey) {
      return {
        status: 'unavailable',
        analyzedAddresses: normalizedAddresses,
        addressSummaries: [],
        commonCounterparties: [],
        tokenContracts: [],
        note: 'ETHERSCAN_API_KEY is not configured.',
      };
    }

    const addressSummaries: ProjectDossierOnChainAddressSummary[] = [];
    const counterpartyMap = new Map<string, Set<string>>();
    const tokenContractMap = new Map<string, { symbol: string | null; occurrenceCount: number }>();
    let completed = 0;

    for (const address of normalizedAddresses) {
      const [txList, tokenTx] = await Promise.all([
        this.apiCall({
          module: 'account',
          action: 'txlist',
          address,
          startblock: '0',
          endblock: '99999999',
          page: '1',
          offset: '50',
          sort: 'desc',
        }),
        this.apiCall({
          module: 'account',
          action: 'tokentx',
          address,
          page: '1',
          offset: '50',
          sort: 'desc',
        }),
      ]);

      if (!Array.isArray(txList?.result) && !Array.isArray(tokenTx?.result)) {
        continue;
      }

      completed += 1;
      const counterparties = new Map<string, number>();
      const tokenContracts = new Set<string>();
      const tokenSymbols = new Set<string>();

      for (const transaction of (txList?.result as EtherscanTransaction[] | undefined) ?? []) {
        const from = transaction.from?.toLowerCase();
        const to = transaction.to?.toLowerCase();
        const otherParty = from === address ? to : from;
        if (!otherParty || otherParty === address || otherParty === ZERO_ADDRESS) continue;
        counterparties.set(otherParty, (counterparties.get(otherParty) ?? 0) + 1);
      }

      for (const transaction of (tokenTx?.result as EtherscanTokenTransaction[] | undefined) ?? []) {
        const from = transaction.from?.toLowerCase();
        const to = transaction.to?.toLowerCase();
        const otherParty = from === address ? to : from;
        if (otherParty && otherParty !== address && otherParty !== ZERO_ADDRESS) {
          counterparties.set(otherParty, (counterparties.get(otherParty) ?? 0) + 1);
        }

        const contractAddress = transaction.contractAddress?.toLowerCase();
        if (contractAddress) {
          tokenContracts.add(contractAddress);
          tokenSymbols.add(transaction.tokenSymbol ?? contractAddress.slice(0, 10));
          const existing = tokenContractMap.get(contractAddress) ?? {
            symbol: transaction.tokenSymbol ?? null,
            occurrenceCount: 0,
          };
          existing.occurrenceCount += 1;
          if (!existing.symbol && transaction.tokenSymbol) {
            existing.symbol = transaction.tokenSymbol;
          }
          tokenContractMap.set(contractAddress, existing);
        }
      }

      for (const counterparty of counterparties.keys()) {
        const existing = counterpartyMap.get(counterparty) ?? new Set<string>();
        existing.add(address);
        counterpartyMap.set(counterparty, existing);
      }

      addressSummaries.push({
        address,
        txCount:
          ((txList?.result as unknown[] | undefined)?.length ?? 0) +
          ((tokenTx?.result as unknown[] | undefined)?.length ?? 0),
        uniqueCounterparties: counterparties.size,
        topCounterparties: [...counterparties.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 5)
          .map(([value]) => value),
        tokenContracts: [...tokenContracts].slice(0, 10),
        tokenSymbols: [...tokenSymbols].slice(0, 10),
      });
    }

    const commonCounterparties: ProjectDossierOnChainCounterparty[] = [...counterpartyMap.entries()]
      .map(([address, sourceAddresses]) => ({
        address,
        addressCount: sourceAddresses.size,
        addresses: [...sourceAddresses].sort(),
      }))
      .filter((entry) => entry.addressCount > 1)
      .sort((a, b) => b.addressCount - a.addressCount || a.address.localeCompare(b.address))
      .slice(0, 12);

    const tokenContracts: ProjectDossierOnChainTokenContract[] = [...tokenContractMap.entries()]
      .map(([address, data]) => ({
        address,
        symbol: data.symbol,
        occurrenceCount: data.occurrenceCount,
      }))
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount || a.address.localeCompare(b.address))
      .slice(0, 12);

    return {
      status: completed === normalizedAddresses.length ? 'ready' : completed > 0 ? 'partial' : 'unavailable',
      analyzedAddresses: normalizedAddresses,
      addressSummaries,
      commonCounterparties,
      tokenContracts,
      note:
        completed > 0
          ? null
          : 'Etherscan did not return transaction data for the candidate addresses.',
    };
  }

  private async apiCall(queryParams: Record<string, string>): Promise<EtherscanResponse | null> {
    const url = new URL(this.baseUrl);
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set('apikey', this.apiKey!);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.fetchImpl(url.toString(), {
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          this.logger.warn(`Etherscan returned HTTP ${response.status}`);
          return null;
        }
        return (await response.json()) as EtherscanResponse;
      } catch (error) {
        if (attempt === 0) continue;
        this.logger.warn(`On-chain correlation fetch failed: ${error}`);
        return null;
      }
    }
    return null;
  }
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

interface EtherscanResponse {
  status: string;
  message: string;
  result: unknown;
}

interface EtherscanTransaction {
  from?: string;
  to?: string;
}

interface EtherscanTokenTransaction extends EtherscanTransaction {
  contractAddress?: string;
  tokenSymbol?: string;
}
