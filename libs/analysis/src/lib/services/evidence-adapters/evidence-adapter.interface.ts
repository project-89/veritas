export interface EvidenceSource {
  source: string;
  sourceType: 'on-chain' | 'financial' | 'social' | 'journalistic' | 'governmental';
  credibilityScore: number;
  url?: string;
  data: Record<string, unknown>;
  excerpt: string;
  relevance: number;
  freshness: number;
  stance: 'supports' | 'contradicts' | 'neutral';
  retrievedAt: string;
}

export interface EvidenceAdapter {
  name: string;
  sourceType: EvidenceSource['sourceType'];
  claimDomains: string[];
  canVerify(claim: string, entities: string[]): boolean;
  fetchEvidence(params: {
    claim: string;
    entities: string[];
    timeRange?: { start: string; end: string };
  }): Promise<EvidenceSource[]>;
}

export interface InvestigativeLead {
  question: string;
  dataSources: string[];
  priority: 'high' | 'medium' | 'low';
  automatable: boolean;
}
