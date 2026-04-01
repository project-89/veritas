'use client';

import { useState, useMemo } from 'react';
import type { RawPost, NarrativeInsight } from '../lib/api';

interface RawDataTableProps {
  posts: RawPost[];
  insights: NarrativeInsight[];
}

type SortField = 'timestamp' | 'sentiment' | 'engagement' | 'platform';
type SortDir = 'asc' | 'desc';

const PLATFORM_LABELS: Record<string, string> = {
  reddit: 'Reddit',
  twitter: 'Twitter',
  youtube: 'YouTube',
  facebook: 'Facebook',
};

function sentimentBadge(label: string): { text: string; className: string } {
  switch (label) {
    case 'positive':
      return { text: 'Positive', className: 'bg-emerald-500/20 text-emerald-400' };
    case 'negative':
      return { text: 'Negative', className: 'bg-red-500/20 text-red-400' };
    default:
      return { text: 'Neutral', className: 'bg-slate-600/30 text-slate-300' };
  }
}

interface PairedRow {
  post: RawPost;
  insight: NarrativeInsight | undefined;
  index: number;
}

export function RawDataTable({ posts, insights }: RawDataTableProps) {
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);
  const [filterSentiment, setFilterSentiment] = useState<string | null>(null);

  // Pair posts with insights by index
  const paired: PairedRow[] = useMemo(
    () => posts.map((post, index) => ({ post, insight: insights[index], index })),
    [posts, insights],
  );

  const platforms = useMemo(
    () => Array.from(new Set(posts.map((p) => p.platform))).sort(),
    [posts],
  );

  const filtered = useMemo(() => {
    let list = [...paired];
    if (filterPlatform) list = list.filter((r) => r.post.platform === filterPlatform);
    if (filterSentiment) list = list.filter((r) => r.insight?.sentiment.label === filterSentiment);
    return list;
  }, [paired, filterPlatform, filterSentiment]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortField === 'timestamp')
        return dir * (new Date(a.post.timestamp).getTime() - new Date(b.post.timestamp).getTime());
      if (sortField === 'sentiment')
        return dir * ((a.insight?.sentiment.score ?? 0) - (b.insight?.sentiment.score ?? 0));
      if (sortField === 'engagement') {
        const engA = a.post.engagement.likes + a.post.engagement.comments + a.post.engagement.shares;
        const engB = b.post.engagement.likes + b.post.engagement.comments + b.post.engagement.shares;
        return dir * (engA - engB);
      }
      if (sortField === 'platform') return dir * a.post.platform.localeCompare(b.post.platform);
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
              {PLATFORM_LABELS[p] ?? p.charAt(0).toUpperCase() + p.slice(1)}
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
          {sorted.length} of {posts.length} results
        </span>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-[600px] rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/80 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left w-20">
                <SortHeader field="platform" label="Platform" />
              </th>
              <th className="px-3 py-2 text-left w-28">Author</th>
              <th className="px-3 py-2 text-left">Text</th>
              <th className="px-3 py-2 text-left w-24">
                <SortHeader field="sentiment" label="Sentiment" />
              </th>
              <th className="px-3 py-2 text-left w-36">Themes</th>
              <th className="px-3 py-2 text-left w-28">
                <SortHeader field="engagement" label="Engagement" />
              </th>
              <th className="px-3 py-2 text-left w-28">
                <SortHeader field="timestamp" label="Time" />
              </th>
              <th className="px-3 py-2 text-left w-16">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {sorted.map(({ post, insight, index }) => {
              const s = insight
                ? sentimentBadge(insight.sentiment.label)
                : sentimentBadge('neutral');
              const rowKey = `${post.id}-${index}`;
              const isExpanded = expandedId === rowKey;
              const displayText = isExpanded
                ? post.text
                : post.text.length > 200
                  ? `${post.text.slice(0, 200)}...`
                  : post.text;

              return (
                <tr
                  key={rowKey}
                  className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : rowKey)}
                >
                  <td className="px-3 py-2 text-slate-300 text-xs">
                    {PLATFORM_LABELS[post.platform] ?? post.platform}
                  </td>
                  <td className="px-3 py-2 text-slate-400 text-xs">
                    @{post.authorHandle}
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    <div className={isExpanded ? '' : 'line-clamp-2'}>
                      {displayText}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.className}`}>
                      {s.text}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(insight?.themes ?? []).slice(0, isExpanded ? undefined : 2).map((theme) => (
                        <span
                          key={theme}
                          className="inline-block px-1.5 py-0.5 rounded bg-slate-700/50 text-xs text-slate-400"
                        >
                          {theme}
                        </span>
                      ))}
                      {!isExpanded && (insight?.themes.length ?? 0) > 2 && (
                        <span className="text-xs text-slate-500">
                          +{(insight?.themes.length ?? 0) - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-400 text-xs">
                    <span title="Likes">{post.engagement.likes}</span>
                    {' / '}
                    <span title="Comments">{post.engagement.comments}</span>
                    {' / '}
                    <span title="Shares">{post.engagement.shares}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">
                    {new Date(post.timestamp).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    {post.url && (
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-400 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
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
