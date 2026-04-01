'use client';

import { useState, useMemo } from 'react';
import type { RawPost } from '../lib/api';

interface RawDataTableProps {
  posts?: RawPost[];
}

type SortField = 'timestamp' | 'sentiment' | 'engagement' | 'platform';
type SortDir = 'asc' | 'desc';

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

export function RawDataTable({ posts = [] }: RawDataTableProps) {
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);
  const [filterSentiment, setFilterSentiment] = useState<string | null>(null);

  const platforms = useMemo(
    () => Array.from(new Set(posts.map((p) => p.platform))).sort(),
    [posts],
  );

  const filtered = useMemo(() => {
    let list = [...posts];
    if (filterPlatform) list = list.filter((p) => p.platform === filterPlatform);
    if (filterSentiment) list = list.filter((p) => p.sentiment?.label === filterSentiment);
    return list;
  }, [posts, filterPlatform, filterSentiment]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortField === 'timestamp') return dir * (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      if (sortField === 'sentiment') return dir * ((a.sentiment?.score ?? 0) - (b.sentiment?.score ?? 0));
      if (sortField === 'engagement') return dir * (
        ((a.engagement?.likes ?? 0) + (a.engagement?.comments ?? 0)) -
        ((b.engagement?.likes ?? 0) + (b.engagement?.comments ?? 0))
      );
      if (sortField === 'platform') return dir * a.platform.localeCompare(b.platform);
      return 0;
    });
    return list;
  }, [filtered, sortField, sortDir]);

  if (posts.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-slate-500">
        No data available.
      </div>
    );
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
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
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
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
              <th className="px-3 py-2 text-left w-32">Author</th>
              <th className="px-3 py-2 text-left">Content</th>
              <th className="px-3 py-2 text-left w-24">
                <SortHeader field="sentiment" label="Sentiment" />
              </th>
              <th className="px-3 py-2 text-left w-24">
                <SortHeader field="engagement" label="Engage" />
              </th>
              <th className="px-3 py-2 text-left w-28">
                <SortHeader field="timestamp" label="Date" />
              </th>
              <th className="px-3 py-2 text-left w-12">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {sorted.map((post, index) => {
              const s = sentimentBadge(post.sentiment?.label ?? 'neutral');
              const rowKey = `${post.id}-${index}`;
              const isExpanded = expandedId === rowKey;
              const likes = post.engagement?.likes ?? 0;
              const comments = post.engagement?.comments ?? 0;
              const shares = post.engagement?.shares ?? 0;

              return (
                <tr
                  key={rowKey}
                  className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : rowKey)}
                >
                  <td className="px-3 py-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      post.platform === 'twitter' ? 'bg-sky-500/20 text-sky-400' :
                      post.platform === 'reddit' ? 'bg-orange-500/20 text-orange-400' :
                      post.platform === 'youtube' ? 'bg-red-500/20 text-red-400' :
                      'bg-slate-600/30 text-slate-400'
                    }`}>
                      {post.platform}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-slate-300 text-xs">
                      {post.authorHandle ? `@${post.authorHandle}` : post.authorName}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    <div className={isExpanded ? '' : 'line-clamp-2 text-xs'}>
                      {post.text}
                    </div>
                    {isExpanded && (post.themes?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {post.themes.filter(t => t.length > 2).map((theme) => (
                          <span key={theme} className="text-xs px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">
                            {theme}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.className}`}>
                      {s.text}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400 tabular-nums">
                    {likes > 0 || comments > 0 || shares > 0
                      ? `${likes} / ${comments} / ${shares}`
                      : '-'
                    }
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
