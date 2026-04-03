'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

import {
  InvestigationProvider,
  useInvestigation,
  type CenterMode,
  type PipelineStage,
} from '../../lib/investigation-context';

import {
  analyzeNarratives,
  fetchDeviations,
  analyzePropaganda,
  analyzeEntities,
  fetchDownstreamEffects,
  fetchInvestigation,
  fetchInvestigations,
  verifyClaims,
  investigateNarrative,
  saveAnalysisCache,
  getAnalysisCache,
  generateReport,
  fetchAlerts,
  startScan,
  getScanStatus,
  getScanPosts,
  cancelScan,
  retryScanConnector,
  getRecentScans,
  type RawPost,
  type AnalyzedNarrative,
  type ExtractedClaim,
  type ScanJob,
  type AnalysisJob,
  startAnalysisJobs,
  getAnalysisJobsByScan,
  cancelAnalysisJob,
  type StartAnalysisJobRequest,
  getIdentityByHandle,
  generateMagiProfile,
  type DeviationResponse,
  type PropagandaAnalysisResult,
  type EntityAnalysisResponse,
  type DownstreamEffectsResult,
} from '../../lib/api';

import {
  NervPanel,
  NervProgress,
  NervTicker,
  NervBadge,
  NervStatus,
  type NervProgressStage,
  type NervTickerItem,
} from '../../components/nerv';
import { ScanProgress } from '../../components/nerv/scan-progress';
import { AnalysisQueuePanel } from '../../components/nerv/analysis-queue-panel';

import { NarrativeList } from '../../components/nerv/narrative-list';
import { TemporalHeatmap } from '../../components/nerv/temporal-heatmap';
import { ActorsMatrix } from '../../components/nerv/actors-matrix';
import { ClaimsMatrix } from '../../components/nerv/claims-matrix';
import { EffectsChain } from '../../components/nerv/effects-chain';
import { EntityPanel } from '../../components/nerv/entity-panel';
import { GenealogyPanel } from '../../components/nerv/genealogy-panel';
import { PropagationFlow } from '../../components/nerv/propagation-flow';
import { NarrativeRadar } from '../../components/nerv/narrative-radar';
import { DetailPanel } from '../../components/nerv/detail-panel';
import dynamic from 'next/dynamic';
import { buildGlobeData } from '../../lib/globe-data';

const NarrativeGlobeLazy = dynamic(
  () => import('../../components/nerv/narrative-globe').then((m) => ({ default: m.NarrativeGlobe })),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Mode definitions
// ---------------------------------------------------------------------------

const CENTER_MODES: { key: CenterMode; label: string; shortcut: string }[] = [
  { key: 'temporal', label: 'TEMPORAL', shortcut: '1' },
  { key: 'actors', label: 'ACTORS', shortcut: '2' },
  { key: 'claims', label: 'CLAIMS', shortcut: '3' },
  { key: 'effects', label: 'EFFECTS', shortcut: '4' },
  { key: 'globe', label: 'GLOBE', shortcut: '5' },
  { key: 'entities', label: 'ENTITIES', shortcut: '6' },
  { key: 'genealogy', label: 'GENEALOGY', shortcut: '7' },
  { key: 'flow', label: 'FLOW', shortcut: '8' },
  { key: 'radar', label: 'RADAR', shortcut: '9' },
];

// ---------------------------------------------------------------------------
// Pipeline stages for progress bar
// ---------------------------------------------------------------------------

function getPipelineStages(
  pipeline: Record<PipelineStage, string>,
): NervProgressStage[] {
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
    status: pipeline[s] === 'done'
      ? 'done'
      : pipeline[s] === 'running'
        ? 'running'
        : pipeline[s] === 'error'
          ? 'error'
          : 'queued',
  }));
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
    <div
      onMouseDown={handleMouseDown}
      className="w-1.5 shrink-0 cursor-col-resize bg-nerv-border hover:bg-nerv-orange/40 active:bg-nerv-orange/60 transition-colors relative group"
    >
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-nerv-text-muted/20 group-hover:bg-nerv-orange/60" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// InvestigationWorkspace — the actual workspace content
// ---------------------------------------------------------------------------

function InvestigationWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get('q') ?? '';
  const invId = searchParams.get('inv');
  const freshSearch = searchParams.get('fresh') === '1'; // Only auto-run full pipeline on fresh search
  const { state, dispatch, selectNarrative, selectActor, selectClaim, setCenterMode } =
    useInvestigation();
  const pipelineRan = useRef(false);
  const [radarSelectedIds, setRadarSelectedIds] = useState<string[]>([]);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(380);
  const [scanJob, setScanJob] = useState<ScanJob | null>(null);
  const scanPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanPostsFetchedRef = useRef(false);

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

  // Track the active scan ID for caching
  const activeScanIdRef = useRef<string | null>(null);

  // ---- Helper: restore from analysis cache ----
  const restoreFromCache = useCallback(
    async (scanId: string): Promise<boolean> => {
      try {
        const cache = await getAnalysisCache(scanId);
        if (!cache) return false;

        if (cache.narratives) {
          dispatch({ type: 'SET_NARRATIVES', narratives: cache.narratives as AnalyzedNarrative[], unclusteredCount: (cache.unclusteredCount as number) ?? 0 });
          dispatch({ type: 'SET_PIPELINE', stage: 'analyze', status: 'done' });
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

        dispatch({ type: 'SET_LOADING', loading: false });
        return true;
      } catch {
        return false;
      }
    },
    [dispatch],
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
        cacheData.narratives = analyzeResult.narratives;
        cacheData.unclusteredCount = analyzeResult.unclustered?.length ?? 0;
      } catch (err) {
        dispatch({ type: 'SET_PIPELINE', stage: 'analyze', status: 'error' });
        dispatch({ type: 'SET_ERROR', error: `Analysis failed: ${err instanceof Error ? err.message : 'unknown'}` });
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
      if (narratives.length > 0) {
        try {
          dispatch({ type: 'SET_PIPELINE', stage: 'propaganda', status: 'running' });
          const propResult = await analyzePropaganda(narratives, posts);
          dispatch({ type: 'SET_PROPAGANDA', data: propResult });
          dispatch({ type: 'SET_PIPELINE', stage: 'propaganda', status: 'done' });
          cacheData.propaganda = propResult;
        } catch {
          dispatch({ type: 'SET_PIPELINE', stage: 'propaganda', status: 'error' });
        }
      }

      // Stage 5: Entities
      try {
        dispatch({ type: 'SET_PIPELINE', stage: 'entities', status: 'running' });
        // Build insights from posts that have entity/sentiment data from the scan processor
        const insights = posts
          .filter((p: any) => p.entities?.length > 0 || p.themes?.length > 0)
          .map((p: any) => ({
            id: p.id,
            platform: p.platform,
            timestamp: p.timestamp,
            entities: p.entities ?? [],
            sentiment: p.sentiment ?? { score: 0, label: 'neutral', confidence: 0 },
          }));
        const entityResult = await analyzeEntities(posts, insights as any[], narratives);
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

      // Save all analysis results to scan job cache
      const scanId = activeScanIdRef.current;
      if (scanId && Object.keys(cacheData).length > 0) {
        saveAnalysisCache(scanId, cacheData).catch(() => {
          // Non-fatal — caching failure doesn't block the UI
        });
      }

      dispatch({ type: 'SET_LOADING', loading: false });
    },
    [dispatch],
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
        getScanPosts(scanId).then(({ posts }) => {
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
        }).catch((err) => {
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
            if (match) targetInvId = match._id;
          }

          if (targetInvId) {
            const { snapshot } = await fetchInvestigation(targetInvId);
            if (snapshot && Array.isArray(snapshot.posts) && snapshot.posts.length > 0) {
              posts = snapshot.posts as RawPost[];
              dispatch({
                type: 'SET_SEARCH_DATA',
                posts,
                insights: [],
                summary: snapshot.summary ?? null,
              });
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
            const recentScans = await getRecentScans(5);
            const matchingScan = recentScans.find(
              (s) => s.query === query && s.status === 'completed' && s.totalPosts > 0,
            );
            if (matchingScan) {
              const { posts: scanPosts } = await getScanPosts(matchingScan._id ?? matchingScan.id);
              if (scanPosts.length > 0) {
                posts = scanPosts;
                const summary = {
                  total: scanPosts.length,
                  positive: scanPosts.filter((p) => p.sentiment?.label === 'positive').length,
                  negative: scanPosts.filter((p) => p.sentiment?.label === 'negative').length,
                  neutral: scanPosts.filter((p) => p.sentiment?.label === 'neutral').length,
                  byPlatform: scanPosts.reduce<Record<string, number>>((acc, p) => {
                    acc[p.platform] = (acc[p.platform] || 0) + 1;
                    return acc;
                  }, {}),
                };
                dispatch({ type: 'SET_SEARCH_DATA', posts, insights: [], summary });
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
          const matchingScan = await getRecentScans(5).catch(() => [] as ScanJob[]);
          const scanForQuery = matchingScan.find(
            (s) => s.query === query && s.status === 'completed',
          );
          if (scanForQuery) {
            activeScanIdRef.current = scanForQuery._id ?? scanForQuery.id;
            restored = await restoreFromCache(activeScanIdRef.current);
          }

          // If no cache, re-run analysis
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
          const { scanId } = await startScan(query, undefined, undefined, '7d');
          const initialStatus = await getScanStatus(scanId);
          setScanJob(initialStatus);
          scanPostsFetchedRef.current = false;

          // Remove fresh=1 from URL so page refresh doesn't re-trigger scan
          router.replace(`/results?q=${encodeURIComponent(query)}`, { scroll: false });
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
  }, [query, dispatch, runAnalysisStages]); // eslint-disable-line react-hooks/exhaustive-deps -- invId is read from searchParams, stable across renders

  // ---- Fetch alerts ----
  useEffect(() => {
    if (!state.investigationId) return;
    fetchAlerts(state.investigationId)
      .then((alerts) => dispatch({ type: 'SET_ALERTS', alerts }))
      .catch(() => {});
  }, [state.investigationId, dispatch]);

  // ---- Keyboard shortcuts (1-6 for modes) ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const idx = parseInt(e.key, 10);
      if (idx >= 1 && idx <= 9) {
        setCenterMode(CENTER_MODES[idx - 1].key);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setCenterMode]);

  // ---- Action handlers ----
  const handleInvestigate = useCallback(
    async (narrativeId: string) => {
      const narrative = state.narratives.find((n) => n.id === narrativeId);
      if (!narrative) return;

      // Don't re-investigate if already in progress
      if (state.investigatingNarrativeId) return;

      const handles = Array.from(
        new Set(
          narrative.authors
            .map((a) => a.handle)
            .filter((h): h is string => Boolean(h) && h !== 'unknown'),
        ),
      ).slice(0, 20);

      if (handles.length === 0) return;

      const topicPosts = narrative.postIndices.map((i) => state.posts[i]).filter(Boolean);

      dispatch({ type: 'SET_INVESTIGATING', narrativeId });

      try {
        const result = await investigateNarrative(
          state.query,
          handles,
          topicPosts,
        );
        dispatch({ type: 'SET_INVESTIGATION', data: result, narrativeId });
      } catch (err) {
        dispatch({ type: 'SET_INVESTIGATING', narrativeId: null });
        dispatch({ type: 'SET_ERROR', error: `Investigation failed: ${err instanceof Error ? err.message : 'unknown'}` });
      }
    },
    [state.narratives, state.posts, state.query, state.investigatingNarrativeId, dispatch],
  );

  // ---- Analysis queue handlers ----
  const analysisJobPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mergedJobIdsRef = useRef<Set<string>>(new Set());

  /** Start polling for analysis job results. Merges completed jobs into state as they finish. */
  const startAnalysisPolling = useCallback((scanId: string) => {
    if (analysisJobPollRef.current) return; // already polling

    analysisJobPollRef.current = setInterval(async () => {
      try {
        const allJobs = await getAnalysisJobsByScan(scanId);
        dispatch({ type: 'SET_ANALYSIS_JOBS', jobs: allJobs });

        // Merge any newly completed jobs into state
        for (const j of allJobs) {
          const jId = j._id ?? j.id;
          if (j.status !== 'completed' || !j.result || mergedJobIdsRef.current.has(jId)) continue;

          mergedJobIdsRef.current.add(jId);
          if (j.type === 'investigation') {
            dispatch({ type: 'SET_INVESTIGATION', data: j.result as any, narrativeId: j.narrativeIds[0] ?? '' });
          } else if (j.type === 'propaganda') {
            dispatch({ type: 'SET_PROPAGANDA', data: j.result as any });
            dispatch({ type: 'SET_PIPELINE', stage: 'propaganda', status: 'done' });
          } else if (j.type === 'downstream') {
            dispatch({ type: 'SET_DOWNSTREAM', data: j.result as any });
            dispatch({ type: 'SET_PIPELINE', stage: 'downstream', status: 'done' });
          }
        }

        // Stop polling when all jobs are terminal
        const active = allJobs.filter((j) => j.status === 'pending' || j.status === 'running');
        if (active.length === 0 && analysisJobPollRef.current) {
          clearInterval(analysisJobPollRef.current);
          analysisJobPollRef.current = null;
        }
      } catch { /* polling error */ }
    }, 2000);
  }, [dispatch]);

  const handleInvestigateSelected = useCallback(async () => {
    const scanId = activeScanIdRef.current;
    if (!scanId || state.selectedNarrativeIds.length === 0) return;

    const jobs: StartAnalysisJobRequest[] = state.selectedNarrativeIds.map((nId) => {
      const narrative = state.narratives.find((n) => n.id === nId);
      const handles = narrative
        ? Array.from(new Set(
            narrative.authors.map((a) => a.handle).filter((h): h is string => Boolean(h) && h !== 'unknown'),
          )).slice(0, 20)
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
    });

    try {
      await startAnalysisJobs(scanId, jobs);
      // Don't clear selection — keep checked so user can see what's queued
      startAnalysisPolling(scanId);
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: `Failed to start analysis jobs: ${err}` });
    }
  }, [state.selectedNarrativeIds, state.narratives, state.query, state.posts.length, dispatch, startAnalysisPolling]);

  const handleAnalyzeSelected = useCallback(async () => {
    const scanId = activeScanIdRef.current;
    if (!scanId || state.selectedNarrativeIds.length === 0) return;

    const selectedNarratives = state.narratives.filter((n) => state.selectedNarrativeIds.includes(n.id));
    const sharedInput = {
      query: state.query,
      narrativeSummaries: selectedNarratives.map((n) => n.summary),
      narratives: selectedNarratives as unknown as Record<string, unknown>[],
      postCount: state.posts.length,
    };
    const jobs: StartAnalysisJobRequest[] = [
      {
        type: 'propaganda',
        narrativeIds: state.selectedNarrativeIds,
        input: sharedInput,
      },
      {
        type: 'downstream',
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
  }, [state.selectedNarrativeIds, state.narratives, state.query, state.posts.length, dispatch, startAnalysisPolling]);

  const handleCancelAnalysisJob = useCallback(async (jobId: string) => {
    try {
      await cancelAnalysisJob(jobId);
      const scanId = activeScanIdRef.current;
      if (scanId) {
        const allJobs = await getAnalysisJobsByScan(scanId);
        dispatch({ type: 'SET_ANALYSIS_JOBS', jobs: allJobs });
      }
    } catch { /* silent */ }
  }, [dispatch]);

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

  const handleVerifyClaims = useCallback(async () => {
    const claims: ExtractedClaim[] = state.propaganda?.claims ?? [];
    if (claims.length === 0) return;
    try {
      const result = await verifyClaims(claims);
      dispatch({ type: 'SET_CLAIMS', data: result });
    } catch {
      // silent
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

  const handleGenerateProfile = useCallback(async (identityId: string) => {
    try {
      await generateMagiProfile(identityId);
      // Immediately refresh to show "queued" status
      if (state.selectedActorHandle) {
        const updated = await getIdentityByHandle(state.selectedActorHandle);
        dispatch({ type: 'SET_IDENTITY', identity: updated });
      }
      // Poll until profile is complete
      if (profilePollRef.current) clearInterval(profilePollRef.current);
      profilePollRef.current = setInterval(async () => {
        if (!state.selectedActorHandle) {
          if (profilePollRef.current) clearInterval(profilePollRef.current);
          profilePollRef.current = null;
          return;
        }
        const refreshed = await getIdentityByHandle(state.selectedActorHandle);
        if (refreshed) {
          dispatch({ type: 'SET_IDENTITY', identity: refreshed });
          if (refreshed.profileGenerationStatus === 'complete' || refreshed.profileGenerationStatus === 'failed') {
            if (profilePollRef.current) clearInterval(profilePollRef.current);
            profilePollRef.current = null;
          }
        }
      }, 3000);
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: `Profile generation failed: ${err}` });
    }
  }, [state.selectedActorHandle, dispatch]);

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

  const handleRefresh = useCallback(async () => {
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
      const { scanId } = await startScan(query, undefined, undefined, '7d');
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
  }, [dispatch, query]);

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
        const globeData = buildGlobeData({
          narratives: state.narratives,
          posts: state.posts,
          downstream: state.downstream,
          investigation: state.investigation,
        });
        return (
          <NarrativeGlobeLazy
            points={globeData.points}
            arcs={globeData.arcs}
            onPointClick={(point) => {
              // Select the first narrative associated with this country
              const meta = point.metadata as { narrativeCount?: number } | undefined;
              if (meta?.narrativeCount && meta.narrativeCount > 0) {
                // Find a narrative that mentions this country
                const countryCode = (point.metadata as Record<string, unknown>)?.countryCode as string;
                if (countryCode) {
                  // Just show detail by selecting first narrative
                  const firstNarrative = state.narratives[0];
                  if (firstNarrative) selectNarrative(firstNarrative.id);
                }
              }
            }}
          />
        );
      }
      case 'entities':
        return (
          <EntityPanel
            entities={state.entities}
            narratives={state.narratives}
          />
        );
      case 'genealogy':
        return (
          <GenealogyPanel
            lineages={[]}
            onRefresh={handleRefresh}
            refreshing={pipelineRunning}
          />
        );
      case 'flow':
        return (
          <PropagationFlow
            investigation={state.investigation}
          />
        );
      case 'radar':
        return (
          <NarrativeRadar
            narratives={state.narratives}
            selectedIds={radarSelectedIds.length > 0 ? radarSelectedIds : (state.selectedNarrativeId ? [state.selectedNarrativeId] : [])}
            deviations={state.deviations}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 44px)' }}>
      {/* Top bar: investigation header + pipeline progress */}
      <div className="shrink-0 border-b border-nerv-border bg-nerv-bg">
        {/* Investigation header */}
        <div className="flex items-center justify-between px-4 h-9">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[10px] font-mono text-nerv-text-muted uppercase tracking-wider shrink-0">
              NERV {'\u25B8'} Investigation:
            </span>
            <span className="text-[11px] font-mono font-bold text-nerv-orange truncate">
              &quot;{query}&quot;
            </span>
            <NervStatus
              status={pipelineRunning ? 'warning' : state.error ? 'critical' : 'online'}
              label={pipelineRunning ? 'PROCESSING' : state.error ? 'ERROR' : 'ACTIVE'}
              size="sm"
            />
            {state.narratives.length > 0 && (
              <NervBadge
                label={`SNAP:${state.narratives.length}N`}
                variant="muted"
                size="sm"
              />
            )}
          </div>
          <button
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

        {/* Pipeline progress */}
        <div className="px-4 pb-1">
          <NervProgress stages={getPipelineStages(state.pipeline)} />
        </div>

        {/* Scan progress (per-connector) — shown when using queue-based scanning */}
        {scanJob && (
          <div className="px-4 pb-2">
            <ScanProgress
              scanJob={scanJob}
              onCancel={handleCancelScan}
              onRetry={handleRetryScanConnector}
            />
          </div>
        )}

        {/* Analysis queue progress */}
        {state.analysisJobs.length > 0 && (
          <div className="px-4 pb-2">
            <AnalysisQueuePanel
              jobs={state.analysisJobs}
              onCancel={handleCancelAnalysisJob}
            />
          </div>
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
        <div className="overflow-auto flex flex-col bg-nerv-bg shrink-0" style={{ width: leftWidth }}>
          <div className="px-3 py-2 border-b border-nerv-border flex items-center justify-between shrink-0">
            <span className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
              NARRATIVES
            </span>
            {state.narratives.length > 0 && (
              <NervBadge
                label={String(state.narratives.length)}
                variant="orange"
                size="sm"
              />
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
              onToggleSelection={(id) => dispatch({ type: 'TOGGLE_NARRATIVE_SELECTION', narrativeId: id })}
              onInvestigateSelected={handleInvestigateSelected}
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
          <div className="flex-1 overflow-auto min-h-0">
            {renderCenterPanel()}
          </div>

          {/* Mode selector bar */}
          <div className="shrink-0 border-t border-nerv-border bg-nerv-bg px-2 py-1.5 flex items-center gap-1">
            <span className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mr-2">
              MODE:
            </span>
            {CENTER_MODES.map((mode) => (
              <button
                key={mode.key}
                onClick={() => setCenterMode(mode.key)}
                className={[
                  'px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider rounded-sm transition-colors',
                  state.centerMode === mode.key
                    ? 'bg-nerv-orange text-nerv-bg-deep font-bold'
                    : 'text-nerv-text-muted hover:text-nerv-text-secondary hover:bg-nerv-bg-elevated/40',
                ].join(' ')}
                title={`${mode.label} (${mode.shortcut})`}
              >
                {mode.label}
              </button>
            ))}
          </div>
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
            deviations={state.deviations}
            propaganda={state.propaganda}
            claims={state.claims}
            investigatingNarrativeId={state.investigatingNarrativeId}
            investigatedNarrativeIds={state.investigatedNarrativeIds}
            selectedIdentity={state.selectedIdentity}
            identityLoading={state.identityLoading}
            onGenerateProfile={handleGenerateProfile}
            onInvestigate={handleInvestigate}
            onRunPropaganda={handleRunPropaganda}
            onVerifyClaims={handleVerifyClaims}
            onGenerateReport={handleGenerateReport}
          />
        </div>
      </div>

      {/* Bottom: Alert ticker */}
      <div className="shrink-0">
        <NervTicker items={tickerItems} />
      </div>
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
