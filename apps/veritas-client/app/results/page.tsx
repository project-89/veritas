'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { searchNarratives } from '../../lib/api';
import {
  transformToNarrativeFlow,
  transformToNetworkGraph,
  transformToTemporalData,
} from '../../lib/transform';
import type { NarrativeInsight } from '../../lib/api';
import type { NarrativeFlowData, NarrativeBranch, NarrativeConnection } from '@veritas-nx/visualization';
import type { NetworkGraph as NetworkGraphData } from '@veritas-nx/visualization';
import type { TemporalData } from '../../lib/transform';
import { SummaryStats } from '../../components/summary-stats';
import { RawDataTable } from '../../components/raw-data-table';

// Dynamic imports for D3 visualizations
const NarrativeFlow = dynamic(
  () => import('@veritas-nx/visualization').then((mod) => ({ default: mod.NarrativeFlow })),
  { ssr: false },
);

const NetworkGraphVisualization = dynamic(
  () => import('@veritas-nx/visualization').then((mod) => ({ default: mod.NetworkGraphVisualization })),
  { ssr: false },
);

const TemporalNarrativeVisualization = dynamic(
  () => import('@veritas-nx/visualization').then((mod) => ({ default: mod.TemporalNarrativeVisualization })),
  { ssr: false },
);

type TabId = 'flow' | 'network' | 'timeline' | 'raw';

interface Summary {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  byPlatform: Record<string, number>;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'flow', label: 'Narrative Flow' },
  { id: 'network', label: 'Network' },
  { id: 'timeline', label: 'Timeline' },
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
  const [insights, setInsights] = useState<NarrativeInsight[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [flowData, setFlowData] = useState<NarrativeFlowData | null>(null);
  const [networkData, setNetworkData] = useState<NetworkGraphData | null>(null);
  const [temporalData, setTemporalData] = useState<TemporalData | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('flow');
  const [selectedBranch, setSelectedBranch] = useState<NarrativeBranch | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<NarrativeConnection | null>(null);

  // New search from results page
  const [searchInput, setSearchInput] = useState(query);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setLoading(true);
      setError(null);
      setInsights([]);
      setSummary(null);
      setFlowData(null);
      setNetworkData(null);
      setTemporalData(null);
      setSelectedBranch(null);
      setSelectedConnection(null);

      try {
        const result = await searchNarratives(q.trim(), platforms, limit);
        setInsights(result.insights);
        setSummary(result.summary);

        if (result.insights.length > 0) {
          setFlowData(transformToNarrativeFlow(result.insights));
          setNetworkData(transformToNetworkGraph(result.insights));
          setTemporalData(transformToTemporalData(result.insights));
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

          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-800 pb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
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
            {activeTab === 'flow' && flowData && (
              <NarrativeFlow
                data={flowData}
                width={1100}
                height={600}
                showLabels={true}
                showEvents={true}
                animate={false}
                highlightBranch={selectedBranch?.id}
                onBranchClick={(branch: NarrativeBranch) => {
                  setSelectedBranch(branch);
                  setSelectedConnection(null);
                }}
                onConnectionClick={(connection: NarrativeConnection) => {
                  setSelectedConnection(connection);
                  setSelectedBranch(null);
                }}
              />
            )}

            {activeTab === 'network' && networkData && (
              <NetworkGraphVisualization
                data={networkData}
                width={1100}
                height={600}
                onNodeClick={(node: unknown) => console.log('Node clicked:', node)}
              />
            )}

            {activeTab === 'timeline' && temporalData && temporalData.timePoints.length > 0 && (
              <TemporalNarrativeVisualization
                data={temporalData as never}
                width={1100}
                height={600}
                onStreamClick={(streamId: string) => console.log('Stream clicked:', streamId)}
              />
            )}

            {activeTab === 'raw' && <RawDataTable insights={insights} />}

            {insights.length === 0 && (
              <div className="flex items-center justify-center h-[400px] text-slate-500">
                No data to visualize. Try a different search term.
              </div>
            )}
          </div>

          {/* Details panel */}
          {selectedBranch && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold" style={{ color: selectedBranch.color }}>
                  {selectedBranch.name}
                </h3>
                <button
                  onClick={() => setSelectedBranch(null)}
                  className="text-slate-500 hover:text-slate-300 text-sm"
                >
                  Close
                </button>
              </div>
              <p className="text-slate-400 text-sm mb-4">{selectedBranch.description}</p>
              <div className="flex flex-wrap gap-4 text-sm text-slate-300 mb-4">
                <span>
                  Peak Strength:{' '}
                  <span className="font-semibold text-white">
                    {selectedBranch.metrics.peakStrength.toFixed(2)}
                  </span>
                </span>
                <span>
                  Influence:{' '}
                  <span className="font-semibold text-white">
                    {selectedBranch.metrics.influence.toFixed(2)}
                  </span>
                </span>
                <span>
                  Events:{' '}
                  <span className="font-semibold text-white">{selectedBranch.events.length}</span>
                </span>
                <span>
                  Sources:{' '}
                  <span className="font-semibold text-white">{selectedBranch.sources.length}</span>
                </span>
              </div>
              {selectedBranch.events.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                    Key Events
                  </h4>
                  <ul className="space-y-1">
                    {selectedBranch.events.slice(0, 5).map((evt) => (
                      <li key={evt.id} className="text-sm text-slate-400">
                        <span className="text-slate-500">
                          {new Date(evt.timestamp).toLocaleDateString()}
                        </span>{' '}
                        -- {evt.description}{' '}
                        <span className="text-slate-600">(impact: {evt.impact.toFixed(2)})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {selectedConnection && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold text-purple-400">
                  {selectedConnection.type.charAt(0).toUpperCase() + selectedConnection.type.slice(1)}{' '}
                  Connection
                </h3>
                <button
                  onClick={() => setSelectedConnection(null)}
                  className="text-slate-500 hover:text-slate-300 text-sm"
                >
                  Close
                </button>
              </div>
              <p className="text-slate-400 text-sm mb-3">{selectedConnection.description}</p>
              <div className="flex flex-wrap gap-4 text-sm text-slate-300">
                <span>
                  Strength:{' '}
                  <span className="font-semibold text-white">
                    {selectedConnection.strength.toFixed(2)}
                  </span>
                </span>
                <span>
                  Timestamp:{' '}
                  <span className="font-semibold text-white">
                    {new Date(selectedConnection.timestamp).toLocaleDateString()}
                  </span>
                </span>
              </div>
            </div>
          )}
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
