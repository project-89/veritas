'use client';

import { useState, useMemo } from 'react';
import type { RawPost } from '../lib/api';
import type { NarrativeCluster } from '../lib/transform';

interface NarrativeTimelineProps {
  posts: RawPost[];
  narratives: NarrativeCluster[];
}

/** Find which narrative cluster a post belongs to, if any */
function findCluster(
  post: RawPost,
  narratives: NarrativeCluster[],
): NarrativeCluster | undefined {
  for (const cluster of narratives) {
    if (cluster.posts.some((p) => p.id === post.id)) return cluster;
  }
  return undefined;
}

function platformBadge(platform: string): { className: string } {
  switch (platform) {
    case 'twitter':
      return { className: 'bg-sky-500/20 text-sky-400' };
    case 'reddit':
      return { className: 'bg-orange-500/20 text-orange-400' };
    case 'youtube':
      return { className: 'bg-red-500/20 text-red-400' };
    default:
      return { className: 'bg-slate-600/30 text-slate-400' };
  }
}

function formatEngagement(post: RawPost): string {
  const likes = post.engagement?.likes ?? 0;
  const comments = post.engagement?.comments ?? 0;
  const shares = post.engagement?.shares ?? 0;
  const total = likes + comments + shares;
  if (total === 0) return '';
  const parts: string[] = [];
  if (likes > 0) parts.push(`${likes.toLocaleString()} likes`);
  if (comments > 0) parts.push(`${comments.toLocaleString()} comments`);
  if (shares > 0) parts.push(`${shares.toLocaleString()} shares`);
  return parts.join(' / ');
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NarrativeTimeline({ posts, narratives }: NarrativeTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hoveredNarrative, setHoveredNarrative] = useState<string | null>(null);
  const [filterNarrative, setFilterNarrative] = useState<string | null>(null);

  // Sort posts chronologically and attach cluster info
  const timeline = useMemo(() => {
    const sorted = [...posts].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    return sorted.map((post) => ({
      post,
      cluster: findCluster(post, narratives),
    }));
  }, [posts, narratives]);

  // Group by date for date headers
  const grouped = useMemo(() => {
    const groups: Array<{
      date: string;
      items: Array<{ post: RawPost; cluster: NarrativeCluster | undefined }>;
    }> = [];
    let currentDate = '';
    for (const item of timeline) {
      const date = formatDate(item.post.timestamp);
      if (date !== currentDate) {
        currentDate = date;
        groups.push({ date, items: [] });
      }
      groups[groups.length - 1].items.push(item);
    }
    return groups;
  }, [timeline]);

  // Filter by narrative if selected
  const filteredGroups = useMemo(() => {
    if (!filterNarrative) return grouped;
    return grouped
      .map((g) => ({
        ...g,
        items: g.items.filter((item) => item.cluster?.id === filterNarrative),
      }))
      .filter((g) => g.items.length > 0);
  }, [grouped, filterNarrative]);

  if (posts.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-slate-500">
        No posts available.
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-full">
      {/* Sidebar: narrative legend */}
      <div className="w-56 flex-shrink-0 space-y-1.5">
        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
          Narratives
        </h4>
        <button
          onClick={() => setFilterNarrative(null)}
          className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors ${
            filterNarrative === null
              ? 'bg-slate-700 text-slate-200'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-300'
          }`}
        >
          All ({posts.length})
        </button>
        {narratives.map((n) => (
          <button
            key={n.id}
            onClick={() => setFilterNarrative(filterNarrative === n.id ? null : n.id)}
            onMouseEnter={() => setHoveredNarrative(n.id)}
            onMouseLeave={() => setHoveredNarrative(null)}
            className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors flex items-center gap-2 ${
              filterNarrative === n.id
                ? 'bg-slate-700 text-slate-200'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-300'
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: n.color }}
            />
            <span className="truncate flex-1">{n.label}</span>
            <span className="text-slate-600 flex-shrink-0">{n.posts.length}</span>
          </button>
        ))}
      </div>

      {/* Timeline feed */}
      <div className="flex-1 overflow-y-auto max-h-[600px] pr-1 space-y-0">
        {filteredGroups.map((group) => (
          <div key={group.date}>
            {/* Date header */}
            <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm py-2 mb-1">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                {group.date}
              </span>
            </div>

            {/* Posts for this date */}
            <div className="space-y-1.5 mb-4">
              {group.items.map(({ post, cluster }, postIdx) => {
                const isExpanded = expandedId === post.id;
                const isFaded =
                  hoveredNarrative !== null && cluster?.id !== hoveredNarrative;
                const badge = platformBadge(post.platform);
                const engagement = formatEngagement(post);

                return (
                  <div
                    key={`${post.id}-${postIdx}`}
                    onClick={() => setExpandedId(isExpanded ? null : post.id)}
                    className={`flex gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                      isFaded
                        ? 'opacity-20'
                        : 'opacity-100 hover:bg-slate-800/60'
                    } ${isExpanded ? 'bg-slate-800/80' : ''}`}
                  >
                    {/* Narrative color indicator */}
                    <div className="flex flex-col items-center flex-shrink-0 pt-1">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{
                          backgroundColor: cluster?.color ?? '#555',
                        }}
                      />
                      {isExpanded && (
                        <div
                          className="w-0.5 flex-1 mt-1 rounded-full"
                          style={{
                            backgroundColor: cluster?.color ?? '#555',
                            opacity: 0.4,
                          }}
                        />
                      )}
                    </div>

                    {/* Post content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-medium text-slate-200">
                          {post.authorHandle
                            ? `@${post.authorHandle}`
                            : post.authorName}
                        </span>
                        <span
                          className={`text-xs font-medium px-1.5 py-0.5 rounded ${badge.className}`}
                        >
                          {post.platform}
                        </span>
                        <span className="text-xs text-slate-600 ml-auto flex-shrink-0">
                          {formatTime(post.timestamp)}
                        </span>
                      </div>

                      <p
                        className={`text-sm text-slate-300 ${
                          isExpanded ? '' : 'line-clamp-2'
                        }`}
                      >
                        {post.text}
                      </p>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="mt-3 space-y-2">
                          {engagement && (
                            <div className="text-xs text-slate-500">
                              {engagement}
                            </div>
                          )}
                          {post.themes && post.themes.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {post.themes
                                .filter((t) => t.length > 2)
                                .map((theme) => (
                                  <span
                                    key={theme}
                                    className="text-xs px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400"
                                  >
                                    {theme}
                                  </span>
                                ))}
                            </div>
                          )}
                          {cluster && (
                            <div className="text-xs text-slate-600">
                              Narrative:{' '}
                              <span style={{ color: cluster.color }}>
                                {cluster.label}
                              </span>
                            </div>
                          )}
                          {post.url && (
                            <a
                              href={post.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-indigo-400 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View original
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
