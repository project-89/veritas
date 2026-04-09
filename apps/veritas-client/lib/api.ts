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

/** Server-side semantically clustered narrative (from /narratives/analyze) */
export interface AnalyzedNarrative {
  id: string;
  summary: string;
  postIndices: number[];
  avgSentiment: number;
  sentimentTrajectory: Array<{ timestamp: string; score: number }>;
  platforms: Record<string, number>;
  authors: Array<{ name: string; handle: string; postCount: number }>;
  firstSeen: string;
  lastSeen: string;
  totalEngagement: number;
  velocity: {
    postsPerHour: number;
    acceleration: number;
    trend: 'surging' | 'growing' | 'steady' | 'fading';
  };
  centroidEmbedding: number[];
  supportLevel?: 'clustered' | 'emerging';
}

export interface SaturationReport {
  postCount: number;
  narrativeCount: number;
  unclusteredCount: number;
  unclusteredRatio: number;
  clusterDensity: number;
  topicCoverage: number;
  newTopicYield: number;
  deduplicationRate: number;
  avgInterClusterDistance: number;
  embeddingSpread: number;
  saturationLevel: 'low' | 'moderate' | 'high' | 'saturated';
  recommendation: string;
  suggestedDepth: number;
}

export interface AnalyzeResult {
  narratives: AnalyzedNarrative[];
  unclustered: number[];
  saturation?: SaturationReport;
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
// Investigation types -- deep narrative investigation results
// ---------------------------------------------------------------------------

export interface SourceCredibilityScore {
  handle: string;
  platform: string;
  overallScore: number;
  signals: {
    accountAge: number;
    postingConsistency: number;
    engagementRatio: number;
    contentDiversity: number;
    crossPlatformPresence: number;
    pageRank: number | null;
    betweenness: number | null;
    communityCount: number | null;
  };
  flags: string[];
}

export interface BotScore {
  handle: string;
  platform: string;
  botProbability: number;
  structuralScore: number;
  temporalScore: number;
  behavioralScore: number;
  detectedPatterns: string[];
}

export interface UserInvestigationResult {
  user: {
    handle: string;
    name: string;
    platform: string;
    firstMention: string;
    narrativeEvolution: Array<{
      timestamp: string;
      fromStance: string;
      toStance: string;
      triggerPost?: string;
      confidence: number;
    }>;
    profile: {
      summary: string;
      topics: string[];
      motivations: string[];
      coordinationFlags: string[];
      patterns: {
        avgPostsPerDay: number;
        mostActiveHours: number[];
        platformPresence: string[];
      };
    };
  };
  adoptionTimestamp: string | null;
  likelySource: string | null;
  influenceScore: number;
  flags: string[];
  credibility?: SourceCredibilityScore | null;
  botScore?: BotScore | null;
}

export interface InvestigationResult {
  topic: string;
  users: UserInvestigationResult[];
  originAnalysis: {
    firstMover: string;
    firstPlatform: string;
    firstTimestamp: string;
    propagationChain: string[];
  };
  cuiBono: {
    beneficiaries: Array<{ entity: string; howTheyBenefit: string; confidence: number }>;
    agendas: string[];
    summary: string;
  };
  coordination: {
    clusters: Array<{ users: string[]; pattern: string; confidence: number }>;
    summary: string;
  };
  botDetection?: {
    summary: string;
    structuralPatterns: Array<{
      type: 'star' | 'chain' | 'clique';
      members: string[];
      description: string;
      confidence: number;
    }>;
    graphEnhanced: boolean;
  } | null;
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
    throw new ApiError(`API request failed: ${res.status} ${res.statusText}`, res.status, body);
  }

  return res.json() as Promise<T>;
}

function normalizeIdValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed && trimmed !== 'undefined' && trimmed !== 'null' ? trimmed : undefined;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (value && typeof value === 'object') {
    const maybeOid = (value as { $oid?: unknown }).$oid;
    if (typeof maybeOid === 'string' && maybeOid.trim()) {
      return maybeOid.trim();
    }
    const asString = value.toString?.();
    if (typeof asString === 'string' && asString && asString !== '[object Object]') {
      return asString;
    }
  }
  return undefined;
}

function normalizeInvestigation(investigation: Investigation, fallbackId?: string): Investigation {
  const resolvedId =
    normalizeIdValue(investigation?._id) ??
    normalizeIdValue(investigation?.id) ??
    normalizeIdValue(fallbackId);

  if (!resolvedId) {
    return investigation;
  }

  return {
    ...investigation,
    _id: resolvedId,
    id: resolvedId,
  };
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
 * Run semantic clustering + LLM summarization + velocity scoring on posts.
 * This is the intelligence layer — replaces client-side Jaccard clustering.
 */
export async function analyzeNarratives(posts: RawPost[]): Promise<AnalyzeResult> {
  const payload = posts.map((p) => ({
    text: p.text,
    platform: p.platform,
    authorName: p.authorName,
    authorHandle: p.authorHandle,
    timestamp: p.timestamp,
    sentiment: p.sentiment ? { score: p.sentiment.score, label: p.sentiment.label } : undefined,
    engagement: p.engagement
      ? { likes: p.engagement.likes, comments: p.engagement.comments, shares: p.engagement.shares }
      : undefined,
  }));

  return request<AnalyzeResult>('/api/narratives/analyze', {
    method: 'POST',
    body: JSON.stringify({ posts: payload }),
  });
}

/**
 * Fetch narrative insights for a given timeframe (e.g. "7d", "30d", "24h").
 */
export async function fetchInsights(timeframe: string): Promise<InsightsResponse> {
  return request<InsightsResponse>(`/api/narratives/insights/${encodeURIComponent(timeframe)}`);
}

/**
 * Fetch narrative trend data for a given timeframe.
 */
export async function fetchTrends(timeframe: string): Promise<TrendsResponse> {
  return request<TrendsResponse>(`/api/narratives/trends/${encodeURIComponent(timeframe)}`);
}

/**
 * Compute deviation metrics and reality tunnel visualization data
 * from pre-analyzed narratives and their source posts.
 */
export async function fetchDeviations(
  narratives: AnalyzedNarrative[],
  posts: RawPost[],
): Promise<DeviationResponse> {
  return request<DeviationResponse>('/api/narratives/deviations', {
    method: 'POST',
    body: JSON.stringify({ narratives, posts }),
  });
}

/**
 * Run a deep investigation on a narrative topic.
 * Fetches user timelines and analyzes origin, coordination, and cui bono.
 *
 * @param query - The narrative topic/query
 * @param userHandles - Author handles to investigate
 * @param topicPosts - Posts the client already has from the search (sent to avoid re-searching)
 * @param platforms - Optional platform filter
 */
export async function investigateNarrative(
  query: string,
  userHandles: string[],
  topicPosts: RawPost[],
  platforms?: string[],
): Promise<InvestigationResult> {
  return request<InvestigationResult>('/api/investigate', {
    method: 'POST',
    body: JSON.stringify({
      query,
      userHandles,
      platforms,
      topicPosts,
    }),
  });
}

// ---------------------------------------------------------------------------
// Deviation / Reality Tunnel types
// ---------------------------------------------------------------------------

export interface NarrativeDeviation {
  narrativeId: string;
  summary: string;
  deviationMagnitude: number;
  propagationVelocity: number;
  crossReferenceScore: number;
  sourceCredibility: number;
  impactScore: number;
  postCount: number;
  isConsensus: boolean;
}

export interface RealityTunnelNode {
  id: string;
  content: string;
  timestamp: string;
  deviationScore: number;
  strength: number;
  tunnelId: string;
  parentId?: string;
}

export interface RealityTunnelData {
  id: string;
  name: string;
  color: string;
  nodes: RealityTunnelNode[];
  isConsensus: boolean;
}

export interface DeviationResponse {
  deviations: NarrativeDeviation[];
  realityTunnel: RealityTunnelData[];
  enhancedTunnel: unknown; // EnhancedTunnelData shape, kept generic for JSON transport
}

// ---------------------------------------------------------------------------
// Alert & Monitor types
// ---------------------------------------------------------------------------

export type AlertType =
  | 'new_narrative'
  | 'velocity_spike'
  | 'sentiment_reversal'
  | 'coordination_detected'
  | 'new_platform'
  | 'volume_surge';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  _id: string;
  investigationId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  read: boolean;
}

export interface MonitorConfig {
  _id: string;
  investigationId: string;
  enabled: boolean;
  intervalMinutes: number;
  alertThresholds: {
    velocityMultiplier: number;
    sentimentShift: number;
    minNewNarrativePosts: number;
  };
  lastRunAt: string | null;
  nextRunAt: string | null;
}

// ---------------------------------------------------------------------------
// Investigation (persistent) types
// ---------------------------------------------------------------------------

export interface Investigation {
  _id: string;
  id?: string;
  query: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'archived';
  settings: { platforms: string[]; timeRange: string; limit: number };
  lastSnapshotId: string | null;
  lastScanId: string | null;
  linkedProjectDossierId: string | null;
  evidenceSeeds: InvestigationEvidenceSeed[];
  evidenceDossier?: InvestigationEvidenceDossier;
}

export interface InvestigationEvidenceSeed {
  id: string;
  kind: 'url' | 'youtube' | 'article' | 'post' | 'wallet' | 'contract' | 'domain' | 'document' | 'note';
  value: string;
  label: string;
  status: 'pending' | 'fetched' | 'processed' | 'error';
  notes: string | null;
  metadata: Record<string, unknown>;
  extractedEntities: Array<{ type: string; value: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface InvestigationEvidenceEntitySource {
  seedId: string;
  kind: InvestigationEvidenceSeed['kind'];
  label: string;
  status: InvestigationEvidenceSeed['status'];
}

export interface InvestigationEvidenceEntity {
  type: string;
  value: string;
  displayValue: string;
  sourceCount: number;
  occurrenceCount: number;
  sources: InvestigationEvidenceEntitySource[];
}

export interface InvestigationEvidenceDossier {
  generatedAt: string;
  totalSeeds: number;
  processedSeeds: number;
  entityCounts: Record<string, number>;
  groupedEntities: Record<string, InvestigationEvidenceEntity[]>;
  topEntities: InvestigationEvidenceEntity[];
}

export interface ProjectDossier {
  _id: string;
  id: string;
  investigationId: string;
  name: string;
  slug: string;
  aliases: string[];
  summary: {
    totalSeeds: number;
    processedSeeds: number;
    entityCounts: Record<string, number>;
  };
  groupedEntities: Record<string, InvestigationEvidenceEntity[]>;
  topEntities: InvestigationEvidenceEntity[];
  onChainSummary: {
    status: 'unavailable' | 'partial' | 'ready';
    analyzedAddresses: string[];
    addressSummaries: Array<{
      address: string;
      txCount: number;
      uniqueCounterparties: number;
      topCounterparties: string[];
      tokenContracts: string[];
      tokenSymbols: string[];
    }>;
    commonCounterparties: Array<{
      address: string;
      addressCount: number;
      addresses: string[];
    }>;
    tokenContracts: Array<{
      address: string;
      symbol: string | null;
      occurrenceCount: number;
    }>;
    note: string | null;
  } | null;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDossierOverlap {
  dossierId: string;
  investigationId: string;
  name: string;
  score: number;
  matchedTypes: string[];
  sharedEntities: Array<{
    type: string;
    value: string;
    sourceCount: number;
    weight: number;
  }>;
}

export interface MentalModel {
  _id: string;
  id: string;
  investigationId: string;
  name: string;
  domain: string;
  sourceSummary: {
    totalSeeds: number;
    processedSeeds: number;
    seedKinds: string[];
    evidenceLabels: string[];
  };
  theses: string[];
  heuristics: Array<{
    title: string;
    description: string;
    evidence: string[];
  }>;
  decisionRules: string[];
  workflowSteps: string[];
  evidencePreferences: string[];
  blindSpots: string[];
  signaturePhrases: string[];
  summary: string;
  status: 'generated' | 'fallback';
  modelUsed: string;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AtlasLensRecord {
  investigation: Investigation;
  mentalModel: MentalModel;
}

export interface Snapshot {
  _id: string;
  investigationId: string;
  scanId?: string | null;
  timestamp: string;
  postCount: number;
  narrativeCount: number;
  summary: {
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    byPlatform: Record<string, number>;
  };
  posts?: unknown[];
  narratives?: unknown[];
}

// ---------------------------------------------------------------------------
// Investigation API
// ---------------------------------------------------------------------------

/**
 * List all investigations, ordered by most recently updated.
 */
export async function fetchInvestigations(): Promise<Investigation[]> {
  const investigations = await request<Investigation[]>('/api/investigations');
  return investigations.map((investigation) => normalizeInvestigation(investigation));
}

/**
 * Fetch a single investigation with its latest snapshot.
 */
export async function fetchInvestigation(
  id: string,
): Promise<{
  investigation: Investigation;
  snapshot: Snapshot | null;
  projectDossier: ProjectDossier | null;
  mentalModel: MentalModel | null;
  dossierOverlaps: ProjectDossierOverlap[];
}> {
  const normalizedId = typeof id === 'string' ? id.trim() : '';
  if (!normalizedId || normalizedId === 'undefined' || normalizedId === 'null') {
    throw new Error(`Invalid investigation id: ${String(id)}`);
  }
  const result = await request<{
    investigation: Investigation;
    latestSnapshot?: Snapshot | null;
    snapshot?: Snapshot | null;
    projectDossier?: ProjectDossier | null;
    mentalModel?: MentalModel | null;
    dossierOverlaps?: ProjectDossierOverlap[];
  }>(
    `/api/investigations/${encodeURIComponent(normalizedId)}`,
  );
  // Backend returns "latestSnapshot", normalize to "snapshot"
  return {
    investigation: normalizeInvestigation(result.investigation, normalizedId),
    snapshot: result.latestSnapshot ?? result.snapshot ?? null,
    projectDossier: result.projectDossier ?? null,
    mentalModel: result.mentalModel ?? null,
    dossierOverlaps: result.dossierOverlaps ?? [],
  };
}

/**
 * Archive an investigation (soft-delete).
 */
export async function archiveInvestigation(id: string): Promise<void> {
  await request<void>(`/api/investigations/${encodeURIComponent(id)}/archive`, {
    method: 'PATCH',
  });
}

/**
 * Permanently delete an investigation and its related records.
 */
export async function deleteInvestigation(id: string): Promise<void> {
  await request<void>(`/api/investigations/${encodeURIComponent(id)}/permanent`, {
    method: 'DELETE',
  });
}

/**
 * Rename an investigation.
 */
export async function renameInvestigation(id: string, name: string): Promise<void> {
  await request<void>(`/api/investigations/${encodeURIComponent(id)}/rename`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

/**
 * Save UI session state for an investigation.
 */
export async function saveSessionState(id: string, sessionState: Record<string, unknown>): Promise<void> {
  await request<void>(`/api/investigations/${encodeURIComponent(id)}/session`, {
    method: 'PATCH',
    body: JSON.stringify({ sessionState }),
  });
}

/**
 * Create or find an investigation for a query. Returns the investigation.
 */
export async function createOrGetInvestigation(
  query: string,
  settings?: { name?: string; platforms?: string[]; timeRange?: string; limit?: number },
): Promise<Investigation> {
  const result = await request<Investigation>('/api/investigations', {
    method: 'PUT',
    body: JSON.stringify({ query, ...settings }),
  });
  return normalizeInvestigation(result);
}

/**
 * Append a typed evidence seed to an investigation.
 */
export async function addInvestigationEvidenceSeed(
  id: string,
  seed: {
    kind: InvestigationEvidenceSeed['kind'];
    value: string;
    label?: string;
    notes?: string | null;
    metadata?: Record<string, unknown>;
    extractedEntities?: InvestigationEvidenceSeed['extractedEntities'];
  },
): Promise<Investigation> {
  const result = await request<{ success: boolean; investigation: Investigation }>(
    `/api/investigations/${encodeURIComponent(id)}/evidence-seeds`,
    {
      method: 'PATCH',
      body: JSON.stringify(seed),
    },
  );
  return normalizeInvestigation(result.investigation, id);
}

export async function buildProjectDossier(
  id: string,
): Promise<{
  investigation: Investigation;
  projectDossier: ProjectDossier;
  dossierOverlaps: ProjectDossierOverlap[];
}> {
  const result = await request<{
    success: boolean;
    investigation: Investigation;
    projectDossier: ProjectDossier;
    dossierOverlaps: ProjectDossierOverlap[];
  }>(`/api/investigations/${encodeURIComponent(id)}/project-dossier`, {
    method: 'POST',
  });

  return {
    investigation: normalizeInvestigation(result.investigation, id),
    projectDossier: result.projectDossier,
    dossierOverlaps: result.dossierOverlaps,
  };
}

export async function fetchProjectDossier(
  id: string,
): Promise<{ projectDossier: ProjectDossier | null; dossierOverlaps: ProjectDossierOverlap[] }> {
  return request<{ projectDossier: ProjectDossier | null; dossierOverlaps: ProjectDossierOverlap[] }>(
    `/api/investigations/${encodeURIComponent(id)}/project-dossier`,
  );
}

export async function buildMentalModel(
  id: string,
): Promise<{
  investigation: Investigation;
  mentalModel: MentalModel;
}> {
  const result = await request<{
    success: boolean;
    investigation: Investigation;
    mentalModel: MentalModel;
  }>(`/api/investigations/${encodeURIComponent(id)}/mental-model`, {
    method: 'POST',
  });

  return {
    investigation: normalizeInvestigation(result.investigation, id),
    mentalModel: result.mentalModel,
  };
}

export async function fetchMentalModel(
  id: string,
): Promise<{ mentalModel: MentalModel | null }> {
  return request<{ mentalModel: MentalModel | null }>(
    `/api/investigations/${encodeURIComponent(id)}/mental-model`,
  );
}

export async function fetchAtlasLenses(): Promise<AtlasLensRecord[]> {
  const result = await request<AtlasLensRecord[]>('/api/investigations/atlas-lenses');
  return result.map((record) => ({
    ...record,
    investigation: normalizeInvestigation(record.investigation),
  }));
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

export interface ReportResult {
  content: string;
  generatedAt: string;
}

/**
 * Generate a narrative analysis report (markdown or HTML).
 * Sends structured data (narratives, summary, optional investigation) to the
 * backend, which uses LLM for the executive summary and formats everything
 * into a professional report.
 */
export async function generateReport(params: {
  query: string;
  summary: {
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    byPlatform: Record<string, number>;
  };
  narratives: AnalyzedNarrative[];
  investigation?: InvestigationResult;
  format: 'markdown' | 'html';
}): Promise<ReportResult> {
  return request<ReportResult>('/api/narratives/report', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ---------------------------------------------------------------------------
// Monitor & Alerts API
// ---------------------------------------------------------------------------

/**
 * Fetch alerts, optionally filtered by investigation.
 */
export async function fetchAlerts(investigationId?: string): Promise<Alert[]> {
  const params = new URLSearchParams();
  if (investigationId) params.set('investigationId', investigationId);
  const qs = params.toString();
  return request<Alert[]>(`/api/monitor/alerts${qs ? `?${qs}` : ''}`);
}

/**
 * Get the count of unread alerts.
 */
export async function fetchUnreadAlertCount(): Promise<number> {
  const result = await request<{ count: number }>('/api/monitor/alerts/count');
  return result.count;
}

/**
 * Mark a single alert as read.
 */
export async function markAlertRead(alertId: string): Promise<void> {
  await request<{ success: boolean }>(
    `/api/monitor/alerts/${encodeURIComponent(alertId)}/read`,
    { method: 'PUT' },
  );
}

/**
 * Mark all alerts as read.
 */
export async function markAllAlertsRead(investigationId?: string): Promise<void> {
  const params = new URLSearchParams();
  if (investigationId) params.set('investigationId', investigationId);
  const qs = params.toString();
  await request<{ count: number }>(
    `/api/monitor/alerts/read-all${qs ? `?${qs}` : ''}`,
    { method: 'PUT' },
  );
}

/**
 * Trigger a manual re-scan of an investigation.
 */
export async function refreshInvestigation(
  investigationId: string,
): Promise<{ alerts: Alert[]; snapshotId: string }> {
  return request<{ alerts: Alert[]; snapshotId: string }>(
    `/api/monitor/refresh/${encodeURIComponent(investigationId)}`,
    { method: 'POST' },
  );
}

/**
 * Fetch the monitor config for an investigation.
 */
export async function fetchMonitorConfig(
  investigationId: string,
): Promise<MonitorConfig> {
  return request<MonitorConfig>(
    `/api/monitor/config/${encodeURIComponent(investigationId)}`,
  );
}

/**
 * Update the monitor config for an investigation.
 */
export async function updateMonitorConfig(
  investigationId: string,
  config: Partial<Pick<MonitorConfig, 'enabled' | 'intervalMinutes' | 'alertThresholds'>>,
): Promise<void> {
  await request<MonitorConfig>(
    `/api/monitor/config/${encodeURIComponent(investigationId)}`,
    { method: 'PUT', body: JSON.stringify(config) },
  );
}

// ---------------------------------------------------------------------------
// Propaganda Analysis types
// ---------------------------------------------------------------------------

export interface PropagandaTechnique {
  id: string;
  name: string;
  description: string;
  confidence: number;
  examples: string[];
  educationalNote: string;
}

export interface ExtractedClaim {
  claim: string;
  type: 'factual' | 'interpretive' | 'predictive' | 'normative';
  sources: string[];
  firstSeen: string;
  frequency: number;
  verifiability: 'verifiable' | 'subjective' | 'unfalsifiable';
}

export interface NarrativeFrame {
  frame: string;
  description: string;
  narrativeIds: string[];
  emotionalAppeal: string;
}

export interface PropagandaAnalysisResult {
  techniques: PropagandaTechnique[];
  claims: ExtractedClaim[];
  frames: NarrativeFrame[];
  overallAssessment: {
    manipulationLikelihood: 'low' | 'medium' | 'high';
    confidence: number;
    reasoning: string;
    caveats: string[];
  };
}

// ---------------------------------------------------------------------------
// Propaganda Analysis API
// ---------------------------------------------------------------------------

/**
 * Analyze narratives for propaganda techniques, claims, frames, and
 * overall manipulation likelihood.
 */
export async function analyzePropaganda(
  narratives: AnalyzedNarrative[],
  posts: RawPost[],
): Promise<PropagandaAnalysisResult> {
  return request<PropagandaAnalysisResult>('/api/narratives/propaganda-analysis', {
    method: 'POST',
    body: JSON.stringify({ narratives, posts }),
  });
}

// ---------------------------------------------------------------------------
// Comparative Analysis types
// ---------------------------------------------------------------------------

export interface NarrativeComparison {
  narrativeA: { id: string; summary: string };
  narrativeB: { id: string; summary: string };
  similarity: number;
  sentimentDelta: number;
  velocityComparison: {
    aPostsPerHour: number;
    bPostsPerHour: number;
    fasterNarrative: 'a' | 'b' | 'equal';
  };
  platformOverlap: {
    shared: string[];
    onlyA: string[];
    onlyB: string[];
  };
  authorOverlap: {
    shared: string[];
    onlyA: string[];
    onlyB: string[];
  };
  differenceAnalysis?: string;
}

export interface TimePeriodComparison {
  periodA: { label: string; postCount: number; narrativeCount: number };
  periodB: { label: string; postCount: number; narrativeCount: number };
  persistent: Array<{
    summary: string;
    sentimentShift: number;
    volumeChange: number;
  }>;
  emerged: Array<{ summary: string; postCount: number }>;
  disappeared: Array<{ summary: string; lastPostCount: number }>;
  sentimentShift: number;
  volumeChange: number;
}

export interface PlatformComparison {
  platforms: string[];
  perPlatform: Array<{
    platform: string;
    postCount: number;
    avgSentiment: number;
    dominantNarrative: string;
    uniqueNarratives: string[];
    topAuthors: string[];
  }>;
  crossPlatform: Array<{
    summary: string;
    platforms: string[];
    sentimentByPlatform: Record<string, number>;
  }>;
}

// ---------------------------------------------------------------------------
// Comparative Analysis API
// ---------------------------------------------------------------------------

/**
 * Compare two narratives side by side.
 */
export async function compareNarratives(
  narrativeA: AnalyzedNarrative,
  narrativeB: AnalyzedNarrative,
  postsA: RawPost[],
  postsB: RawPost[],
): Promise<NarrativeComparison> {
  return request<NarrativeComparison>('/api/narratives/compare', {
    method: 'POST',
    body: JSON.stringify({ type: 'narrative', narrativeA, narrativeB, postsA, postsB }),
  });
}

/**
 * Compare two time periods to find emerged, disappeared, and persistent narratives.
 */
export async function compareTimePeriods(
  periodA: { narratives: AnalyzedNarrative[]; posts: RawPost[]; label: string },
  periodB: { narratives: AnalyzedNarrative[]; posts: RawPost[]; label: string },
): Promise<TimePeriodComparison> {
  return request<TimePeriodComparison>('/api/narratives/compare', {
    method: 'POST',
    body: JSON.stringify({ type: 'period', periodA, periodB }),
  });
}

/**
 * Compare how narratives manifest across different platforms.
 */
export async function comparePlatforms(
  narratives: AnalyzedNarrative[],
  posts: RawPost[],
): Promise<PlatformComparison> {
  return request<PlatformComparison>('/api/narratives/compare', {
    method: 'POST',
    body: JSON.stringify({ type: 'platform', narratives, posts }),
  });
}

// ---------------------------------------------------------------------------
// Entity Analysis types
// ---------------------------------------------------------------------------

export interface EntityDossier {
  name: string;
  type: string;
  totalMentions: number;
  narrativeAppearances: Array<{
    narrativeId: string;
    narrativeSummary: string;
    mentionCount: number;
    avgSentimentTowardEntity: number;
  }>;
  sentimentTimeline: Array<{ timestamp: string; score: number }>;
  platformBreakdown: Record<string, number>;
  coOccurrences: Array<{ entity: string; type: string; frequency: number }>;
  topAuthors: Array<{ handle: string; platform: string; mentionCount: number }>;
}

export interface EntityNetworkNode {
  id: string;
  type: 'content' | 'source' | 'account';
  label: string;
  properties: Record<string, unknown>;
  metrics: { size: number; color: string; weight: number };
}

export interface EntityNetworkEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
  metrics: { width: number; color: string; weight: number };
}

export interface EntityAnalysisResponse {
  dossiers: EntityDossier[];
  coOccurrenceNetwork: { nodes: EntityNetworkNode[]; edges: EntityNetworkEdge[] };
}

// ---------------------------------------------------------------------------
// Entity Analysis API
// ---------------------------------------------------------------------------

/**
 * Build entity dossiers and co-occurrence network.
 */
export async function analyzeEntities(
  posts: RawPost[],
  insights: NarrativeInsight[],
  narratives: AnalyzedNarrative[],
): Promise<EntityAnalysisResponse> {
  return request<EntityAnalysisResponse>('/api/narratives/entities', {
    method: 'POST',
    body: JSON.stringify({ posts, insights, narratives }),
  });
}

// ---------------------------------------------------------------------------
// Narrative Genealogy types
// ---------------------------------------------------------------------------

export interface NarrativeLineage {
  currentId: string;
  currentSummary: string;
  history: Array<{
    snapshotId: string;
    snapshotTimestamp: string;
    narrativeId: string;
    summary: string;
    postCount: number;
    avgSentiment: number;
    similarity: number;
  }>;
  events: Array<{
    timestamp: string;
    type: 'emerged' | 'grew' | 'shrank' | 'split' | 'merged' | 'died';
    description: string;
  }>;
  status: 'active' | 'growing' | 'stable' | 'fading' | 'died';
}

export interface GenealogyResponse {
  lineages: NarrativeLineage[];
}

// ---------------------------------------------------------------------------
// Narrative Genealogy API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Downstream Effects / Mycelium types
// ---------------------------------------------------------------------------

export interface ExternalSignal {
  id: string;
  domain: 'economic' | 'political' | 'social' | 'market' | 'media';
  source: string;
  title: string;
  description: string;
  timestamp: string;
  magnitude: number;
  metadata: Record<string, unknown>;
}

export interface TransmissionChainNode {
  node: string;
  type: 'narrative' | 'economic' | 'political' | 'social' | 'market';
  description: string;
  timestamp?: string;
  confidence: number;
}

export interface TransmissionChain {
  narrativeId: string;
  narrativeSummary: string;
  chain: TransmissionChainNode[];
  overallConfidence: number;
}

export interface NarrativeCorrelation {
  narrativeId: string;
  narrativeSummary: string;
  correlatedSignals: Array<{
    signal: ExternalSignal;
    correlationStrength: number;
    temporalOffset: string;
    possibleRelationship: 'caused_by' | 'caused' | 'coincident' | 'amplified';
  }>;
  transmissionChains: TransmissionChain[];
}

export interface DownstreamEffectsResult {
  narrativeCorrelations: NarrativeCorrelation[];
  externalSignals: ExternalSignal[];
  summary: string;
  myceliumData: unknown; // MyceliumData shape from visualization lib
}

// ---------------------------------------------------------------------------
// Downstream Effects API
// ---------------------------------------------------------------------------

/**
 * Analyze downstream effects of narratives — correlate with external signals,
 * generate transmission chains, and produce mycelium visualization data.
 */
export async function fetchDownstreamEffects(
  narratives: AnalyzedNarrative[],
  posts: RawPost[],
): Promise<DownstreamEffectsResult> {
  return request<DownstreamEffectsResult>('/api/narratives/downstream-effects', {
    method: 'POST',
    body: JSON.stringify({ narratives, posts }),
  });
}

/**
 * Build narrative genealogy from multiple investigation snapshots.
 */
export async function fetchGenealogy(
  snapshots: Array<{
    id: string;
    timestamp: string;
    narratives: Array<{
      id: string;
      summary: string;
      centroidEmbedding: number[];
      postCount: number;
      avgSentiment: number;
    }>;
  }>,
): Promise<GenealogyResponse> {
  return request<GenealogyResponse>('/api/narratives/genealogy', {
    method: 'POST',
    body: JSON.stringify({ snapshots }),
  });
}

// ---------------------------------------------------------------------------
// Claim Verification types
// ---------------------------------------------------------------------------

export interface EvidenceItem {
  source: string;
  url?: string;
  excerpt: string;
  credibility: 'high' | 'medium' | 'low';
  timestamp?: string;
}

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

export interface InvestigativeLead {
  question: string;
  dataSources: string[];
  priority: 'high' | 'medium' | 'low';
  automatable: boolean;
}

export interface VerificationResult {
  claim: string;
  status: 'verified' | 'disputed' | 'unverified' | 'mixed' | 'false';
  confidence: number;

  evidence: {
    supporting: EvidenceItem[];
    contradicting: EvidenceItem[];
  };

  reasoning: string;
  caveats: string[];
  sourcesChecked: string[];
  evidenceSources?: EvidenceSource[];
  investigativeLeads?: InvestigativeLead[];
}

export interface ClaimVerificationBatchResult {
  results: VerificationResult[];
  summary: string;
  verifiedCount: number;
  disputedCount: number;
  unverifiedCount: number;
  investigativeLeads?: InvestigativeLead[];
}

// ---------------------------------------------------------------------------
// Claim Verification API
// ---------------------------------------------------------------------------

/**
 * Verify extracted claims by searching for evidence from free public sources
 * (Wikipedia, GDELT) and assessing veracity via LLM reasoning or heuristic.
 */
export async function verifyClaims(
  claims: ExtractedClaim[],
): Promise<ClaimVerificationBatchResult> {
  return request<ClaimVerificationBatchResult>('/api/narratives/verify-claims', {
    method: 'POST',
    body: JSON.stringify({ claims }),
  });
}

// ---------------------------------------------------------------------------
// Scan Job types (BullMQ queue-based scanning)
// ---------------------------------------------------------------------------

export interface ConnectorStatus {
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  postCount: number;
  insightCount: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  duration: number | null;
}

export interface ScanJob {
  _id: string;
  id: string;
  query: string;
  investigationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  settings: {
    platforms: string[];
    timeRange: string;
    limit: number;
  };
  connectors: Record<string, ConnectorStatus>;
  totalPosts: number;
  totalInsights: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Scan API
// ---------------------------------------------------------------------------

/**
 * Start a new scan. Returns immediately with a scanId.
 * Each connector runs independently in BullMQ workers.
 */
export async function startScan(
  query: string,
  platforms?: string[],
  limit?: number,
  timeRange?: string,
  investigationId?: string,
): Promise<{ scanId: string }> {
  return request<{ scanId: string }>('/api/scan', {
    method: 'POST',
    body: JSON.stringify({ query, platforms, limit, timeRange, investigationId }),
  });
}

/**
 * Get the current status of a scan, including per-connector progress.
 */
export async function getScanStatus(scanId: string): Promise<ScanJob> {
  return request<ScanJob>(`/api/scan/${encodeURIComponent(scanId)}`);
}

/**
 * Get all posts collected so far by a scan.
 */
export async function getScanPosts(
  scanId: string,
): Promise<{ posts: RawPost[]; totalPosts: number }> {
  return request<{ posts: RawPost[]; totalPosts: number }>(
    `/api/scan/${encodeURIComponent(scanId)}/posts`,
  );
}

/**
 * Cancel a running scan.
 */
export async function cancelScan(scanId: string): Promise<void> {
  await request<{ success: boolean }>(
    `/api/scan/${encodeURIComponent(scanId)}/cancel`,
    { method: 'POST' },
  );
}

/**
 * Retry a failed connector within a scan.
 */
export async function retryScanConnector(
  scanId: string,
  connector: string,
): Promise<void> {
  await request<{ success: boolean }>(
    `/api/scan/${encodeURIComponent(scanId)}/retry/${encodeURIComponent(connector)}`,
    { method: 'POST' },
  );
}

/**
 * Get recent scan jobs.
 */
export async function getRecentScans(limit = 5): Promise<ScanJob[]> {
  return request<ScanJob[]>(`/api/scan/recent?limit=${limit}`);
}

/**
 * Get recent scan jobs for a specific investigation.
 */
export async function getInvestigationScans(
  investigationId: string,
  limit = 50,
): Promise<ScanJob[]> {
  return request<ScanJob[]>(
    `/api/scan/investigation/${encodeURIComponent(investigationId)}?limit=${limit}`,
  );
}

/**
 * Save analysis results to a scan job's cache.
 */
export async function saveAnalysisCache(
  scanId: string,
  cache: Record<string, unknown>,
): Promise<void> {
  await request<{ success: boolean }>(
    `/api/scan/${encodeURIComponent(scanId)}/analysis-cache`,
    { method: 'PUT', body: JSON.stringify(cache) },
  );
}

/**
 * Get cached analysis results from a scan job.
 */
export async function getAnalysisCache(
  scanId: string,
): Promise<Record<string, unknown> | null> {
  return request<Record<string, unknown> | null>(
    `/api/scan/${encodeURIComponent(scanId)}/analysis-cache`,
  );
}

// ---------------------------------------------------------------------------
// Analysis Job Queue
// ---------------------------------------------------------------------------

export type AnalysisJobType = 'investigation' | 'propaganda' | 'claims' | 'downstream';
export type AnalysisJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AnalysisJob {
  _id: string;
  id: string;
  scanId: string | null;
  type: AnalysisJobType;
  status: AnalysisJobStatus;
  narrativeIds: string[];
  input: {
    query: string;
    narrativeSummaries: string[];
    userHandles: string[];
    postCount: number;
  };
  result: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StartAnalysisJobRequest {
  type: AnalysisJobType;
  narrativeIds: string[];
  input: {
    query: string;
    narrativeSummaries?: string[];
    narratives?: Record<string, unknown>[];
    userHandles?: string[];
    postCount?: number;
  };
}

/**
 * Start a batch of analysis jobs.
 */
export async function startAnalysisJobs(
  scanId: string,
  jobs: StartAnalysisJobRequest[],
): Promise<{ jobIds: string[] }> {
  return request<{ jobIds: string[] }>(
    '/api/analysis-jobs/batch',
    { method: 'POST', body: JSON.stringify({ scanId, jobs }) },
  );
}

/**
 * Get all analysis jobs for a scan.
 */
export async function getAnalysisJobsByScan(
  scanId: string,
): Promise<AnalysisJob[]> {
  return request<AnalysisJob[]>(
    `/api/analysis-jobs/by-scan/${encodeURIComponent(scanId)}`,
  );
}

/**
 * Get a single analysis job.
 */
export async function getAnalysisJob(
  jobId: string,
): Promise<AnalysisJob> {
  return request<AnalysisJob>(
    `/api/analysis-jobs/${encodeURIComponent(jobId)}`,
  );
}

/**
 * Cancel an analysis job.
 */
export async function cancelAnalysisJob(
  jobId: string,
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(
    `/api/analysis-jobs/${encodeURIComponent(jobId)}/cancel`,
    { method: 'POST' },
  );
}

// ---------------------------------------------------------------------------
// Identity Records (MAGI System)
// ---------------------------------------------------------------------------

export interface PlatformAccount {
  platform: string;
  handle: string;
  url: string;
  discoveredAt: string;
  discoveryMethod: 'sherlock' | 'investigation' | 'manual';
  discoveryTier?: 'actionable' | 'corroborating' | 'extended';
  verified: boolean;
}

export interface ProfileImage {
  url: string;
  platform: string;
  capturedAt: string;
  isCurrent: boolean;
}

export type MagiProfileMode = 'investigation-window' | 'current-state' | 'historical';

export interface PsychologicalProfile {
  version: number;
  generatedAt: string;
  modelUsed: string;
  postCountAnalyzed: number;
  profileMode?: MagiProfileMode;
  scopeLabel?: string;
  scope?: {
    investigationId: string | null;
    scanId: string | null;
    startDate: string | null;
    endDate: string | null;
    platforms: string[];
    scanPostCount: number;
    timelinePostCount: number;
  };
  communicationStyle: {
    formality: string;
    tone: string;
    complexity: string;
    evidence: string[];
  };
  coreBeliefs: Array<{ belief: string; confidence: number; evidence: string[] }>;
  interestDomains: Array<{ domain: string; engagementLevel: string; postCount: number }>;
  emotionalTriggers: {
    anger: string[];
    excitement: string[];
    fear: string[];
    evidence: Record<string, string[]>;
  };
  engagementPatterns: {
    likelyToEngageWith: string[];
    likelyToShare: string[];
    likelyToCreate: string[];
    contentPreferences: string[];
  };
  influenceSusceptibility: {
    vulnerableTo: string[];
    resistantTo: string[];
    echoChamberDepth: string;
    evidence: string[];
  };
  persuasionStyle: {
    primaryTechniques: string[];
    targetAudience: string;
    effectiveness: string;
    evidence: string[];
  };
  riskIndicators: {
    radicalizationSignals: string[];
    manipulationVulnerability: string;
    echoChamberDepth: string;
    flags: string[];
    evidence: string[];
  };
  socialRole: {
    primary: string;
    confidence: number;
    evidence: string[];
  };
  summary: string;
}

export interface IdentityRecord {
  _id: string;
  id: string;
  primaryHandle: string;
  primaryPlatform: string;
  displayName: string | null;
  platformAccounts: PlatformAccount[];
  identityClusterId: string | null;
  linkedIdentityIds: string[];
  authorProfile: {
    followersCount: number | null;
    followingCount: number | null;
    postsCount: number | null;
    isVerified: boolean;
    bio: string | null;
  } | null;
  profileImages: ProfileImage[];
  bannerImages: ProfileImage[];
  currentCredibility: number | null;
  currentBotProbability: number | null;
  credibilityHistory: Array<{ value: number; timestamp: string; investigationQuery: string }>;
  botProbabilityHistory: Array<{ value: number; timestamp: string; investigationQuery: string }>;
  investigations: Array<{
    query: string;
    timestamp: string;
    postCount: number;
    platforms: string[];
    credibilityScore: number | null;
    botProbability: number | null;
    flags: string[];
    influenceScore: number;
  }>;
  totalInvestigations: number;
  firstInvestigatedAt: string | null;
  lastInvestigatedAt: string | null;
  psychologicalProfile: PsychologicalProfile | null;
  profileGenerationStatus: string;
  aggregatedFlags: string[];
  totalPostsAnalyzed: number;
}

export async function getIdentityByHandle(
  handle: string,
  platform?: string,
): Promise<IdentityRecord | null> {
  try {
    const params = platform ? `?platform=${encodeURIComponent(platform)}` : '';
    return await request<IdentityRecord>(
      `/api/identity/by-handle/${encodeURIComponent(handle)}${params}`,
    );
  } catch {
    return null;
  }
}

export async function getIdentityById(id: string): Promise<IdentityRecord | null> {
  try {
    return await request<IdentityRecord>(`/api/identity/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}

export async function generateMagiProfile(
  id: string,
  options?: {
    mode?: MagiProfileMode;
    investigationId?: string | null;
    scanId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  },
): Promise<{ status: string }> {
  return request<{ status: string }>(
    `/api/identity/${encodeURIComponent(id)}/generate-profile`,
    {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    },
  );
}

export async function searchIdentities(query: string): Promise<IdentityRecord[]> {
  return request<IdentityRecord[]>(
    `/api/identity/search?q=${encodeURIComponent(query)}`,
  );
}

export async function getRecentIdentities(limit = 20): Promise<IdentityRecord[]> {
  return request<IdentityRecord[]>(`/api/identity/recent?limit=${limit}`);
}

// ---------------------------------------------------------------------------
// Intelligence Engine types (mirrors backend IntelligenceEngineService)
// ---------------------------------------------------------------------------

export interface CampaignSignal {
  type: 'temporal_cluster' | 'content_similarity' | 'bot_network' | 'coordination_pattern';
  description: string;
  confidence: number;
  actors: string[];
  timestamp?: string;
}

export interface CampaignActor {
  handle: string;
  platform: string;
  role: 'orchestrator' | 'amplifier' | 'bot' | 'organic';
  botProbability: number;
  adoptionTimestamp: string | null;
  influenceScore: number;
  flags: string[];
}

export interface CampaignTimeline {
  timestamp: string;
  actor: string;
  event: string;
}

export interface CoordinatedCampaignReport {
  campaignDetected: boolean;
  confidence: number;
  actors: CampaignActor[];
  signals: CampaignSignal[];
  timeline: CampaignTimeline[];
  coordinationClusters: Array<{ users: string[]; pattern: string; confidence: number }>;
  structuralPatterns: Array<{ type: string; members: string[]; description: string; confidence: number }>;
  summary: string;
}

export interface ManipulationPattern {
  ticker: string;
  type: 'pump' | 'fud' | 'wash_narrative' | 'coordinated_shill';
  narrativeSentiment: number;
  priceDirection: 'up' | 'down' | 'flat';
  correlation: number;
  confidence: number;
  description: string;
  involvedActors: string[];
}

export interface MarketManipulationReport {
  manipulationDetected: boolean;
  confidence: number;
  patterns: ManipulationPattern[];
  tickersMentioned: string[];
  signalsMatched: ExternalSignal[];
  summary: string;
}

export interface CrisisAlertItem {
  region: string;
  severity: 'watch' | 'warning' | 'emergency';
  sourceCount: number;
  sources: string[];
  events: unknown[];
  narrativeCorrelation: number;
  description: string;
}

export interface CrisisWarningReport {
  alerts: CrisisAlertItem[];
  highestSeverity: 'none' | 'watch' | 'warning' | 'emergency';
  totalEventsAnalyzed: number;
  regionsAffected: string[];
  summary: string;
}

export interface AttributionNode {
  handle: string;
  platform: string;
  role: 'originator' | 'amplifier' | 'target' | 'beneficiary';
  confidence: number;
  evidence: string[];
}

export interface InfluenceOperationReport {
  operationDetected: boolean;
  confidence: number;
  attributionChain: AttributionNode[];
  propagationPath: string[];
  beneficiaries: Array<{ entity: string; howTheyBenefit: string; confidence: number }>;
  platformsInvolved: string[];
  investigativeLeads: Array<{ question: string; dataSources: string[]; priority: string; automatable: boolean }>;
  summary: string;
}

export interface NarrativeLegitimacyReport {
  score: number;
  verdict: 'legitimate' | 'likely_legitimate' | 'uncertain' | 'likely_false' | 'false';
  verifiedClaimCount: number;
  disputedClaimCount: number;
  unverifiedClaimCount: number;
  evidenceBalance: number;
  platformCredibilityAvg: number;
  claimBreakdown: Array<{ claim: string; status: string; weight: number }>;
  summary: string;
}

export type IntelligenceReport =
  | { type: 'campaign'; report: CoordinatedCampaignReport }
  | { type: 'manipulation'; report: MarketManipulationReport }
  | { type: 'crisis'; report: CrisisWarningReport }
  | { type: 'influence'; report: InfluenceOperationReport }
  | { type: 'legitimacy'; report: NarrativeLegitimacyReport };

// ---------------------------------------------------------------------------
// Intelligence Engine API
// ---------------------------------------------------------------------------

export async function runIntelligenceAssessment(params: {
  type: string;
  narratives: AnalyzedNarrative[];
  posts: RawPost[];
  investigation?: unknown;
  botScores?: unknown[];
  claims?: unknown;
  globalEvents?: unknown[];
  signals?: unknown[];
}): Promise<IntelligenceReport> {
  return request<IntelligenceReport>('/api/narratives/intelligence', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
