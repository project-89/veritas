import { useState, useCallback } from 'react';
import { NarrativeFlow } from '@veritas-nx/visualization';
import { searchNarratives } from '../services/api';
import {
  transformToNarrativeFlow,
  transformToNetworkGraph,
  transformToTemporalData,
} from '../services/transform';
import type { NarrativeInsight } from '../services/api';
import type { NarrativeFlowData } from '@veritas-nx/visualization';
// NarrativeFlow component is exported as NarrativeFlow, not NarrativeFlowVisualization

type ViewMode = 'flow' | 'network' | 'temporal';

interface Summary {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  byPlatform: Record<string, number>;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<NarrativeInsight[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [flowData, setFlowData] = useState<NarrativeFlowData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('flow');
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setInsights([]);
    setSummary(null);
    setFlowData(null);

    try {
      const result = await searchNarratives(query.trim(), undefined, 100);
      setInsights(result.insights);
      setSummary(result.summary);

      if (result.insights.length > 0) {
        const flow = transformToNarrativeFlow(result.insights);
        setFlowData(flow);
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
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      {/* Search Bar */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          borderRadius: 16,
          padding: 32,
          marginBottom: 24,
        }}
      >
        <h2 style={{ color: '#fff', fontSize: 28, margin: '0 0 8px 0' }}>
          Narrative Analysis
        </h2>
        <p style={{ color: '#8892b0', margin: '0 0 24px 0' }}>
          Search across Reddit, Twitter/X, YouTube, and more. Content is classified and
          visualized in real-time.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter a topic to analyze (e.g., project89, bitcoin, AI safety)..."
            style={{
              flex: 1,
              padding: '14px 20px',
              fontSize: 16,
              borderRadius: 8,
              border: '2px solid #2a2a4a',
              background: '#0a0a1a',
              color: '#fff',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            style={{
              padding: '14px 32px',
              fontSize: 16,
              fontWeight: 600,
              borderRadius: 8,
              border: 'none',
              background: loading ? '#444' : '#4f46e5',
              color: '#fff',
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              border: '4px solid #e5e7eb',
              borderTop: '4px solid #4f46e5',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <p style={{ color: '#6b7280', fontSize: 16 }}>
            Searching connectors and classifying content...
          </p>
          <p style={{ color: '#9ca3af', fontSize: 14 }}>
            This may take 10-30 seconds depending on the connectors
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div
          style={{
            padding: 16,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#991b1b',
            marginBottom: 24,
          }}
        >
          {error}
        </div>
      )}

      {/* Results */}
      {summary && !loading && (
        <>
          {/* Summary Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            <SummaryCard label="Total Posts" value={summary.total} color="#4f46e5" />
            <SummaryCard label="Positive" value={summary.positive} color="#10b981" />
            <SummaryCard label="Neutral" value={summary.neutral} color="#6b7280" />
            <SummaryCard label="Negative" value={summary.negative} color="#ef4444" />
            {Object.entries(summary.byPlatform).map(([platform, count]) => (
              <SummaryCard
                key={platform}
                label={platform.charAt(0).toUpperCase() + platform.slice(1)}
                value={count}
                color="#8b5cf6"
              />
            ))}
          </div>

          {/* Sentiment Bar */}
          {summary.total > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  height: 12,
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${(summary.positive / summary.total) * 100}%`,
                    background: '#10b981',
                  }}
                />
                <div
                  style={{
                    width: `${(summary.neutral / summary.total) * 100}%`,
                    background: '#9ca3af',
                  }}
                />
                <div
                  style={{
                    width: `${(summary.negative / summary.total) * 100}%`,
                    background: '#ef4444',
                  }}
                />
              </div>
            </div>
          )}

          {/* View Mode Tabs */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 16,
            }}
          >
            {(['flow', 'network', 'temporal'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '8px 20px',
                  borderRadius: 6,
                  border: viewMode === mode ? '2px solid #4f46e5' : '1px solid #d1d5db',
                  background: viewMode === mode ? '#eef2ff' : '#fff',
                  color: viewMode === mode ? '#4f46e5' : '#374151',
                  fontWeight: viewMode === mode ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {mode === 'flow' ? 'Narrative Flow' : mode === 'network' ? 'Network Graph' : 'Temporal'}
              </button>
            ))}
          </div>

          {/* Visualization */}
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              padding: 24,
              minHeight: 500,
            }}
          >
            {flowData && viewMode === 'flow' && (
              <NarrativeFlow
                data={flowData}
                width={1100}
                height={600}
                showLabels={true}
                showEvents={true}
                animate={false}
                highlightBranch={selectedBranch ?? undefined}
                onBranchClick={(branch) => setSelectedBranch(branch.id)}
              />
            )}
            {viewMode === 'network' && insights.length > 0 && (
              <div style={{ textAlign: 'center', padding: 48, color: '#6b7280' }}>
                Network Graph view — coming soon (data is ready, component needs wiring)
              </div>
            )}
            {viewMode === 'temporal' && insights.length > 0 && (
              <div style={{ textAlign: 'center', padding: 48, color: '#6b7280' }}>
                Temporal view — coming soon (data is ready, component needs wiring)
              </div>
            )}
            {insights.length === 0 && (
              <div style={{ textAlign: 'center', padding: 48, color: '#6b7280' }}>
                No data to visualize. Try a different search term.
              </div>
            )}
          </div>

          {/* Branch Details */}
          {flowData && selectedBranch && (
            <div
              style={{
                marginTop: 16,
                background: '#fff',
                borderRadius: 12,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                padding: 24,
              }}
            >
              {(() => {
                const branch = flowData.branches.find((b) => b.id === selectedBranch);
                if (!branch) return null;
                return (
                  <>
                    <h3 style={{ margin: '0 0 8px', color: branch.color }}>{branch.name}</h3>
                    <p style={{ color: '#6b7280', margin: '0 0 12px' }}>{branch.description}</p>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <span>Peak Strength: {branch.metrics.peakStrength.toFixed(2)}</span>
                      <span>Influence: {branch.metrics.influence.toFixed(2)}</span>
                      <span>Events: {branch.events.length}</span>
                      <span>Sources: {branch.sources.length}</span>
                    </div>
                    {branch.events.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <strong>Key Events:</strong>
                        <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                          {branch.events.slice(0, 5).map((evt) => (
                            <li key={evt.id} style={{ marginBottom: 4, color: '#374151' }}>
                              {new Date(evt.timestamp).toLocaleDateString()} — {evt.description}{' '}
                              (impact: {evt.impact.toFixed(2)})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        padding: 20,
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
