'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { searchNarratives } from '../../lib/api';
import {
  transformToNetworkGraph,
  transformToTemporalData,
  detectNarratives,
} from '../../lib/transform';
import type { NarrativeCluster } from '../../lib/transform';
import type { RawPost, NarrativeInsight } from '../../lib/api';
import type { NetworkGraph as NetworkGraphData } from '@veritas-nx/visualization';
import type { TemporalData } from '../../lib/transform';
import { SummaryStats } from '../../components/summary-stats';
import { RawDataTable } from '../../components/raw-data-table';
import { NarrativeTimeline } from '../../components/narrative-timeline';
import { PlatformBreakdown } from '../../components/platform-breakdown';

// Dynamic imports for D3 visualizations
const NetworkGraphVisualization = dynamic(
  () => import('@veritas-nx/visualization').then((mod) => ({ default: mod.NetworkGraphVisualization })),
  { ssr: false },
);

const TemporalNarrativeVisualization = dynamic(
  () => import('@veritas-nx/visualization').then((mod) => ({ default: mod.TemporalNarrativeVisualization })),
  { ssr: false },
);

type TabId = 'timeline' | 'stream' | 'sources' | 'platforms' | 'raw';

interface Summary {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  byPlatform: Record<string, number>;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'stream', label: 'Stream' },
  { id: 'sources', label: 'Sources' },
  { id: 'platforms', label: 'Platforms' },
  { id: 'raw', label: 'Raw Data' },
];

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const query = searchParams.get('q') ?? '';
  const platformsParam = searchParams.get('platforms');
  const limitParam = searchParams.get('limit');

  const platforms = platformsParam ? platformsParam.split(',') : undefined;
  const limit = limitParam ? Number(limitParam) : 100;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<RawPost[]>([]);
  const [insights, setInsights] = useState<NarrativeInsight[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [networkData, setNetworkData] = useState<NetworkGraphData | null>(null);
  const [temporalData, setTemporalData] = useState<TemporalData | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('timeline');
  const [narrativeClusters, setNarrativeClusters] = useState<NarrativeCluster[]>([]);

  // New search from results page
  const [searchInput, setSearchInput] = useState(query);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setLoading(true);
      setError(null);
      setPosts([]);
      setInsights([]);
      setSummary(null);
      setNetworkData(null);
      setTemporalData(null);

      try {
        const result = await searchNarratives(q.trim(), platforms, limit);
        const safePosts = result.posts ?? [];
        const safeInsights = result.insights ?? [];
        const safeSummary = result.summary
          ? {
              total: result.summary.total ?? 0,
              positive: result.summary.positive ?? 0,
              negative: result.summary.negative ?? 0,
              neutral: result.summary.neutral ?? 0,
              byPlatform: result.summary.byPlatform ?? {},
            }
          : null;
        setPosts(safePosts);
        setInsights(safeInsights);
        setSummary(safeSummary);

        if (safePosts.length > 0) {
          const clusters = detectNarratives(safePosts, safeInsights);
          setNarrativeClusters(clusters);
          setNetworkData(transformToNetworkGraph(safePosts, safeInsights));
          setTemporalData(transformToTemporalData(safePosts, safeInsights));
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to search. Is the API running on localhost:3000?',
        );
      } finally {
        setLoading(false);
      }
    },
    [platforms, limit],
  );

  // Run search on mount / query change
  useEffect(() => {
    if (query) {
      doSearch(query);
      setSearchInput(query);
    }
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewSearch = () => {
    const q = searchInput.trim();
    if (!q || q === query) return;
    router.push(`/results?q=${encodeURIComponent(q)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleNewSearch();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Search bar (compact, at top) */}
      <div className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search narratives..."
          className="flex-1 px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
        />
        <button
          onClick={handleNewSearch}
          disabled={loading || !searchInput.trim()}
          className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium text-sm transition-colors"
        >
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 bg-slate-900 rounded-xl border border-slate-800">
          <div className="w-10 h-10 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin mb-4" />
          <p className="text-slate-400 text-sm">Searching connectors and classifying content...</p>
          <p className="text-slate-600 text-xs mt-1">This may take 10-30 seconds</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-red-950/50 border border-red-900/50 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {summary && !loading && (
        <>
          {/* Summary stats */}
          <SummaryStats summary={summary} />

          {/* Detected Narratives */}
          {narrativeClusters.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
                {narrativeClusters.length} Narratives Detected
              </h3>
              <div className="space-y-3">
                {narrativeClusters.map((cluster) => (
                  <div
                    key={cluster.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors"
                  >
                    <div
                      className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0"
                      style={{ backgroundColor: cluster.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-slate-200 text-sm">
                          {cluster.label}
                        </span>
                        <span className="text-xs text-slate-500">
                          {cluster.posts.length} posts
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            cluster.avgSentiment > 0.2
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : cluster.avgSentiment < -0.2
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-slate-600/30 text-slate-400'
                          }`}
                        >
                          {cluster.avgSentiment > 0.2 ? 'Positive' : cluster.avgSentiment < -0.2 ? 'Negative' : 'Neutral'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {Object.entries(cluster.platforms).map(([platform, count]) => (
                          <span
                            key={platform}
                            className="text-xs px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400"
                          >
                            {platform}: {count}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-slate-500">
                        Sources: {cluster.authors.slice(0, 3).map((a) => a.handle ? `@${a.handle}` : a.name).join(', ')}
                        {cluster.authors.length > 3 && ` +${cluster.authors.length - 3} more`}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs text-slate-500">
                        {new Date(cluster.firstSeen).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-slate-600">
                        {cluster.totalEngagement.toLocaleString()} engagements
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-800 pb-px overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-indigo-400 border border-slate-800 border-b-slate-950 -mb-px'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Visualization area */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 min-h-[500px]">
            {activeTab === 'timeline' && (
              <NarrativeTimeline posts={posts} narratives={narrativeClusters} />
            )}

            {activeTab === 'stream' && (
              temporalData && temporalData.timePoints.length > 0 ? (
                <TemporalNarrativeVisualization
                  data={temporalData as any}
                  width={1100}
                  height={600}
                  onStreamClick={(streamId: string) => console.log('Stream clicked:', streamId)}
                />
              ) : (
                <div className="flex items-center justify-center h-[400px] text-slate-500">
                  No stream data available.
                </div>
              )
            )}

            {activeTab === 'sources' && (
              networkData && networkData.nodes.length > 0 ? (
                <NetworkGraphVisualization
                  data={networkData}
                  width={1100}
                  height={600}
                  onNodeClick={(node: unknown) => console.log('Node clicked:', node)}
                />
              ) : (
                <div className="flex items-center justify-center h-[400px] text-slate-500">
                  No source data available.
                </div>
              )
            )}

            {activeTab === 'platforms' && (
              <PlatformBreakdown narratives={narrativeClusters} />
            )}

            {activeTab === 'raw' && <RawDataTable posts={posts} />}
          </div>
        </>
      )}
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-16 text-center text-slate-500">Loading...</div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
