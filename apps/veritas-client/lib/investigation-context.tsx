'use client';

import {
  createContext,
  type Dispatch,
  type ReactNode,
  useCallback,
  useContext,
  useReducer,
} from 'react';
import type {
  Alert,
  AnalysisJob,
  AnalyzedNarrative,
  ClaimVerificationBatchResult,
  DeviationResponse,
  DownstreamEffectsResult,
  EntityAnalysisResponse,
  IdentityRecord,
  IntelligenceReport,
  InvestigationResult,
  NarrativeComparison,
  NarrativeInsight,
  PlatformComparison,
  PropagandaAnalysisResult,
  RawPost,
  SaturationReport,
} from './api';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type PipelineStage =
  | 'search'
  | 'analyze'
  | 'deviations'
  | 'propaganda'
  | 'entities'
  | 'downstream';

export type StageStatus = 'idle' | 'running' | 'done' | 'error';

export type CenterMode =
  | 'emergence'
  | 'temporal'
  | 'actors'
  | 'claims'
  | 'effects'
  | 'globe'
  | 'entities'
  | 'genealogy'
  | 'flow'
  | 'radar'
  | 'evidence'
  | 'graph'
  | 'platforms'
  | 'intelligence';

export interface SearchSummary {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  byPlatform: Record<string, number>;
}

export interface InvestigationState {
  // Query
  query: string;
  loading: boolean;
  error: string | null;

  // Pipeline status
  pipeline: Record<PipelineStage, StageStatus>;

  // Data
  posts: RawPost[];
  insights: NarrativeInsight[];
  summary: SearchSummary | null;
  narratives: AnalyzedNarrative[];
  serverNarratives: AnalyzedNarrative[];
  unclusteredCount: number;
  deviations: DeviationResponse | null;
  propaganda: PropagandaAnalysisResult | null;
  claims: ClaimVerificationBatchResult | null;
  entities: EntityAnalysisResponse | null;
  downstream: DownstreamEffectsResult | null;
  investigation: InvestigationResult | null;
  saturation: SaturationReport | null;
  investigatingNarrativeId: string | null; // which narrative is currently being investigated
  investigatedNarrativeIds: string[]; // narratives that have been investigated
  investigationId: string | null;
  alerts: Alert[];

  // Analysis queue
  analysisJobs: AnalysisJob[];
  selectedNarrativeIds: string[]; // multi-select for batch analysis

  // Comparisons
  comparison: NarrativeComparison | null;
  platformComparison: PlatformComparison | null;

  // Intelligence Engine
  intelligenceReport: IntelligenceReport | null;

  // Identity records (MAGI)
  selectedIdentity: IdentityRecord | null;
  identityLoading: boolean;

  // Selection
  selectedNarrativeId: string | null;
  selectedActorHandle: string | null;
  selectedClaimIndex: number | null;
  centerMode: CenterMode;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Action =
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_PIPELINE'; stage: PipelineStage; status: StageStatus }
  | {
      type: 'SET_SEARCH_DATA';
      posts: RawPost[];
      insights: NarrativeInsight[];
      summary: SearchSummary;
    }
  | { type: 'SET_NARRATIVES'; narratives: AnalyzedNarrative[]; unclusteredCount: number }
  | { type: 'SET_DEVIATIONS'; data: DeviationResponse }
  | { type: 'SET_PROPAGANDA'; data: PropagandaAnalysisResult }
  | { type: 'SET_CLAIMS'; data: ClaimVerificationBatchResult }
  | { type: 'SET_ENTITIES'; data: EntityAnalysisResponse }
  | { type: 'SET_DOWNSTREAM'; data: DownstreamEffectsResult }
  | { type: 'SET_SATURATION'; data: SaturationReport | null }
  | { type: 'SET_INVESTIGATING'; narrativeId: string | null }
  | { type: 'SET_INVESTIGATION'; data: InvestigationResult; narrativeId: string }
  | { type: 'SET_INVESTIGATION_ID'; id: string | null }
  | { type: 'SET_ALERTS'; alerts: Alert[] }
  | { type: 'ADD_ALERTS'; alerts: Alert[] }
  | { type: 'SET_IDENTITY'; identity: IdentityRecord | null }
  | { type: 'SET_IDENTITY_LOADING'; loading: boolean }
  | { type: 'SET_ANALYSIS_JOBS'; jobs: AnalysisJob[] }
  | { type: 'TOGGLE_NARRATIVE_SELECTION'; narrativeId: string }
  | { type: 'CLEAR_NARRATIVE_SELECTION' }
  | { type: 'SELECT_NARRATIVE'; id: string | null }
  | { type: 'SELECT_ACTOR'; handle: string | null }
  | { type: 'SELECT_CLAIM'; index: number | null }
  | { type: 'SET_CENTER_MODE'; mode: CenterMode }
  | { type: 'SET_COMPARISON'; data: NarrativeComparison | null }
  | { type: 'SET_PLATFORM_COMPARISON'; data: PlatformComparison | null }
  | { type: 'SET_INTELLIGENCE_REPORT'; data: IntelligenceReport | null }
  | { type: 'RESET' };

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: InvestigationState = {
  query: '',
  loading: false,
  error: null,
  pipeline: {
    search: 'idle',
    analyze: 'idle',
    deviations: 'idle',
    propaganda: 'idle',
    entities: 'idle',
    downstream: 'idle',
  },
  posts: [],
  insights: [],
  summary: null,
  narratives: [],
  serverNarratives: [],
  unclusteredCount: 0,
  deviations: null,
  propaganda: null,
  claims: null,
  entities: null,
  downstream: null,
  investigation: null,
  saturation: null,
  investigatingNarrativeId: null,
  investigatedNarrativeIds: [],
  investigationId: null,
  alerts: [],
  comparison: null,
  platformComparison: null,
  intelligenceReport: null,
  analysisJobs: [],
  selectedNarrativeIds: [],
  selectedIdentity: null,
  identityLoading: false,
  selectedNarrativeId: null,
  selectedActorHandle: null,
  selectedClaimIndex: null,
  centerMode: 'temporal',
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function mergeUniqueByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function mergeInvestigationResults(
  current: InvestigationResult | null,
  incoming: InvestigationResult,
): InvestigationResult {
  if (!current) return incoming;

  return {
    topic: current.topic || incoming.topic,
    users: mergeUniqueByKey(
      [...current.users, ...incoming.users],
      (user) => `${user.user.handle}:${user.user.platform}`,
    ),
    originAnalysis: incoming.originAnalysis?.propagationChain?.length
      ? incoming.originAnalysis
      : current.originAnalysis,
    cuiBono: {
      beneficiaries: mergeUniqueByKey(
        [...current.cuiBono.beneficiaries, ...incoming.cuiBono.beneficiaries],
        (item) => `${item.entity}:${item.howTheyBenefit}`,
      ),
      agendas: mergeUniqueByKey(
        [...current.cuiBono.agendas, ...incoming.cuiBono.agendas],
        (item) => item,
      ),
      summary: [current.cuiBono.summary, incoming.cuiBono.summary].filter(Boolean).join(' ').trim(),
    },
    coordination: {
      clusters: mergeUniqueByKey(
        [...current.coordination.clusters, ...incoming.coordination.clusters],
        (cluster) => `${cluster.pattern}:${cluster.users.slice().sort().join(',')}`,
      ),
      summary: [current.coordination.summary, incoming.coordination.summary]
        .filter(Boolean)
        .join(' ')
        .trim(),
    },
    botDetection: incoming.botDetection ?? current.botDetection ?? null,
  };
}

function reducer(state: InvestigationState, action: Action): InvestigationState {
  switch (action.type) {
    case 'SET_QUERY':
      return { ...state, query: action.query };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'SET_PIPELINE':
      return {
        ...state,
        pipeline: { ...state.pipeline, [action.stage]: action.status },
      };
    case 'SET_SEARCH_DATA':
      return {
        ...state,
        posts: action.posts,
        insights: action.insights,
        summary: action.summary,
      };
    case 'SET_NARRATIVES':
      return {
        ...state,
        narratives: action.narratives,
        serverNarratives: action.narratives,
        unclusteredCount: action.unclusteredCount,
      };
    case 'SET_DEVIATIONS':
      return { ...state, deviations: action.data };
    case 'SET_PROPAGANDA':
      return { ...state, propaganda: action.data };
    case 'SET_CLAIMS':
      return { ...state, claims: action.data };
    case 'SET_ENTITIES':
      return { ...state, entities: action.data };
    case 'SET_DOWNSTREAM':
      return { ...state, downstream: action.data };
    case 'SET_SATURATION':
      return { ...state, saturation: action.data };
    case 'SET_INVESTIGATING':
      return { ...state, investigatingNarrativeId: action.narrativeId };
    case 'SET_INVESTIGATION':
      return {
        ...state,
        investigation: mergeInvestigationResults(state.investigation, action.data),
        investigatingNarrativeId: null,
        investigatedNarrativeIds: state.investigatedNarrativeIds.includes(action.narrativeId)
          ? state.investigatedNarrativeIds
          : [...state.investigatedNarrativeIds, action.narrativeId],
      };
    case 'SET_INVESTIGATION_ID':
      return { ...state, investigationId: action.id };
    case 'SET_ALERTS':
      return { ...state, alerts: action.alerts };
    case 'ADD_ALERTS':
      return { ...state, alerts: [...state.alerts, ...action.alerts] };
    case 'SET_IDENTITY':
      return { ...state, selectedIdentity: action.identity, identityLoading: false };
    case 'SET_IDENTITY_LOADING':
      return { ...state, identityLoading: action.loading };
    case 'SET_ANALYSIS_JOBS':
      return { ...state, analysisJobs: action.jobs };
    case 'TOGGLE_NARRATIVE_SELECTION': {
      const ids = state.selectedNarrativeIds;
      const idx = ids.indexOf(action.narrativeId);
      return {
        ...state,
        selectedNarrativeIds:
          idx >= 0 ? ids.filter((id) => id !== action.narrativeId) : [...ids, action.narrativeId],
      };
    }
    case 'CLEAR_NARRATIVE_SELECTION':
      return { ...state, selectedNarrativeIds: [] };
    case 'SELECT_NARRATIVE':
      return {
        ...state,
        selectedNarrativeId: action.id,
        selectedActorHandle: null,
        selectedClaimIndex: null,
      };
    case 'SELECT_ACTOR':
      return {
        ...state,
        selectedActorHandle: action.handle,
        selectedNarrativeId: null,
        selectedClaimIndex: null,
      };
    case 'SELECT_CLAIM':
      return {
        ...state,
        selectedClaimIndex: action.index,
        selectedNarrativeId: null,
        selectedActorHandle: null,
      };
    case 'SET_CENTER_MODE':
      return { ...state, centerMode: action.mode };
    case 'SET_COMPARISON':
      return { ...state, comparison: action.data };
    case 'SET_PLATFORM_COMPARISON':
      return { ...state, platformComparison: action.data };
    case 'SET_INTELLIGENCE_REPORT':
      return { ...state, intelligenceReport: action.data };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface InvestigationContextValue {
  state: InvestigationState;
  dispatch: Dispatch<Action>;
  selectNarrative: (id: string | null) => void;
  selectActor: (handle: string | null) => void;
  selectClaim: (index: number | null) => void;
  setCenterMode: (mode: CenterMode) => void;
}

const InvestigationContext = createContext<InvestigationContextValue | null>(null);

export function InvestigationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const selectNarrative = useCallback(
    (id: string | null) => dispatch({ type: 'SELECT_NARRATIVE', id }),
    [],
  );
  const selectActor = useCallback(
    (handle: string | null) => dispatch({ type: 'SELECT_ACTOR', handle }),
    [],
  );
  const selectClaim = useCallback(
    (index: number | null) => dispatch({ type: 'SELECT_CLAIM', index }),
    [],
  );
  const setCenterMode = useCallback(
    (mode: CenterMode) => dispatch({ type: 'SET_CENTER_MODE', mode }),
    [],
  );

  return (
    <InvestigationContext.Provider
      value={{ state, dispatch, selectNarrative, selectActor, selectClaim, setCenterMode }}
    >
      {children}
    </InvestigationContext.Provider>
  );
}

export function useInvestigation() {
  const ctx = useContext(InvestigationContext);
  if (!ctx) {
    throw new Error('useInvestigation must be used within InvestigationProvider');
  }
  return ctx;
}
