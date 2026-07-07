'use client';

import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NervBadge,
  NervProgress,
  type NervProgressStage,
  NervStatus,
  NervTicker,
  type NervTickerItem,
} from '../../components/nerv';
import { ActorsMatrix } from '../../components/nerv/actors-matrix';
import { AnalysisQueuePanel } from '../../components/nerv/analysis-queue-panel';
import { ClaimsMatrix } from '../../components/nerv/claims-matrix';
import { DetailPanel } from '../../components/nerv/detail-panel';
import { EffectsChain } from '../../components/nerv/effects-chain';
import { EntityPanel } from '../../components/nerv/entity-panel';
import { EvidenceChainPanel } from '../../components/nerv/evidence-chain-panel';
import { GenealogyPanel } from '../../components/nerv/genealogy-panel';
import { IntelligenceReportPanel } from '../../components/nerv/intelligence-report-panel';
import { NarrativeComparisonPanel } from '../../components/nerv/narrative-comparison-panel';
import { NarrativeList } from '../../components/nerv/narrative-list';
import { NarrativeRadar } from '../../components/nerv/narrative-radar';
import { PlatformComparisonPanel } from '../../components/nerv/platform-comparison-panel';
import { PropagationFlow } from '../../components/nerv/propagation-flow';
import { SaturationIndicator } from '../../components/nerv/saturation-indicator';
import { ScanHistoryBar } from '../../components/nerv/scan-history-bar';
import { ScanProgress } from '../../components/nerv/scan-progress';
import { SocialGraphPanel } from '../../components/nerv/social-graph-panel';
import { TemporalHeatmap } from '../../components/nerv/temporal-heatmap';
import {
  type AnalyzeResult,
  type AnalyzedNarrative,
  addInvestigationEvidenceSeed,
  analyzeEntities,
  analyzeNarratives,
  analyzePropaganda,
  buildMentalModel,
  buildProjectDossier,
  cancelAnalysisJob,
  cancelScan,
  type ClaimVerificationBatchResult,
  compareNarratives,
  comparePlatforms,
  createOrGetInvestigation,
  type DeviationResponse,
  type DownstreamEffectsResult,
  type EntityAnalysisInsight,
  type EntityAnalysisResponse,
  type ExtractedClaim,
  fetchAlerts,
  fetchDeviations,
  fetchDownstreamEffects,
  fetchInvestigation,
  fetchInvestigations,
  fetchMentalModel,
  fetchProjectDossier,
  generateMagiProfile,
  generateReport,
  getAnalysisCache,
  getAnalysisJobsByScan,
  getIdentityByHandle,
  getInvestigationScans,
  getRecentScans,
  getScanPosts,
  getScanStatus,
  type Investigation,
  type InvestigationResult,
  type MagiProfileMode,
  type MentalModel,
  type ProjectDossier,
  type ProjectDossierOverlap,
  type PropagandaAnalysisResult,
  type RawPost,
  retryScanConnector,
  runIntelligenceAssessment,
  type SaturationReport,
  type ScanJob,
  type StartAnalysisJobRequest,
  saveAnalysisCache,
  startAnalysisJobs,
  startScan,
  verifyClaims,
} from '../../lib/api';
import { buildGlobeData } from '../../lib/globe-data';
import {
  type CenterMode,
  InvestigationProvider,
  type PipelineStage,
  useInvestigation,
} from '../../lib/investigation-context';

const NarrativeGlobeLazy = dynamic(
  () =>
    import('../../components/nerv/narrative-globe').then((m) => ({ default: m.NarrativeGlobe })),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Mode definitions
// ---------------------------------------------------------------------------

const CENTER_MODE_GROUPS: {
  label: string;
  modes: { key: CenterMode; label: string; shortcut: string }[];
}[] = [
  {
    label: 'Analysis',
    modes: [
      { key: 'temporal', label: 'TEMPORAL', shortcut: '1' },
      { key: 'radar', label: 'RADAR', shortcut: '2' },
      { key: 'entities', label: 'ENTITIES', shortcut: '3' },
    ],
  },
  {
    label: 'Actors',
    modes: [
      { key: 'actors', label: 'ACTORS', shortcut: '4' },
      { key: 'graph', label: 'GRAPH', shortcut: '5' },
      { key: 'flow', label: 'FLOW', shortcut: '6' },
    ],
  },
  {
    label: 'Verification',
    modes: [
      { key: 'claims', label: 'CLAIMS', shortcut: '7' },
      { key: 'evidence', label: 'EVIDENCE', shortcut: '8' },
      { key: 'intelligence', label: 'INTEL', shortcut: 'I' },
    ],
  },
  {
    label: 'Impact',
    modes: [
      { key: 'effects', label: 'EFFECTS', shortcut: '9' },
      { key: 'platforms', label: 'PLATFORMS', shortcut: 'P' },
      { key: 'globe', label: 'GLOBE', shortcut: 'G' },
      { key: 'genealogy', label: 'GENEALOGY', shortcut: '0' },
    ],
  },
];

/** Flat lookup from shortcut key to CenterMode */
const SHORTCUT_MAP = new Map<string, CenterMode>(
  CENTER_MODE_GROUPS.flatMap((g) =>
    g.modes.filter((m) => m.shortcut).map((m) => [m.shortcut.toUpperCase(), m.key]),
  ),
);

// ---------------------------------------------------------------------------
// Pipeline stages for progress bar
// ---------------------------------------------------------------------------

function getPipelineStages(pipeline: Record<PipelineStage, string>): NervProgressStage[] {
  const stages: PipelineStage[] = [
    'search',
    'analyze',
    'deviations',
    'propaganda',
    'entities',
    'downstream',
  ];
  return stages.map((s) => ({
    label: s,
    status:
      pipeline[s] === 'done'
        ? 'done'
        : pipeline[s] === 'running'
          ? 'running'
          : pipeline[s] === 'error'
            ? 'error'
            : 'queued',
  }));
}

function getInvestigationId(investigation: Investigation | null | undefined): string | null {
  return investigation?._id ?? investigation?.id ?? null;
}

// ---------------------------------------------------------------------------
// DragHandle — draggable divider between panels
// ---------------------------------------------------------------------------

function DragHandle({ onDrag }: { onDrag: (dx: number) => void }) {
  const lastXRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      lastXRef.current = e.clientX;

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - lastXRef.current;
        lastXRef.current = ev.clientX;
        onDrag(dx);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [onDrag],
  );

  return (
    <button
      type="button"
      aria-label="Resize investigation panels"
      onMouseDown={handleMouseDown}
      className="w-1.5 shrink-0 cursor-col-resize bg-nerv-border hover:bg-nerv-orange/40 active:bg-nerv-orange/60 transition-colors relative group"
    >
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-nerv-text-muted/20 group-hover:bg-nerv-orange/60" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// InvestigationWorkspace — the actual workspace content
// ---------------------------------------------------------------------------

function InvestigationWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const searchParamsString = searchParams.toString();
  interface CachedAnalysisPayload {
    narratives?: AnalyzeResult;
    deviations?: DeviationResponse;
    propaganda?: PropagandaAnalysisResult;
    claims?: ClaimVerificationBatchResult;
    entities?: EntityAnalysisResponse;
    downstream?: DownstreamEffectsResult;
    investigation?: InvestigationResult;
    investigationNarrativeId?: string;
    unclusteredCount?: number;
    saturation?: SaturationReport;
  }
  const normalizeRouteId = (value: string | null): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null;
    return trimmed;
  };
  const query = searchParams.get('q') ?? '';
  const invId = normalizeRouteId(searchParams.get('inv'));
  const requestedScanId = normalizeRouteId(searchParams.get('scan'));
  const freshSearch = searchParams.get('fresh') === '1';
  const urlModeParam = searchParams.get('mode');
  const urlSearchMode: 'topic' | 'claim' | 'person' =
    urlModeParam === 'claim' ? 'claim' : urlModeParam === 'person' ? 'person' : 'topic';
  const urlPlatforms = searchParams.get('platforms')?.split(',').filter(Boolean) ?? undefined;
  const urlTimeRange = searchParams.get('timeRange') ?? '7d';
  const parsedUrlLimit = Number.parseInt(searchParams.get('limit') ?? '', 10);
  const urlLimit =
    Number.isFinite(parsedUrlLimit) && parsedUrlLimit > 0 ? parsedUrlLimit : undefined;
  const urlUsernames = useMemo(
    () =>
      searchParams
        .get('usernames')
        ?.split(',')
        .map((s) => s.trim().replace(/^@/, ''))
        .filter(Boolean) ?? [],
    [searchParams],
  );
  const urlHashtags = useMemo(
    () =>
      searchParams
        .get('hashtags')
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [],
    [searchParams],
  );
  const urlWallets = useMemo(
    () =>
      searchParams
        .get('wallets')
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [],
    [searchParams],
  );
  const urlSubreddits = useMemo(
    () =>
      searchParams
        .get('subreddits')
        ?.split(',')
        .map((s) => s.trim().replace(/^r\//, ''))
        .filter(Boolean) ?? [],
    [searchParams],
  );

  // Build enhanced query: base query + hashtags + wallet terms + subreddit scoping
  const enhancedQuery = useMemo(() => {
    const parts = [query];
    for (const tag of urlHashtags) {
      const t = tag.startsWith('#') ? tag : `#${tag}`;
      if (!query.includes(t)) parts.push(t);
    }
    for (const wallet of urlWallets) {
      if (!query.includes(wallet)) parts.push(wallet);
    }
    for (const sub of urlSubreddits) {
      if (!query.includes(`subreddit:${sub}`)) parts.push(`subreddit:${sub}`);
    }
    return parts.join(' ');
  }, [query, urlHashtags, urlSubreddits, urlWallets]);
  const { state, dispatch, selectNarrative, selectActor, selectClaim, setCenterMode } =
    useInvestigation();
  const pipelineRan = useRef(false);
  const pipelineResetKey = `${query}::${invId ?? ''}::${requestedScanId ?? ''}::${freshSearch ? '1' : '0'}`;
  const lastPipelineResetKeyRef = useRef<string | null>(null);
  if (lastPipelineResetKeyRef.current !== pipelineResetKey) {
    lastPipelineResetKeyRef.current = pipelineResetKey;
    pipelineRan.current = false;
  }
  const [radarSelectedIds, setRadarSelectedIds] = useState<string[]>([]);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(380);
  const [investigationRecord, setInvestigationRecord] = useState<Investigation | null>(null);
  const [projectDossier, setProjectDossier] = useState<ProjectDossier | null>(null);
  const [projectDossierOverlaps, setProjectDossierOverlaps] = useState<ProjectDossierOverlap[]>([]);
  const [mentalModel, setMentalModel] = useState<MentalModel | null>(null);
  const [evidenceSeedSaving, setEvidenceSeedSaving] = useState(false);
  const [projectDossierSaving, setProjectDossierSaving] = useState(false);
  const [mentalModelSaving, setMentalModelSaving] = useState(false);
  const [scanJob, setScanJob] = useState<ScanJob | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanJob[]>([]);
  const scanPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanPostsFetchedRef = useRef(false);
  const mergeUniqueByKey = useCallback(<T,>(items: T[], keyFn: (item: T) => string): T[] => {
    const seen = new Set<string>();
    const merged: T[] = [];
    for (const item of items) {
      const key = keyFn(item);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged;
  }, []);
  const mergeInvestigationResults = useCallback(
    (
      current: NonNullable<typeof state.investigation> | null,
      incoming: NonNullable<typeof state.investigation>,
    ) => {
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
          summary: [current.cuiBono.summary, incoming.cuiBono.summary]
            .filter(Boolean)
            .join(' ')
            .trim(),
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
    },
    [mergeUniqueByKey],
  );
  const memoizedGlobeData = useMemo(
    () =>
      buildGlobeData({
        narratives: state.narratives,
        posts: state.posts,
        downstream: state.downstream,
        investigation: state.investigation,
      }),
    [state.narratives, state.posts, state.downstream, state.investigation],
  );

  const handleGlobePointClick = useCallback(
    (point: { metadata?: Record<string, unknown> }) => {
      const meta = point.metadata as { narrativeCount?: number } | undefined;
      if (!meta?.narrativeCount || meta.narrativeCount <= 0) return;

      const countryCode = (point.metadata as Record<string, unknown> | undefined)?.countryCode as
        | string
        | undefined;
      if (!countryCode) return;

      const firstNarrative = state.narratives[0];
      if (firstNarrative) {
        selectNarrative(firstNarrative.id);
      }
    },
    [state.narratives, selectNarrative],
  );

  useEffect(() => {
    let cancelled = false;

    const loadInvestigationRecord = async () => {
      try {
        let resolved: Investigation | null = null;

        if (invId) {
          const { investigation, projectDossier, mentalModel, dossierOverlaps } =
            await fetchInvestigation(invId);
          resolved = investigation;
          if (!cancelled) {
            setProjectDossier(projectDossier);
            setMentalModel(mentalModel);
            setProjectDossierOverlaps(dossierOverlaps);
          }
        } else if (query) {
          const allInvestigations = await fetchInvestigations();
          const match = allInvestigations.find((item) => item.query === query) ?? null;
          const matchId = match?._id ?? match?.id ?? null;
          if (matchId) {
            const { investigation, projectDossier, mentalModel, dossierOverlaps } =
              await fetchInvestigation(matchId);
            resolved = investigation;
            if (!cancelled) {
              setProjectDossier(projectDossier);
              setMentalModel(mentalModel);
              setProjectDossierOverlaps(dossierOverlaps);
            }
          }
        }

        if (!cancelled) {
          setInvestigationRecord(resolved);
          dispatch({ type: 'SET_INVESTIGATION_ID', id: resolved?._id ?? resolved?.id ?? null });
        }
      } catch {
        if (!cancelled) {
          setInvestigationRecord(null);
          setProjectDossier(null);
          setMentalModel(null);
          setProjectDossierOverlaps([]);
          dispatch({ type: 'SET_INVESTIGATION_ID', id: null });
        }
      }
    };

    loadInvestigationRecord();
    return () => {
      cancelled = true;
    };
  }, [invId, query, dispatch]);

  // Shift-click handler for radar multi-select
  const handleNarrativeSelect = useCallback(
    (id: string | null, shiftKey?: boolean) => {
      if (id && shiftKey && state.centerMode === 'radar') {
        setRadarSelectedIds((prev) => {
          if (prev.includes(id)) return prev.filter((x) => x !== id);
          if (prev.length >= 3) return [...prev.slice(1), id];
          return [...prev, id];
        });
      } else {
        selectNarrative(id);
        if (id) setRadarSelectedIds([id]);
      }
    },
    [selectNarrative, state.centerMode],
  );

  // ---- Comparison handlers ----
  const [comparingNarratives, setComparingNarratives] = useState(false);
  const [comparingPlatforms, setComparingPlatforms] = useState(false);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);

  const handleCompareNarratives = useCallback(
    async (ids: string[]) => {
      if (ids.length < 2) return;
      const [a, b] = ids;
      const narrativeA = state.narratives.find((n) => n.id === a);
      const narrativeB = state.narratives.find((n) => n.id === b);
      if (!narrativeA || !narrativeB) return;
      setComparingNarratives(true);
      try {
        const postsA = narrativeA.postIndices
          .map((i) => state.posts[i])
          .filter((p): p is RawPost => Boolean(p));
        const postsB = narrativeB.postIndices
          .map((i) => state.posts[i])
          .filter((p): p is RawPost => Boolean(p));
        const result = await compareNarratives(narrativeA, narrativeB, postsA, postsB);
        dispatch({ type: 'SET_COMPARISON', data: result });
      } catch {
        // silently fail
      } finally {
        setComparingNarratives(false);
      }
    },
    [state.narratives, state.posts, dispatch],
  );

  const handlePlatformComparison = useCallback(async () => {
    if (state.narratives.length === 0) return;
    setComparingPlatforms(true);
    try {
      const result = await comparePlatforms(state.narratives, state.posts);
      dispatch({ type: 'SET_PLATFORM_COMPARISON', data: result });
    } catch {
      // silently fail
    } finally {
      setComparingPlatforms(false);
    }
  }, [state.narratives, state.posts, dispatch]);

  const handleIntelligence = useCallback(
    async (type: string) => {
      setIntelligenceLoading(true);
      try {
        const result = await runIntelligenceAssessment({
          type,
          narratives: state.narratives,
          posts: state.posts,
          investigation: state.investigation ?? undefined,
          claims: state.claims ?? undefined,
        });
        dispatch({ type: 'SET_INTELLIGENCE_REPORT', data: result });
      } catch {
        // silently fail
      } finally {
        setIntelligenceLoading(false);
      }
    },
    [state.narratives, state.posts, state.investigation, state.claims, dispatch],
  );

  // Load scan history for the current investigation when available.
  useEffect(() => {
    const targetInvestigationId =
      investigationRecord?._id ?? investigationRecord?.id ?? invId ?? null;

    if (targetInvestigationId) {
      getInvestigationScans(targetInvestigationId, 50)
        .then((scans) => setScanHistory(scans))
        .catch(() => setScanHistory([]));
      return;
    }

    if (!query) {
      setScanHistory([]);
      return;
    }

    getRecentScans(20)
      .then((scans) => setScanHistory(scans.filter((s) => s.query === query)))
      .catch(() => setScanHistory([]));
  }, [query, invId, investigationRecord]);

  // Track the active scan ID for caching
  const activeScanIdRef = useRef<string | null>(null);

  // ---- Helper: restore from analysis cache ----
  const restoreFromCache = useCallback(
    async (scanId: string): Promise<boolean> => {
      try {
        const cache = (await getAnalysisCache(scanId)) as CachedAnalysisPayload | null;
        if (!cache) return false;

        if (cache.narratives) {
          dispatch({
            type: 'SET_NARRATIVES',
            narratives: cache.narratives.narratives ?? [],
            unclusteredCount: cache.unclusteredCount ?? 0,
          });
          dispatch({ type: 'SET_PIPELINE', stage: 'analyze', status: 'done' });
        }
        if (cache.saturation) {
          dispatch({ type: 'SET_SATURATION', data: cache.saturation as SaturationReport });
        }
        if (cache.deviations) {
          dispatch({ type: 'SET_DEVIATIONS', data: cache.deviations as DeviationResponse });
          dispatch({ type: 'SET_PIPELINE', stage: 'deviations', status: 'done' });
        }
        if (cache.propaganda) {
          dispatch({ type: 'SET_PROPAGANDA', data: cache.propaganda as PropagandaAnalysisResult });
          dispatch({ type: 'SET_PIPELINE', stage: 'propaganda', status: 'done' });
        }
        if (cache.entities) {
          dispatch({ type: 'SET_ENTITIES', data: cache.entities as EntityAnalysisResponse });
          dispatch({ type: 'SET_PIPELINE', stage: 'entities', status: 'done' });
        }
        if (cache.downstream) {
          dispatch({ type: 'SET_DOWNSTREAM', data: cache.downstream as DownstreamEffectsResult });
          dispatch({ type: 'SET_PIPELINE', stage: 'downstream', status: 'done' });
        }
        if (cache.investigation) {
          dispatch({
            type: 'SET_INVESTIGATION',
            data: cache.investigation,
            narrativeId: cache.investigationNarrativeId ?? '',
          });
        }

        dispatch({ type: 'SET_LOADING', loading: false });
        return true;
      } catch {
        return false;
      }
    },
    [dispatch],
  );

  const findPersistedScan = useCallback(
    async (
      targetQuery: string,
      investigationId?: string | null,
      exactScanId?: string | null,
    ): Promise<ScanJob | null> => {
      if (exactScanId) {
        try {
          const exactScan = await getScanStatus(exactScanId);
          if (exactScan.status === 'completed' && exactScan.totalPosts > 0) {
            return exactScan;
          }
        } catch {
          // Fall back to investigation/query lookup below.
        }
      }

      try {
        const recentScans = await getRecentScans(100);
        const completedScans = recentScans.filter(
          (scan) => scan.status === 'completed' && scan.totalPosts > 0,
        );

        if (investigationId) {
          const byInvestigation = completedScans.find(
            (scan) => scan.investigationId === investigationId,
          );
          if (byInvestigation) return byInvestigation;
        }

        return completedScans.find((scan) => scan.query === targetQuery) ?? null;
      } catch {
        return null;
      }
    },
    [],
  );

  const queryTabs = useMemo(() => {
    const latestByQuery = new Map<string, ScanJob>();
    for (const scan of scanHistory) {
      const existing = latestByQuery.get(scan.query);
      if (
        !existing ||
        new Date(scan.createdAt).getTime() > new Date(existing.createdAt).getTime()
      ) {
        latestByQuery.set(scan.query, scan);
      }
    }

    return Array.from(latestByQuery.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [scanHistory]);

  const activeHistoryScanId = requestedScanId ?? scanJob?._id ?? scanJob?.id ?? null;

  const activeQueryTabKey = useMemo(() => {
    if (activeHistoryScanId) {
      const activeScan = scanHistory.find((scan) => (scan._id ?? scan.id) === activeHistoryScanId);
      if (activeScan?.query) return activeScan.query;
    }
    return query;
  }, [activeHistoryScanId, scanHistory, query]);

  const buildPostSummary = useCallback(
    (posts: RawPost[]) => ({
      total: posts.length,
      positive: posts.filter((p) => p.sentiment?.label === 'positive').length,
      negative: posts.filter((p) => p.sentiment?.label === 'negative').length,
      neutral: posts.filter((p) => p.sentiment?.label === 'neutral').length,
      byPlatform: posts.reduce<Record<string, number>>((acc, p) => {
        acc[p.platform] = (acc[p.platform] || 0) + 1;
        return acc;
      }, {}),
    }),
    [],
  );

  // ---- Analysis queue setup (must be before handlers that start polling) ----
  const analysisJobPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mergedJobIdsRef = useRef<Set<string>>(new Set());

  /** Start polling for analysis job results. Merges completed jobs into state as they finish. */
  const startAnalysisPolling = useCallback(
    (scanId: string) => {
      if (analysisJobPollRef.current) return;

      analysisJobPollRef.current = setInterval(async () => {
        try {
          const allJobs = await getAnalysisJobsByScan(scanId);
          dispatch({ type: 'SET_ANALYSIS_JOBS', jobs: allJobs });

          for (const j of allJobs) {
            const jId = j._id ?? j.id;
            if (j.status !== 'completed' || !j.result || mergedJobIdsRef.current.has(jId)) continue;

            mergedJobIdsRef.current.add(jId);
            if (j.type === 'investigation') {
              dispatch({
                type: 'SET_INVESTIGATION',
                data: j.result as unknown as InvestigationResult,
                narrativeId: j.narrativeIds[0] ?? '',
              });
            } else if (j.type === 'propaganda') {
              dispatch({
                type: 'SET_PROPAGANDA',
                data: j.result as unknown as PropagandaAnalysisResult,
              });
              dispatch({ type: 'SET_PIPELINE', stage: 'propaganda', status: 'done' });
            } else if (j.type === 'downstream') {
              const dsResult = j.result as unknown as DownstreamEffectsResult;
              if (dsResult?.narrativeCorrelations?.length > 0) {
                dispatch({ type: 'SET_DOWNSTREAM', data: dsResult });
                dispatch({ type: 'SET_PIPELINE', stage: 'downstream', status: 'done' });
              }
            }
          }

          const active = allJobs.filter((j) => j.status === 'pending' || j.status === 'running');
          if (active.length === 0 && analysisJobPollRef.current) {
            clearInterval(analysisJobPollRef.current);
            analysisJobPollRef.current = null;

            const sid = activeScanIdRef.current;
            if (sid) {
              const cacheUpdate: Record<string, unknown> = {};
              let mergedInvestigation: NonNullable<typeof state.investigation> | null = null;
              for (const j of allJobs) {
                if (j.status !== 'completed' || !j.result) continue;
                if (j.type === 'investigation') {
                  mergedInvestigation = mergeInvestigationResults(
                    mergedInvestigation,
                    j.result as unknown as NonNullable<typeof state.investigation>,
                  );
                }
                if (j.type === 'propaganda') cacheUpdate.propaganda = j.result;
                if (j.type === 'downstream') cacheUpdate.downstream = j.result;
              }
              if (mergedInvestigation) {
                cacheUpdate.investigation = mergedInvestigation;
                cacheUpdate.investigationNarrativeId =
                  allJobs.find(
                    (j) => j.status === 'completed' && j.type === 'investigation' && j.result,
                  )?.narrativeIds?.[0] ?? '';
              }
              if (Object.keys(cacheUpdate).length > 0) {
                getAnalysisCache(sid)
                  .then((existing) => {
                    saveAnalysisCache(sid, { ...(existing ?? {}), ...cacheUpdate }).catch(
                      () => undefined,
                    );
                  })
                  .catch(() => undefined);
              }
            }
          }
        } catch {
          /* polling error */
        }
      }, 2000);
    },
    [dispatch, mergeInvestigationResults],
  );

  // ---- Helper: run analysis stages 2-6 on collected posts ----
  const runAnalysisStages = useCallback(
    async (posts: RawPost[]) => {
      let narratives: AnalyzedNarrative[] = [];
      const cacheData: Record<string, unknown> = {};

      // Stage 2: Semantic clustering + LLM summaries
      try {
        dispatch({ type: 'SET_PIPELINE', stage: 'analyze', status: 'running' });
        const analyzeResult = await analyzeNarratives(posts);
        narratives = analyzeResult.narratives;
        dispatch({
          type: 'SET_NARRATIVES',
          narratives: analyzeResult.narratives,
          unclusteredCount: analyzeResult.unclustered?.length ?? 0,
        });
        dispatch({ type: 'SET_PIPELINE', stage: 'analyze', status: 'done' });
        if (analyzeResult.saturation) {
          dispatch({ type: 'SET_SATURATION', data: analyzeResult.saturation });
          cacheData.saturation = analyzeResult.saturation;
        }
        cacheData.narratives = analyzeResult.narratives;
        cacheData.unclusteredCount = analyzeResult.unclustered?.length ?? 0;

        // Stage 2b: Auto-investigate top narrative actors (unlocks graph, credibility, evidence)
        const topNarrative = narratives[0];
        if (topNarrative && activeScanIdRef.current) {
          try {
            const topAuthors = (topNarrative.authors ?? []).slice(0, 5).map((a) => a.handle);
            if (topAuthors.length > 0) {
              const investigationJobs = [
                {
                  type: 'investigation' as const,
                  narrativeIds: [topNarrative.id],
                  input: {
                    query,
                    narrativeSummaries: [topNarrative.summary],
                    narratives: narratives
                      .slice(0, 3)
                      .map((n) => ({ id: n.id, summary: n.summary })),
                    userHandles: topAuthors,
                    postCount: posts.length,
                  },
                },
              ];
              await startAnalysisJobs(activeScanIdRef.current, investigationJobs);
              startAnalysisPolling(activeScanIdRef.current);
            }
          } catch {
            /* non-fatal */
          }
        }
      } catch (err) {
        dispatch({ type: 'SET_PIPELINE', stage: 'analyze', status: 'error' });
        dispatch({
          type: 'SET_ERROR',
          error: `Analysis failed: ${err instanceof Error ? err.message : 'unknown'}`,
        });
      }

      // Stage 3: Deviations
      if (narratives.length > 0) {
        try {
          dispatch({ type: 'SET_PIPELINE', stage: 'deviations', status: 'running' });
          const devResult = await fetchDeviations(narratives, posts);
          dispatch({ type: 'SET_DEVIATIONS', data: devResult });
          dispatch({ type: 'SET_PIPELINE', stage: 'deviations', status: 'done' });
          cacheData.deviations = devResult;
        } catch {
          dispatch({ type: 'SET_PIPELINE', stage: 'deviations', status: 'error' });
        }
      }

      // Stage 4: Propaganda
      let propagandaResult: PropagandaAnalysisResult | null = null;
      if (narratives.length > 0) {
        try {
          dispatch({ type: 'SET_PIPELINE', stage: 'propaganda', status: 'running' });
          const propResult = await analyzePropaganda(narratives, posts);
          propagandaResult = propResult;
          dispatch({ type: 'SET_PROPAGANDA', data: propResult });
          dispatch({ type: 'SET_PIPELINE', stage: 'propaganda', status: 'done' });
          cacheData.propaganda = propResult;
        } catch {
          dispatch({ type: 'SET_PIPELINE', stage: 'propaganda', status: 'error' });
        }
      }

      // Stage 4b: Auto-verify claims from propaganda analysis
      if (propagandaResult?.claims?.length && propagandaResult.claims.length > 0) {
        try {
          const verificationResult = await verifyClaims(propagandaResult.claims);
          dispatch({ type: 'SET_CLAIMS', data: verificationResult });
          cacheData.claims = verificationResult;
        } catch {
          /* silent */
        }
      }

      // Stage 5: Entities
      try {
        dispatch({ type: 'SET_PIPELINE', stage: 'entities', status: 'running' });
        // Build insights from posts that have entity/sentiment data from the scan processor.
        // Themes are promoted into topic entities so the topic tab has real content.
        const insights: EntityAnalysisInsight[] = posts
          .map((p) => {
            const entityList: Array<{ name: string; type: string; relevance: number }> = [];
            const authorEntity =
              typeof p.authorHandle === 'string' && p.authorHandle.trim().length > 0
                ? {
                    name: p.authorHandle.trim().replace(/^@+/, ''),
                    type: 'person',
                    relevance: 0.9,
                  }
                : typeof p.authorName === 'string' && p.authorName.trim().length > 0
                  ? {
                      name: p.authorName.trim(),
                      type: 'person',
                      relevance: 0.7,
                    }
                  : null;
            const themeEntities = Array.isArray(p.themes)
              ? p.themes
                  .filter(
                    (theme: unknown): theme is string =>
                      typeof theme === 'string' && theme.trim().length > 0,
                  )
                  .map((theme: string) => ({
                    name: theme.trim(),
                    type: 'topic',
                    relevance: 0.55,
                  }))
              : [];

            const deduped = new Map<string, { name: string; type: string; relevance: number }>();
            for (const entity of [
              ...entityList,
              ...(authorEntity ? [authorEntity] : []),
              ...themeEntities,
            ]) {
              if (!entity || typeof entity.name !== 'string' || entity.name.trim().length === 0)
                continue;
              const key = `${entity.type ?? 'entity'}::${entity.name.trim().toLowerCase()}`;
              if (!deduped.has(key)) {
                deduped.set(key, {
                  name: entity.name.trim(),
                  type:
                    typeof entity.type === 'string' && entity.type.trim().length > 0
                      ? entity.type
                      : 'entity',
                  relevance: typeof entity.relevance === 'number' ? entity.relevance : 0.5,
                });
              }
            }

            return {
              id: p.id,
              platform: p.platform,
              timestamp: p.timestamp,
              entities: Array.from(deduped.values()),
              sentiment: p.sentiment ?? { score: 0, label: 'neutral', confidence: 0 },
            };
          })
          .filter((p) => p.entities.length > 0);
        const entityResult = await analyzeEntities(posts, insights, narratives);
        dispatch({ type: 'SET_ENTITIES', data: entityResult });
        dispatch({ type: 'SET_PIPELINE', stage: 'entities', status: 'done' });
        cacheData.entities = entityResult;
      } catch {
        dispatch({ type: 'SET_PIPELINE', stage: 'entities', status: 'error' });
      }

      // Stage 6: Downstream effects
      if (narratives.length > 0) {
        try {
          dispatch({ type: 'SET_PIPELINE', stage: 'downstream', status: 'running' });
          const dsResult = await fetchDownstreamEffects(narratives, posts);
          dispatch({ type: 'SET_DOWNSTREAM', data: dsResult });
          dispatch({ type: 'SET_PIPELINE', stage: 'downstream', status: 'done' });
          cacheData.downstream = dsResult;
        } catch {
          dispatch({ type: 'SET_PIPELINE', stage: 'downstream', status: 'error' });
        }
      }

      // Stage 7: Auto-investigate specified usernames (from advanced filters)
      if (urlUsernames.length > 0 && activeScanIdRef.current) {
        try {
          const investigationJobs = urlUsernames.map((handle) => ({
            type: 'investigation' as const,
            narrativeIds: [] as string[],
            input: {
              query,
              narrativeSummaries: [],
              narratives: [] as Record<string, unknown>[],
              userHandles: [handle],
              postCount: posts.length,
            },
          }));
          await startAnalysisJobs(activeScanIdRef.current, investigationJobs);
          startAnalysisPolling(activeScanIdRef.current);
          console.log(`Auto-investigating ${urlUsernames.length} usernames from advanced filters`);
        } catch {
          // Non-fatal
        }
      }

      // Save all analysis results to scan job cache
      const scanId = activeScanIdRef.current;
      if (scanId && Object.keys(cacheData).length > 0) {
        saveAnalysisCache(scanId, cacheData).catch(() => {
          // Non-fatal — caching failure doesn't block the UI
        });
      }

      dispatch({ type: 'SET_LOADING', loading: false });
    },
    [dispatch, query, startAnalysisPolling, urlUsernames],
  );

  const handleSelectHistoricalScan = useCallback(
    async (selectedScan: ScanJob) => {
      const selectedScanId = selectedScan._id ?? selectedScan.id;
      if (!selectedScanId) return;

      dispatch({ type: 'RESET' });
      dispatch({ type: 'SET_QUERY', query: selectedScan.query });
      dispatch({ type: 'SET_ERROR', error: null });
      dispatch({ type: 'SET_LOADING', loading: true });

      activeScanIdRef.current = selectedScanId;
      setScanJob(selectedScan);
      scanPostsFetchedRef.current = false;

      const nextParams = new URLSearchParams();
      nextParams.set('q', selectedScan.query);
      const activeInvestigationId =
        investigationRecord?._id ?? investigationRecord?.id ?? invId ?? null;
      if (activeInvestigationId) {
        nextParams.set('inv', activeInvestigationId);
      }
      nextParams.set('scan', selectedScanId);
      router.replace(`/results?${nextParams.toString()}`, { scroll: false });
    },
    [dispatch, investigationRecord, invId, router],
  );

  // ---- Scan polling: when a scan is active, poll status every 2s ----
  useEffect(() => {
    if (!scanJob) return undefined;

    const scanId = scanJob._id ?? scanJob.id;
    const isActive = scanJob.status === 'pending' || scanJob.status === 'running';

    if (!isActive) {
      // Scan is done — clean up and fetch final posts
      if (scanPollRef.current) {
        clearInterval(scanPollRef.current);
        scanPollRef.current = null;
      }

      if (!scanPostsFetchedRef.current) {
        scanPostsFetchedRef.current = true;
        activeScanIdRef.current = scanId;
        dispatch({ type: 'SET_PIPELINE', stage: 'search', status: 'done' });

        // Always fetch posts when scan completes
        getScanPosts(scanId)
          .then(({ posts }) => {
            if (posts.length > 0) {
              const summary = {
                total: posts.length,
                positive: posts.filter((p) => p.sentiment?.label === 'positive').length,
                negative: posts.filter((p) => p.sentiment?.label === 'negative').length,
                neutral: posts.filter((p) => p.sentiment?.label === 'neutral').length,
                byPlatform: posts.reduce<Record<string, number>>((acc, p) => {
                  acc[p.platform] = (acc[p.platform] || 0) + 1;
                  return acc;
                }, {}),
              };
              dispatch({ type: 'SET_SEARCH_DATA', posts, insights: [], summary });
              runAnalysisStages(posts);
            } else {
              dispatch({ type: 'SET_ERROR', error: 'Scan completed but no posts were collected' });
              dispatch({ type: 'SET_LOADING', loading: false });
            }
          })
          .catch((err) => {
            dispatch({ type: 'SET_ERROR', error: `Failed to fetch scan results: ${err}` });
            dispatch({ type: 'SET_LOADING', loading: false });
          });
      }
      return undefined;
    }

    // Poll every 2s while scan is active
    if (!scanPollRef.current) {
      scanPollRef.current = setInterval(async () => {
        try {
          const status = await getScanStatus(scanId);
          setScanJob(status);
        } catch {
          // Polling error — will retry next interval
        }
      }, 2000);
    }

    return () => {
      if (scanPollRef.current) {
        clearInterval(scanPollRef.current);
        scanPollRef.current = null;
      }
    };
  }, [scanJob, dispatch, runAnalysisStages]);

  // ---- Run analysis pipeline: load cached data first, then enrich ----
  useEffect(() => {
    if (!query || pipelineRan.current) return;
    pipelineRan.current = true;

    dispatch({ type: 'SET_QUERY', query });
    dispatch({ type: 'SET_ERROR', error: null });

    const run = async () => {
      let posts: RawPost[] = [];
      let resolvedPersistedScan: ScanJob | null = null;
      let resolvedInvestigationId: string | null = invId;
      let resolvedScanId: string | null = requestedScanId;

      // --- Stage 1: Try cached snapshot first, then fresh search ---
      dispatch({ type: 'SET_PIPELINE', stage: 'search', status: 'running' });
      dispatch({ type: 'SET_LOADING', loading: true });

      // Try loading from cached snapshot — ONLY if not a fresh search
      let loadedFromCache = false;
      if (!freshSearch) {
        // Try 1: Load from investigation snapshot
        try {
          let targetInvId = invId;
          if (!targetInvId) {
            const allInvestigations = await fetchInvestigations();
            const match = allInvestigations.find((i) => i.query === query);
            if (match) targetInvId = match._id ?? match.id ?? null;
          }

          if (targetInvId) {
            const { investigation, snapshot, projectDossier, mentalModel, dossierOverlaps } =
              await fetchInvestigation(targetInvId);
            resolvedInvestigationId = targetInvId;
            resolvedScanId =
              requestedScanId ?? snapshot?.scanId ?? investigation.lastScanId ?? null;
            setInvestigationRecord(investigation);
            setProjectDossier(projectDossier);
            setMentalModel(mentalModel);
            setProjectDossierOverlaps(dossierOverlaps);
            dispatch({
              type: 'SET_INVESTIGATION_ID',
              id: investigation._id ?? investigation.id ?? null,
            });
            if (snapshot && Array.isArray(snapshot.posts) && snapshot.posts.length > 0) {
              posts = snapshot.posts as RawPost[];
              dispatch({
                type: 'SET_SEARCH_DATA',
                posts,
                insights: [],
                summary: snapshot.summary ?? null,
              });
              if (Array.isArray(snapshot.narratives) && snapshot.narratives.length > 0) {
                dispatch({
                  type: 'SET_NARRATIVES',
                  narratives: snapshot.narratives as AnalyzedNarrative[],
                  unclusteredCount: 0,
                });
                dispatch({ type: 'SET_PIPELINE', stage: 'analyze', status: 'done' });
              }
              dispatch({ type: 'SET_PIPELINE', stage: 'search', status: 'done' });
              loadedFromCache = true;
            }
          }
        } catch {
          // Fall through
        }

        // Try 2: Load from most recent completed scan job (scan queue stores posts too)
        if (!loadedFromCache) {
          try {
            const matchingScan = await findPersistedScan(
              query,
              resolvedInvestigationId,
              resolvedScanId,
            );
            if (matchingScan) {
              resolvedPersistedScan = matchingScan;
              activeScanIdRef.current = matchingScan._id ?? matchingScan.id;
              setScanJob(matchingScan);
              const { posts: scanPosts } = await getScanPosts(activeScanIdRef.current);
              if (scanPosts.length > 0) {
                posts = scanPosts;
                dispatch({
                  type: 'SET_SEARCH_DATA',
                  posts,
                  insights: [],
                  summary: buildPostSummary(scanPosts),
                });
                dispatch({ type: 'SET_PIPELINE', stage: 'search', status: 'done' });
                loadedFromCache = true;
              }
            }
          } catch {
            // Fall through
          }
        }
      }

      // If loaded from cache, try restoring analysis results first
      if (loadedFromCache) {
        if (posts.length > 0) {
          // Try to restore from analysis cache (instant — no API calls)
          let restored = false;
          const scanForQuery =
            resolvedPersistedScan ??
            (await findPersistedScan(query, resolvedInvestigationId, resolvedScanId));
          if (scanForQuery) {
            activeScanIdRef.current = scanForQuery._id ?? scanForQuery.id;
            setScanJob(scanForQuery);
            restored = await restoreFromCache(activeScanIdRef.current);
          }

          // If no cached analysis exists, fall back to re-analysis as a last resort.
          if (!restored) {
            await runAnalysisStages(posts);
          }
        } else {
          dispatch({ type: 'SET_LOADING', loading: false });
        }
        return;
      }

      // ---- FRESH SEARCH: Use scan queue ----
      if (freshSearch) {
        try {
          const activeInvestigationId =
            investigationRecord?._id ??
            investigationRecord?.id ??
            invId ??
            state.investigationId ??
            undefined;
          const { scanId } = await startScan(
            enhancedQuery,
            urlPlatforms,
            urlLimit,
            urlTimeRange,
            activeInvestigationId,
            urlSearchMode,
          );
          const initialStatus = await getScanStatus(scanId);
          setScanJob(initialStatus);
          scanPostsFetchedRef.current = false;

          // Remove fresh=1 from URL so page refresh doesn't re-trigger scan
          const nextParams = new URLSearchParams(searchParamsString);
          nextParams.delete('fresh');
          nextParams.set('q', query);
          if (activeInvestigationId) {
            nextParams.set('inv', activeInvestigationId);
          }
          router.replace(`/results?${nextParams.toString()}`, { scroll: false });
        } catch (err) {
          dispatch({ type: 'SET_PIPELINE', stage: 'search', status: 'error' });
          dispatch({
            type: 'SET_ERROR',
            error: `Scan failed: ${err instanceof Error ? err.message : 'unknown'} — is Redis running?`,
          });
          dispatch({ type: 'SET_LOADING', loading: false });
        }
        return;
      }

      // No cache and not fresh — nothing to show
      dispatch({ type: 'SET_LOADING', loading: false });
    };

    run();
  }, [
    query,
    dispatch,
    findPersistedScan,
    runAnalysisStages,
    investigationRecord,
    invId,
    requestedScanId,
    state.investigationId,
    buildPostSummary,
    enhancedQuery,
    restoreFromCache,
    urlPlatforms,
    urlLimit,
    urlTimeRange,
    urlSearchMode,
    freshSearch,
    searchParamsString,
    router,
  ]);

  // ---- Fetch alerts ----
  useEffect(() => {
    if (!state.investigationId) return;
    fetchAlerts(state.investigationId)
      .then((alerts) => dispatch({ type: 'SET_ALERTS', alerts }))
      .catch(() => undefined);
  }, [state.investigationId, dispatch]);

  // ---- Keyboard shortcuts for center modes ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const key = e.key.toUpperCase();
      const mode = SHORTCUT_MAP.get(key);
      if (mode) {
        setCenterMode(mode);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setCenterMode]);

  // ---- Action handlers ----
  /**
   * "Analyze this narrative" from the detail panel — auto-selects and queues
   * the full analysis (investigation + propaganda + downstream) via the queue.
   */
  const handleInvestigate = useCallback(
    async (narrativeId: string) => {
      // Auto-select this narrative and trigger unified analysis
      if (!state.selectedNarrativeIds.includes(narrativeId)) {
        dispatch({ type: 'TOGGLE_NARRATIVE_SELECTION', narrativeId });
      }
      dispatch({ type: 'SET_INVESTIGATING', narrativeId });

      const scanId = activeScanIdRef.current;
      if (!scanId) return;

      const narrative = state.narratives.find((n) => n.id === narrativeId);
      if (!narrative) return;

      const handles = Array.from(
        new Set(
          narrative.authors
            .map((a) => a.handle)
            .filter((h): h is string => Boolean(h) && h !== 'unknown'),
        ),
      ).slice(0, 20);

      const jobs: StartAnalysisJobRequest[] = [
        // Investigation
        {
          type: 'investigation',
          narrativeIds: [narrativeId],
          input: {
            query: state.query,
            narrativeSummaries: [narrative.summary],
            narratives: [narrative as unknown as Record<string, unknown>],
            userHandles: handles,
            postCount: state.posts.length,
          },
        },
        // Propaganda
        {
          type: 'propaganda',
          narrativeIds: [narrativeId],
          input: {
            query: state.query,
            narrativeSummaries: [narrative.summary],
            narratives: [narrative as unknown as Record<string, unknown>],
            postCount: state.posts.length,
          },
        },
        // Downstream effects
        {
          type: 'downstream',
          narrativeIds: [narrativeId],
          input: {
            query: state.query,
            narrativeSummaries: [narrative.summary],
            narratives: [narrative as unknown as Record<string, unknown>],
            postCount: state.posts.length,
          },
        },
      ];

      try {
        await startAnalysisJobs(scanId, jobs);
        startAnalysisPolling(scanId);
      } catch (err) {
        dispatch({ type: 'SET_INVESTIGATING', narrativeId: null });
        dispatch({
          type: 'SET_ERROR',
          error: `Analysis failed: ${err instanceof Error ? err.message : 'unknown'}`,
        });
      }
    },
    [
      state.narratives,
      state.posts,
      state.query,
      state.selectedNarrativeIds,
      dispatch,
      startAnalysisPolling,
    ],
  );

  // ---- Analysis queue handlers (startAnalysisPolling defined above) ----

  /**
   * Unified "Analyze" — queues investigation + propaganda + downstream for selected narratives.
   * Investigation runs per-narrative (one job each), propaganda + downstream run as batch.
   */
  const handleAnalyzeSelected = useCallback(async () => {
    const scanId = activeScanIdRef.current;
    if (!scanId || state.selectedNarrativeIds.length === 0) return;

    const selectedNarratives = state.narratives.filter((n) =>
      state.selectedNarrativeIds.includes(n.id),
    );
    const sharedInput = {
      query: state.query,
      narrativeSummaries: selectedNarratives.map((n) => n.summary),
      narratives: selectedNarratives as unknown as Record<string, unknown>[],
      postCount: state.posts.length,
    };

    const jobs: StartAnalysisJobRequest[] = [
      // Per-narrative investigation jobs
      ...state.selectedNarrativeIds.map((nId) => {
        const narrative = state.narratives.find((n) => n.id === nId);
        const handles = narrative
          ? Array.from(
              new Set(
                narrative.authors
                  .map((a) => a.handle)
                  .filter((h): h is string => Boolean(h) && h !== 'unknown'),
              ),
            ).slice(0, 20)
          : [];
        return {
          type: 'investigation' as const,
          narrativeIds: [nId],
          input: {
            query: state.query,
            narrativeSummaries: [narrative?.summary ?? ''],
            narratives: narrative ? [narrative as unknown as Record<string, unknown>] : [],
            userHandles: handles,
            postCount: state.posts.length,
          },
        };
      }),
      // Batch propaganda
      {
        type: 'propaganda' as const,
        narrativeIds: state.selectedNarrativeIds,
        input: sharedInput,
      },
      // Batch downstream effects
      {
        type: 'downstream' as const,
        narrativeIds: state.selectedNarrativeIds,
        input: sharedInput,
      },
    ];

    try {
      await startAnalysisJobs(scanId, jobs);
      startAnalysisPolling(scanId);
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: `Failed to start analysis jobs: ${err}` });
    }
  }, [
    state.selectedNarrativeIds,
    state.narratives,
    state.query,
    state.posts.length,
    dispatch,
    startAnalysisPolling,
  ]);

  const handleCancelAnalysisJob = useCallback(
    async (jobId: string) => {
      try {
        await cancelAnalysisJob(jobId);
        const scanId = activeScanIdRef.current;
        if (scanId) {
          const allJobs = await getAnalysisJobsByScan(scanId);
          dispatch({ type: 'SET_ANALYSIS_JOBS', jobs: allJobs });
        }
      } catch {
        /* silent */
      }
    },
    [dispatch],
  );

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (analysisJobPollRef.current) {
        clearInterval(analysisJobPollRef.current);
        analysisJobPollRef.current = null;
      }
    };
  }, []);

  const handleRunPropaganda = useCallback(async () => {
    if (state.narratives.length === 0 || state.posts.length === 0) return;
    try {
      dispatch({ type: 'SET_PIPELINE', stage: 'propaganda', status: 'running' });
      const result = await analyzePropaganda(state.narratives, state.posts);
      dispatch({ type: 'SET_PROPAGANDA', data: result });
      dispatch({ type: 'SET_PIPELINE', stage: 'propaganda', status: 'done' });
    } catch {
      dispatch({ type: 'SET_PIPELINE', stage: 'propaganda', status: 'error' });
    }
  }, [state.narratives, state.posts, dispatch]);

  const [verifyingClaims, setVerifyingClaims] = useState(false);

  const handleVerifyClaims = useCallback(async () => {
    const claims: ExtractedClaim[] = state.propaganda?.claims ?? [];
    if (claims.length === 0) return;
    setVerifyingClaims(true);
    try {
      const result = await verifyClaims(claims);
      dispatch({ type: 'SET_CLAIMS', data: result });
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        error: `Claim verification failed: ${err instanceof Error ? err.message : 'unknown'}`,
      });
    } finally {
      setVerifyingClaims(false);
    }
  }, [state.propaganda, dispatch]);

  // ---- Identity record loading ----
  useEffect(() => {
    if (!state.selectedActorHandle) {
      dispatch({ type: 'SET_IDENTITY', identity: null });
      return;
    }
    dispatch({ type: 'SET_IDENTITY_LOADING', loading: true });
    getIdentityByHandle(state.selectedActorHandle)
      .then((identity) => dispatch({ type: 'SET_IDENTITY', identity }))
      .catch(() => dispatch({ type: 'SET_IDENTITY', identity: null }));
  }, [state.selectedActorHandle, dispatch]);

  const profilePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleGenerateProfile = useCallback(
    async (identityId: string, mode: MagiProfileMode) => {
      try {
        const scanId = activeScanIdRef.current;
        const validTimestamps = state.posts
          .map((post) => new Date(post.timestamp).getTime())
          .filter((value) => Number.isFinite(value));

        if (mode === 'investigation-window' && (!scanId || validTimestamps.length === 0)) {
          dispatch({
            type: 'SET_ERROR',
            error: 'No active investigation window is available for a window-scoped MAGI profile',
          });
          return;
        }

        const startDate =
          validTimestamps.length > 0 ? new Date(Math.min(...validTimestamps)).toISOString() : null;
        const endDate =
          validTimestamps.length > 0 ? new Date(Math.max(...validTimestamps)).toISOString() : null;

        await generateMagiProfile(identityId, {
          mode,
          investigationId: state.investigationId,
          scanId: mode === 'current-state' || mode === 'deep-history' ? null : scanId,
          startDate: mode === 'current-state' || mode === 'deep-history' ? null : startDate,
          endDate: mode === 'current-state' || mode === 'deep-history' ? null : endDate,
        });
        // Immediately refresh to show "queued" status
        if (state.selectedActorHandle) {
          const updated = await getIdentityByHandle(state.selectedActorHandle);
          dispatch({ type: 'SET_IDENTITY', identity: updated });
        }
        // Poll until profile is complete (bounded — generation stuck past 5min is abandoned)
        if (profilePollRef.current) clearInterval(profilePollRef.current);
        let profilePollCount = 0;
        profilePollRef.current = setInterval(async () => {
          profilePollCount += 1;
          if (!state.selectedActorHandle || profilePollCount > 100) {
            if (profilePollRef.current) clearInterval(profilePollRef.current);
            profilePollRef.current = null;
            return;
          }
          const refreshed = await getIdentityByHandle(state.selectedActorHandle);
          if (refreshed) {
            dispatch({ type: 'SET_IDENTITY', identity: refreshed });
            if (
              refreshed.profileGenerationStatus === 'complete' ||
              refreshed.profileGenerationStatus === 'failed'
            ) {
              if (profilePollRef.current) clearInterval(profilePollRef.current);
              profilePollRef.current = null;
            }
          }
        }, 3000);
      } catch (err) {
        dispatch({ type: 'SET_ERROR', error: `Profile generation failed: ${err}` });
      }
    },
    [state.posts, state.investigationId, state.selectedActorHandle, dispatch],
  );

  const handleRunDownstream = useCallback(async () => {
    if (state.narratives.length === 0 || state.posts.length === 0) return;
    try {
      dispatch({ type: 'SET_PIPELINE', stage: 'downstream', status: 'running' });
      const result = await fetchDownstreamEffects(state.narratives, state.posts);
      dispatch({ type: 'SET_DOWNSTREAM', data: result });
      dispatch({ type: 'SET_PIPELINE', stage: 'downstream', status: 'done' });
    } catch {
      dispatch({ type: 'SET_PIPELINE', stage: 'downstream', status: 'error' });
    }
  }, [state.narratives, state.posts, dispatch]);

  const handleGenerateReport = useCallback(async () => {
    if (!state.summary || state.narratives.length === 0) return;
    try {
      const result = await generateReport({
        query: state.query,
        summary: state.summary,
        narratives: state.narratives,
        investigation: state.investigation ?? undefined,
        format: 'markdown',
      });
      // Open in new tab
      const blob = new Blob([result.content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      // silent
    }
  }, [state.query, state.summary, state.narratives, state.investigation]);

  const handleAddEvidenceSeed = useCallback(
    async (seed: {
      kind:
        | 'url'
        | 'youtube'
        | 'article'
        | 'post'
        | 'wallet'
        | 'contract'
        | 'domain'
        | 'document'
        | 'note';
      value: string;
      notes?: string | null;
    }) => {
      setEvidenceSeedSaving(true);
      try {
        let targetInvestigation = investigationRecord;

        if (!targetInvestigation) {
          targetInvestigation = await createOrGetInvestigation(query, {
            platforms: urlPlatforms?.length ? urlPlatforms : undefined,
            timeRange: urlTimeRange,
          });
          const targetInvestigationId = getInvestigationId(targetInvestigation);
          if (!targetInvestigationId) {
            throw new Error('Created investigation missing id');
          }
          setInvestigationRecord(targetInvestigation);
          dispatch({ type: 'SET_INVESTIGATION_ID', id: targetInvestigationId });

          const nextParams = new URLSearchParams(searchParams.toString());
          nextParams.set('inv', targetInvestigationId);
          if (!nextParams.has('q')) {
            nextParams.set('q', query);
          }
          router.replace(`/results?${nextParams.toString()}`, { scroll: false });
        }

        const targetInvestigationId = getInvestigationId(targetInvestigation);
        if (!targetInvestigationId) {
          throw new Error('Target investigation missing id');
        }

        const updated = await addInvestigationEvidenceSeed(targetInvestigationId, {
          kind: seed.kind,
          value: seed.value,
          notes: seed.notes ?? null,
        });

        setInvestigationRecord(updated);
        dispatch({ type: 'SET_INVESTIGATION_ID', id: getInvestigationId(updated) });
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          error: `Failed to attach evidence seed: ${err instanceof Error ? err.message : 'unknown error'}`,
        });
      } finally {
        setEvidenceSeedSaving(false);
      }
    },
    [
      investigationRecord,
      query,
      urlPlatforms,
      urlTimeRange,
      searchParams,
      router,
      dispatch,
    ],
  );

  const handleBuildProjectDossier = useCallback(async () => {
    const investigationId = getInvestigationId(investigationRecord);
    if (!investigationId) return;
    setProjectDossierSaving(true);
    try {
      const result = await buildProjectDossier(investigationId);
      setInvestigationRecord(result.investigation);
      setProjectDossier(result.projectDossier);
      setProjectDossierOverlaps(result.dossierOverlaps);
      dispatch({ type: 'SET_INVESTIGATION_ID', id: getInvestigationId(result.investigation) });
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        error: `Failed to build project dossier: ${err instanceof Error ? err.message : 'unknown error'}`,
      });
    } finally {
      setProjectDossierSaving(false);
    }
  }, [investigationRecord, dispatch]);

  const handleRefreshProjectDossier = useCallback(async () => {
    const investigationId = getInvestigationId(investigationRecord);
    if (!investigationId || !investigationRecord?.linkedProjectDossierId) return;
    try {
      const result = await fetchProjectDossier(investigationId);
      setProjectDossier(result.projectDossier);
      setProjectDossierOverlaps(result.dossierOverlaps);
    } catch {
      // silent
    }
  }, [investigationRecord]);

  const handleBuildMentalModel = useCallback(async () => {
    const investigationId = getInvestigationId(investigationRecord);
    if (!investigationId) return;
    setMentalModelSaving(true);
    try {
      const result = await buildMentalModel(investigationId);
      setInvestigationRecord(result.investigation);
      setMentalModel(result.mentalModel);
      dispatch({ type: 'SET_INVESTIGATION_ID', id: getInvestigationId(result.investigation) });
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        error: `Failed to build mental model: ${err instanceof Error ? err.message : 'unknown error'}`,
      });
    } finally {
      setMentalModelSaving(false);
    }
  }, [investigationRecord, dispatch]);

  const handleRefreshMentalModel = useCallback(async () => {
    const investigationId = getInvestigationId(investigationRecord);
    if (!investigationId) return;
    try {
      const result = await fetchMentalModel(investigationId);
      setMentalModel(result.mentalModel);
    } catch {
      // silent
    }
  }, [investigationRecord]);

  const handleRefresh = useCallback(async () => {
    // Ignore refresh while a scan is already in flight — starting a second
    // scan would double-fetch every source and race the poller.
    if (scanJob && (scanJob.status === 'pending' || scanJob.status === 'running')) {
      return;
    }
    // Reset all state
    scanPostsFetchedRef.current = false;
    setScanJob(null);
    if (scanPollRef.current) {
      clearInterval(scanPollRef.current);
      scanPollRef.current = null;
    }
    dispatch({ type: 'RESET' });
    dispatch({ type: 'SET_QUERY', query });
    dispatch({ type: 'SET_LOADING', loading: true });
    dispatch({ type: 'SET_PIPELINE', stage: 'search', status: 'running' });

    // Start a new scan directly — don't navigate, don't rely on useEffect
    try {
      const { scanId } = await startScan(
        enhancedQuery,
        urlPlatforms,
        urlLimit,
        urlTimeRange,
        investigationRecord?._id ?? investigationRecord?.id ?? state.investigationId ?? undefined,
        urlSearchMode,
      );
      const initialStatus = await getScanStatus(scanId);
      setScanJob(initialStatus);
    } catch (err) {
      dispatch({ type: 'SET_PIPELINE', stage: 'search', status: 'error' });
      dispatch({
        type: 'SET_ERROR',
        error: `Scan failed: ${err instanceof Error ? err.message : 'unknown'} — is Redis running?`,
      });
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [
    dispatch,
    query,
    enhancedQuery,
    urlPlatforms,
    urlLimit,
    urlTimeRange,
    investigationRecord,
    state.investigationId,
    urlSearchMode,
    scanJob,
  ]);

  const handleCancelScan = useCallback(async () => {
    if (!scanJob) return;
    try {
      await cancelScan(scanJob._id ?? scanJob.id);
      const updated = await getScanStatus(scanJob._id ?? scanJob.id);
      setScanJob(updated);
    } catch {
      // silent
    }
  }, [scanJob]);

  const handleRetryScanConnector = useCallback(
    async (connector: string) => {
      if (!scanJob) return;
      try {
        await retryScanConnector(scanJob._id ?? scanJob.id, connector);
        scanPostsFetchedRef.current = false;
        const updated = await getScanStatus(scanJob._id ?? scanJob.id);
        setScanJob(updated);
      } catch {
        // silent
      }
    },
    [scanJob],
  );

  // ---- Ticker items from alerts ----
  const tickerItems: NervTickerItem[] = useMemo(() => {
    // Generate alerts from narrative data if no stored alerts
    const items: NervTickerItem[] = [];

    // From state alerts
    for (const alert of state.alerts) {
      items.push({
        id: alert._id,
        severity: alert.severity,
        text: alert.title,
        timestamp: new Date(alert.createdAt).toLocaleTimeString(),
      });
    }

    // Generate from narrative velocity
    if (items.length === 0) {
      for (const n of state.narratives) {
        if (n.velocity?.trend === 'surging') {
          items.push({
            id: `vel-${n.id}`,
            severity: 'critical',
            text: `Velocity spike: "${n.summary.slice(0, 60)}"`,
            timestamp: 'NOW',
          });
        }
      }

      if (state.narratives.length > 0) {
        items.push({
          id: 'cluster-count',
          severity: 'info',
          text: `${state.narratives.length} narrative clusters detected across ${Object.keys(state.summary?.byPlatform ?? {}).length} platforms`,
          timestamp: new Date().toLocaleTimeString(),
        });
      }

      if (state.propaganda?.overallAssessment?.manipulationLikelihood === 'high') {
        items.push({
          id: 'manip-high',
          severity: 'critical',
          text: 'HIGH manipulation likelihood detected in narrative ecosystem',
          timestamp: 'NOW',
        });
      }
    }

    return items;
  }, [state.alerts, state.narratives, state.summary, state.propaganda]);

  // ---- Determine pipeline running state ----
  const pipelineRunning = Object.values(state.pipeline).some((s) => s === 'running');

  // ---- No query state ----
  if (!query) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-4">
            NO ACTIVE INVESTIGATION
          </div>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="px-4 py-2 text-[10px] font-mono uppercase tracking-wider border border-nerv-orange text-nerv-orange hover:bg-nerv-orange/10 rounded-sm transition-colors"
          >
            RETURN TO COMMAND CENTER
          </button>
        </div>
      </div>
    );
  }

  // ---- Center panel content ----
  const renderCenterPanel = () => {
    switch (state.centerMode) {
      case 'temporal':
        return (
          <TemporalHeatmap
            narratives={state.narratives}
            posts={state.posts}
            timeRange={scanJob?.settings?.timeRange ?? urlTimeRange}
            scanCreatedAt={scanJob?.createdAt ?? null}
            selectedNarrativeId={state.selectedNarrativeId}
            onSelectNarrative={selectNarrative}
          />
        );
      case 'actors':
        return (
          <ActorsMatrix
            narratives={state.narratives}
            posts={state.posts}
            investigation={state.investigation}
            selectedHandle={state.selectedActorHandle}
            onSelectActor={selectActor}
          />
        );
      case 'claims':
        return (
          <ClaimsMatrix
            propaganda={state.propaganda}
            claims={state.claims}
            selectedClaimIndex={state.selectedClaimIndex}
            onSelectClaim={selectClaim}
            onRunPropaganda={handleRunPropaganda}
            propagandaLoading={state.pipeline.propaganda === 'running'}
            onVerifyClaims={handleVerifyClaims}
            verifyingClaims={verifyingClaims}
          />
        );
      case 'effects':
        return (
          <EffectsChain
            downstream={state.downstream}
            onRunDownstream={handleRunDownstream}
            downstreamLoading={state.pipeline.downstream === 'running'}
          />
        );
      case 'globe': {
        if (state.posts.length === 0 || state.narratives.length === 0) {
          return (
            <div className="flex items-center justify-center h-full">
              <span className="text-[10px] font-mono text-nerv-text-muted animate-nerv-pulse uppercase tracking-widest">
                {state.loading ? 'LOADING GLOBE DATA...' : 'AWAITING NARRATIVE DATA FOR GLOBE'}
              </span>
            </div>
          );
        }
        return (
          <NarrativeGlobeLazy
            points={memoizedGlobeData.points}
            arcs={memoizedGlobeData.arcs}
            onPointClick={handleGlobePointClick}
          />
        );
      }
      case 'entities':
        return (
          <EntityPanel
            entities={state.entities}
            selectedActorHandle={state.selectedActorHandle}
            onSelectActor={selectActor}
          />
        );
      case 'genealogy': {
        // Build single-snapshot lineages from current narratives
        const singleSnapshotLineages = state.narratives.map((n) => ({
          currentId: n.id,
          currentSummary: n.summary ?? 'Untitled',
          history: [
            {
              snapshotId: 'current',
              snapshotTimestamp: new Date().toISOString(),
              narrativeId: n.id,
              summary: n.summary ?? 'Untitled',
              postCount: n.postIndices?.length ?? 0,
              avgSentiment: n.avgSentiment ?? 0,
              similarity: 1,
            },
          ],
          events: [
            {
              timestamp: new Date().toISOString(),
              type: 'emerged' as const,
              description: `Narrative first detected`,
            },
          ],
          status: 'active' as const,
        }));
        return (
          <GenealogyPanel
            lineages={singleSnapshotLineages}
            onRefresh={handleRefresh}
            refreshing={pipelineRunning}
          />
        );
      }
      case 'flow':
        return <PropagationFlow investigation={state.investigation} />;
      case 'evidence':
        return (
          <EvidenceChainPanel
            claims={state.claims}
            propaganda={state.propaganda}
            onTriggerAnalysis={() => handleRunPropaganda()}
          />
        );
      case 'graph':
        return (
          <SocialGraphPanel
            investigation={state.investigation}
            onSelectActor={selectActor}
            onTriggerAnalysis={() => handleAnalyzeSelected()}
          />
        );
      case 'radar':
        return (
          <NarrativeRadar
            narratives={state.narratives}
            selectedIds={
              radarSelectedIds.length > 0
                ? radarSelectedIds
                : state.selectedNarrativeId
                  ? [state.selectedNarrativeId]
                  : []
            }
            deviations={state.deviations}
            onCompare={handleCompareNarratives}
          />
        );
      case 'platforms':
        return (
          <PlatformComparisonPanel
            comparison={state.platformComparison}
            loading={comparingPlatforms}
            onRunComparison={handlePlatformComparison}
          />
        );
      case 'intelligence':
        return (
          <IntelligenceReportPanel
            report={state.intelligenceReport}
            loading={intelligenceLoading}
            onRunAssessment={handleIntelligence}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 44px)' }}>
      {/* Top bar: compact header + grouped tabs */}
      <div className="shrink-0 border-b border-nerv-border bg-nerv-bg">
        {/* Row 1: query + status badges + refresh — single compact line */}
        <div className="flex items-center justify-between px-4 h-8">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[9px] font-mono text-nerv-text-muted uppercase tracking-wider shrink-0">
              NERV {'\u25B8'}
            </span>
            {investigationRecord?.name && (
              <span
                className="text-[10px] font-mono uppercase tracking-[0.18em] text-nerv-text-muted truncate max-w-[260px]"
                title={investigationRecord.name}
              >
                {investigationRecord.name}
              </span>
            )}
            {investigationRecord?.name && (
              <span className="text-[9px] font-mono text-nerv-text-muted/50 shrink-0">
                {'\u2192'}
              </span>
            )}
            <span
              className="text-[11px] font-mono font-bold text-nerv-orange truncate max-w-[300px]"
              title={query}
            >
              &quot;{query}&quot;
            </span>
            <NervStatus
              status={pipelineRunning ? 'warning' : state.error ? 'critical' : 'online'}
              label={pipelineRunning ? 'PROCESSING' : state.error ? 'ERROR' : 'ACTIVE'}
              size="sm"
            />
            {state.narratives.length > 0 && (
              <NervBadge label={`${state.narratives.length}N`} variant="muted" size="sm" />
            )}
            <SaturationIndicator
              saturation={state.saturation}
              onSuggestDeepScan={pipelineRunning ? undefined : handleRefresh}
            />
            {state.intelligenceReport && (
              <NervBadge
                label={`INTEL:${state.intelligenceReport.type.toUpperCase()}`}
                variant="blue"
                size="sm"
              />
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {urlSearchMode === 'person' &&
              (() => {
                const depthLadder = ['3d', '14d', '30d', '90d'];
                const currentIdx = depthLadder.indexOf(urlTimeRange);
                const nextDepth = currentIdx >= 0 ? depthLadder[currentIdx + 1] : '14d';
                if (!nextDepth) return null;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams(searchParamsString);
                      next.set('timeRange', nextDepth);
                      next.set('fresh', '1');
                      router.push(`/results?${next.toString()}`);
                    }}
                    disabled={pipelineRunning}
                    className={[
                      'text-[9px] font-mono uppercase tracking-wider px-2 py-1 border rounded-sm transition-colors',
                      pipelineRunning
                        ? 'border-nerv-border text-nerv-text-muted cursor-wait'
                        : 'border-nerv-blue/50 text-nerv-blue hover:bg-nerv-blue/10',
                    ].join(' ')}
                    title={`Re-scan with a wider ${nextDepth} window`}
                  >
                    Extend → {nextDepth}
                  </button>
                );
              })()}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={pipelineRunning}
              className={[
                'text-[9px] font-mono uppercase tracking-wider px-2 py-1 border rounded-sm transition-colors',
                pipelineRunning
                  ? 'border-nerv-border text-nerv-text-muted cursor-wait'
                  : 'border-nerv-orange/50 text-nerv-orange hover:bg-nerv-orange/10',
              ].join(' ')}
            >
              REFRESH
            </button>
          </div>
        </div>

        {queryTabs.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto px-4 py-1 border-t border-nerv-border/40 bg-nerv-bg-panel/20">
            <span className="text-[8px] font-mono uppercase tracking-[0.18em] text-nerv-text-muted shrink-0">
              Case Scans
            </span>
            <div className="flex items-center gap-1.5">
              {queryTabs.map((tab) => {
                const tabScanId = tab._id ?? tab.id;
                const active = activeQueryTabKey === tab.query;
                return (
                  <button
                    key={tabScanId}
                    type="button"
                    onClick={() => handleSelectHistoricalScan(tab)}
                    className={[
                      'shrink-0 px-3 py-1.5 border rounded-sm text-left transition-all',
                      active
                        ? 'border-nerv-orange/60 bg-nerv-orange/10 text-nerv-orange'
                        : 'border-nerv-border text-nerv-text-muted hover:text-nerv-text hover:border-nerv-blue/50 hover:bg-nerv-bg-elevated/30',
                    ].join(' ')}
                    title={`${tab.query} • ${new Date(tab.createdAt).toLocaleString()}`}
                  >
                    <div className="text-[9px] font-mono uppercase tracking-[0.14em] max-w-[220px] truncate">
                      {tab.query}
                    </div>
                    <div className="text-[8px] font-mono opacity-80 mt-0.5">
                      {tab.totalPosts} posts • {tab.settings?.timeRange ?? '7d'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Row 2: Grouped mode tabs */}
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-1 border-t border-nerv-border/50">
          {CENTER_MODE_GROUPS.map((group) => (
            <div key={group.label} className="flex items-center gap-0.5 shrink-0">
              <span className="text-[7px] font-mono uppercase text-nerv-text-muted/50 mr-1">
                {group.label}
              </span>
              {group.modes.map((mode) => {
                const active = state.centerMode === mode.key;
                return (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => setCenterMode(mode.key)}
                    className={`px-2 py-1 text-[9px] font-mono uppercase tracking-wider transition-all rounded-sm ${
                      active
                        ? 'text-nerv-orange bg-nerv-orange/10'
                        : 'text-nerv-text-muted hover:text-nerv-text-secondary hover:bg-nerv-bg-panel/30'
                    }`}
                    title={`${mode.label} (${mode.shortcut})`}
                  >
                    {mode.label}
                  </button>
                );
              })}
              {/* Group separator */}
              <span className="w-px h-3 bg-nerv-border/30 mx-1" />
            </div>
          ))}
        </div>

        {/* Progress bars — only shown when actively running */}
        {pipelineRunning && (
          <div className="px-4 pb-1 border-t border-nerv-border/30">
            <NervProgress stages={getPipelineStages(state.pipeline)} />
          </div>
        )}

        {/* Scan progress — only shown while scan is active */}
        {scanJob && (scanJob.status === 'pending' || scanJob.status === 'running') && (
          <div className="px-4 pb-1">
            <ScanProgress
              scanJob={scanJob}
              onCancel={handleCancelScan}
              onRetry={handleRetryScanConnector}
            />
          </div>
        )}

        {/* Analysis queue progress — only shown while jobs are active */}
        {state.analysisJobs.length > 0 &&
          state.analysisJobs.some((j) => j.status === 'pending' || j.status === 'running') && (
            <div className="px-4 pb-1">
              <AnalysisQueuePanel jobs={state.analysisJobs} onCancel={handleCancelAnalysisJob} />
            </div>
          )}

        {/* Scan history — only shown when 2+ scans exist */}
        {scanHistory.length >= 2 && (
          <ScanHistoryBar
            scans={scanHistory}
            currentScanId={scanJob?._id ?? scanJob?.id}
            onSelectScan={async (scanId) => {
              const selectedScan = scanHistory.find((scan) => (scan._id ?? scan.id) === scanId);
              if (selectedScan) {
                await handleSelectHistoricalScan(selectedScan);
              }
            }}
          />
        )}
      </div>

      {/* Error banner */}
      {state.error && (
        <div className="shrink-0 px-4 py-2 bg-nerv-red/10 border-b border-nerv-red/30">
          <span className="text-[10px] font-mono text-nerv-red">
            {'\u25B3'} ERROR: {state.error}
          </span>
        </div>
      )}

      {/* Three-panel workspace */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT: Narrative List */}
        <div
          className="overflow-auto flex flex-col bg-nerv-bg shrink-0"
          style={{ width: leftWidth }}
        >
          <div className="px-3 py-2 border-b border-nerv-border flex items-center justify-between shrink-0">
            <span className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
              NARRATIVES
            </span>
            {state.narratives.length > 0 && (
              <NervBadge label={String(state.narratives.length)} variant="orange" size="sm" />
            )}
          </div>
          {state.narratives.length > 0 ? (
            <NarrativeList
              narratives={state.narratives}
              selectedId={state.selectedNarrativeId}
              onSelect={handleNarrativeSelect}
              unclusteredCount={state.unclusteredCount}
              selectedNarrativeIds={state.selectedNarrativeIds}
              analysisJobs={state.analysisJobs}
              investigatedNarrativeIds={state.investigatedNarrativeIds}
              onToggleSelection={(id) =>
                dispatch({ type: 'TOGGLE_NARRATIVE_SELECTION', narrativeId: id })
              }
              onAnalyzeSelected={handleAnalyzeSelected}
              onClearSelection={() => dispatch({ type: 'CLEAR_NARRATIVE_SELECTION' })}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[10px] font-mono text-nerv-text-muted animate-nerv-pulse">
                {state.pipeline.search === 'running'
                  ? 'SEARCHING...'
                  : state.pipeline.analyze === 'running'
                    ? 'ANALYZING...'
                    : 'AWAITING DATA'}
              </span>
            </div>
          )}
        </div>

        {/* LEFT resize handle */}
        <DragHandle onDrag={(dx) => setLeftWidth((w) => Math.max(200, Math.min(500, w + dx)))} />

        {/* CENTER: Visualization + Mode Selector */}
        <div className="flex-1 flex flex-col overflow-hidden bg-nerv-bg-deep min-w-0">
          {/* Visualization area */}
          <div className="flex-1 overflow-auto min-h-0">{renderCenterPanel()}</div>
        </div>

        {/* RIGHT resize handle */}
        <DragHandle onDrag={(dx) => setRightWidth((w) => Math.max(280, Math.min(600, w - dx)))} />

        {/* RIGHT: Detail Panel */}
        <div className="overflow-auto bg-nerv-bg shrink-0" style={{ width: rightWidth }}>
          <DetailPanel
            selectedNarrativeId={state.selectedNarrativeId}
            selectedActorHandle={state.selectedActorHandle}
            selectedClaimIndex={state.selectedClaimIndex}
            narratives={state.narratives}
            posts={state.posts}
            summary={state.summary}
            investigation={state.investigation}
            investigationRecord={investigationRecord}
            projectDossier={projectDossier}
            projectDossierOverlaps={projectDossierOverlaps}
            mentalModel={mentalModel}
            deviations={state.deviations}
            propaganda={state.propaganda}
            claims={state.claims}
            investigatingNarrativeId={state.investigatingNarrativeId}
            investigatedNarrativeIds={state.investigatedNarrativeIds}
            selectedIdentity={state.selectedIdentity}
            identityLoading={state.identityLoading}
            evidenceSeedSaving={evidenceSeedSaving}
            projectDossierSaving={projectDossierSaving}
            mentalModelSaving={mentalModelSaving}
            onAddEvidenceSeed={handleAddEvidenceSeed}
            onBuildProjectDossier={handleBuildProjectDossier}
            onRefreshProjectDossier={handleRefreshProjectDossier}
            onBuildMentalModel={handleBuildMentalModel}
            onRefreshMentalModel={handleRefreshMentalModel}
            onGenerateProfile={handleGenerateProfile}
            onInvestigate={handleInvestigate}
            onRunPropaganda={handleRunPropaganda}
            onVerifyClaims={handleVerifyClaims}
            onGenerateReport={handleGenerateReport}
            onRunIntelligence={(type) => handleIntelligence(type)}
          />
        </div>
      </div>

      {/* Bottom: Alert ticker */}
      <div className="shrink-0">
        <NervTicker items={tickerItems} />
      </div>

      {/* Narrative comparison overlay */}
      {(state.comparison || comparingNarratives) && (
        <NarrativeComparisonPanel
          comparison={state.comparison}
          loading={comparingNarratives}
          onClose={() => dispatch({ type: 'SET_COMPARISON', data: null })}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page entry point with Suspense boundary for useSearchParams
// ---------------------------------------------------------------------------

function InvestigationPage() {
  return (
    <InvestigationProvider>
      <InvestigationWorkspace />
    </InvestigationProvider>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-nerv-bg-deep">
          <span className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted animate-nerv-pulse">
            INITIALIZING INVESTIGATION WORKSPACE...
          </span>
        </div>
      }
    >
      <InvestigationPage />
    </Suspense>
  );
}
