'use client';

import { useState, useMemo } from 'react';
import type { NarrativeInsight } from '../lib/api';

interface RawDataTableProps {
  insights: NarrativeInsight[];
}

type SortField = 'timestamp' | 'sentiment' | 'narrativeScore' | 'platform';
type SortDir = 'asc' | 'desc';

const PLATFORM_ICONS: Record<string, string> = {
  reddit: 'R',
  twitter: 'X',
  youtube: 'Y',
};

function sentimentLabel(s: number): { text: string; className: string } {
  if (s > 0.3) return { text: 'Positive', className: 'bg-emerald-500/20 text-emerald-400' };
  if (s > -0.3) return { text: 'Neutral', className: 'bg-slate-600/30 text-slate-300' };
  return { text: 'Negative', className: 'bg-red-500/20 text-red-400' };
}

export function RawDataTable({ insights }: RawDataTableProps) {
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);
  const [filterSentiment, setFilterSentiment] = useState<string | null>(null);

  const platforms = useMemo(
    () => Array.from(new Set(insights.map((i) => i.platform))).sort(),
    [insights],
  );

  const filtered = useMemo(() => {
    let list = [...insights];
    if (filterPlatform) list = list.filter((i) => i.platform === filterPlatform);
    if (filterSentiment === 'positive') list = list.filter((i) => i.sentiment > 0.3);
    else if (filterSentiment === 'neutral') list = list.filter((i) => i.sentiment >= -0.3 && i.sentiment <= 0.3);
    else if (filterSentiment === 'negative') list = list.filter((i) => i.sentiment < -0.3);
    return list;
  }, [insights, filterPlatform, filterSentiment]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortField === 'timestamp') return dir * (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      if (sortField === 'sentiment') return dir * (a.sentiment - b.sentiment);
      if (sortField === 'narrativeScore') return dir * (a.narrativeScore - b.narrativeScore);
      if (sortField === 'platform') return dir * a.platform.localeCompare(b.platform);
      return 0;
    });
    return list;
  }, [filtered, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => toggleSort(field)}
      className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-200 uppercase tracking-wider"
    >
      {label}
      {sortField === field && (
        <span className="text-indigo-400">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
      )}
    </button>
  );

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filterPlatform ?? ''}
          onChange={(e) => setFilterPlatform(e.target.value || null)}
          className="bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
        >
          <option value="">All platforms</option>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>

        <select
          value={filterSentiment ?? ''}
          onChange={(e) => setFilterSentiment(e.target.value || null)}
          className="bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
        >
          <option value="">All sentiments</option>
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="negative">Negative</option>
        </select>

        <span className="text-xs text-slate-500 self-center ml-auto">
          {sorted.length} of {insights.length} results
        </span>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-[600px] rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/80 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left w-16">
                <SortHeader field="platform" label="Src" />
              </th>
              <th className="px-3 py-2 text-left">Text</th>
              <th className="px-3 py-2 text-left w-24">
                <SortHeader field="sentiment" label="Sentiment" />
              </th>
              <th className="px-3 py-2 text-left w-36">Themes</th>
              <th className="px-3 py-2 text-left w-20">
                <SortHeader field="narrativeScore" label="Score" />
              </th>
              <th className="px-3 py-2 text-left w-28">
                <SortHeader field="timestamp" label="Time" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {sorted.map((insight) => {
              const s = sentimentLabel(insight.sentiment);
              const isExpanded = expandedId === insight.id;
              return (
                <tr
                  key={insight.id}
                  className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : insight.id)}
                >
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-slate-700 text-xs font-bold text-slate-300">
                      {PLATFORM_ICONS[insight.platform] ?? insight.platform.charAt(0).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    <div className={isExpanded ? '' : 'line-clamp-2'}>
                      {insight.title && (
                        <span className="font-medium text-slate-200">{insight.title} — </span>
                      )}
                      {insight.content}
                    </div>
                    {isExpanded && insight.sourceUrl && (
                      <a
                        href={insight.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-400 hover:underline mt-1 inline-block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View source
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.className}`}>
                      {s.text}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {insight.themes.slice(0, isExpanded ? undefined : 2).map((theme) => (
                        <span
                          key={theme}
                          className="inline-block px-1.5 py-0.5 rounded bg-slate-700/50 text-xs text-slate-400"
                        >
                          {theme}
                        </span>
                      ))}
                      {!isExpanded && insight.themes.length > 2 && (
                        <span className="text-xs text-slate-500">+{insight.themes.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-400 tabular-nums text-xs">
                    {insight.narrativeScore.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">
                    {new Date(insight.timestamp).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  No results match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
