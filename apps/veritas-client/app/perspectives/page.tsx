'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GlobalEvent } from '../../lib/global-event.types';
import { EVENT_COLORS } from '../../lib/global-event.types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const REFRESH_MS = 5 * 60 * 1000;

type PerspectiveClass =
  | 'state-domestic'
  | 'state-international'
  | 'public-broadcaster'
  | 'independent';

interface StoryCluster {
  id: string;
  title: string;
  category: GlobalEvent['category'];
  location: GlobalEvent['location'];
  earliest: string;
  latest: string;
  events: GlobalEvent[];
  perspectives: PerspectiveClass[];
}

const PERSPECTIVE_ORDER: PerspectiveClass[] = [
  'state-domestic',
  'state-international',
  'public-broadcaster',
  'independent',
];

const PERSPECTIVE_META: Record<
  PerspectiveClass,
  { label: string; short: string; className: string; dot: string }
> = {
  'state-domestic': {
    label: 'State — domestic audience',
    short: 'STATE·DOM',
    className: 'border-nerv-red/50 text-nerv-red',
    dot: 'bg-nerv-red',
  },
  'state-international': {
    label: 'State — international audience',
    short: 'STATE·INTL',
    className: 'border-nerv-orange/50 text-nerv-orange',
    dot: 'bg-nerv-orange',
  },
  'public-broadcaster': {
    label: 'Public broadcaster',
    short: 'PUBLIC',
    className: 'border-nerv-blue/40 text-nerv-blue/90',
    dot: 'bg-nerv-blue',
  },
  independent: {
    label: 'Independent',
    short: 'INDEP',
    className: 'border-nerv-border text-nerv-text-secondary',
    dot: 'bg-nerv-text-muted',
  },
};

const WINDOWS = [
  { label: '24h', hours: 24 },
  { label: '48h', hours: 48 },
  { label: '7d', hours: 168 },
] as const;

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function perspectiveOf(e: GlobalEvent): PerspectiveClass {
  const ownership = e.metadata['feedOwnership'];
  const audience = e.metadata['feedAudience'];
  if (ownership === 'state-media' || ownership === 'state-official') {
    return audience === 'domestic' ? 'state-domestic' : 'state-international';
  }
  if (ownership === 'public-broadcaster') return 'public-broadcaster';
  return 'independent';
}

function groupByPerspective(story: StoryCluster): Map<PerspectiveClass, GlobalEvent[]> {
  const byPerspective = new Map<PerspectiveClass, GlobalEvent[]>();
  for (const e of story.events) {
    const p = perspectiveOf(e);
    const arr = byPerspective.get(p);
    if (arr) arr.push(e);
    else byPerspective.set(p, [e]);
  }
  return byPerspective;
}

/** Four small squares showing which perspective classes cover a story. */
function PresenceDots({ present }: { present: Set<PerspectiveClass> }) {
  return (
    <div className="flex items-center gap-1">
      {PERSPECTIVE_ORDER.map((p) => (
        <span
          key={p}
          title={PERSPECTIVE_META[p].label}
          className={[
            'h-1.5 w-1.5 rounded-[1px]',
            present.has(p) ? PERSPECTIVE_META[p].dot : 'bg-nerv-border',
          ].join(' ')}
        />
      ))}
    </div>
  );
}

/** Compact left-rail row. */
function StoryRow({
  story,
  active,
  onSelect,
}: {
  story: StoryCluster;
  active: boolean;
  onSelect: () => void;
}) {
  const present = new Set(story.perspectives);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full border-b border-nerv-border px-3 py-2.5 text-left transition-colors',
        active ? 'bg-nerv-orange/10' : 'hover:bg-nerv-bg-elevated/40',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: EVENT_COLORS[story.category] }}
        />
        <div className="min-w-0 flex-1">
          <div
            className={[
              'text-[12px] font-mono leading-snug line-clamp-2',
              active ? 'text-nerv-text' : 'text-nerv-text-secondary',
            ].join(' ')}
          >
            {story.title}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate text-[10px] font-mono uppercase tracking-wider text-nerv-text-muted">
              {story.location.label} · {timeAgo(story.latest)}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <PresenceDots present={present} />
              <span className="text-[10px] font-mono text-nerv-text-muted">
                {story.perspectives.length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

/** Right-pane detail: the full four-column framing comparison. */
function StoryDetail({ story }: { story: StoryCluster }) {
  const byPerspective = groupByPerspective(story);
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-nerv-border px-4 py-3">
        <h2 className="text-sm font-mono font-bold text-nerv-text leading-snug">{story.title}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-nerv-text-muted">
          <span style={{ color: EVENT_COLORS[story.category] }}>{story.category}</span>
          <span>·</span>
          <span>{story.location.label}</span>
          <span>·</span>
          <span>
            {story.events.length} reports · {story.perspectives.length} perspective classes
          </span>
          <span>·</span>
          <span>latest {timeAgo(story.latest)}</span>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-px overflow-y-auto bg-nerv-border sm:grid-cols-2 xl:grid-cols-4">
        {PERSPECTIVE_ORDER.map((p) => {
          const evs = byPerspective.get(p);
          const meta = PERSPECTIVE_META[p];
          return (
            <div key={p} className="bg-nerv-bg-panel p-3">
              <div
                className={`mb-2 inline-block rounded-sm border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${meta.className}`}
              >
                {meta.label}
              </div>
              {evs ? (
                <ul className="space-y-2.5">
                  {evs.map((e) => {
                    const original = e.metadata['originalTitle'] as string | undefined;
                    const link = e.metadata['link'] as string | undefined;
                    const feedName = (e.metadata['feedName'] as string) ?? e.source;
                    return (
                      <li key={e.id}>
                        <div className="text-[10px] font-mono uppercase tracking-wider text-nerv-text-muted">
                          {feedName}
                        </div>
                        {link ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-[12px] font-mono text-nerv-text-secondary leading-snug hover:text-nerv-orange"
                          >
                            {e.title}
                          </a>
                        ) : (
                          <div className="text-[12px] font-mono text-nerv-text-secondary leading-snug">
                            {e.title}
                          </div>
                        )}
                        {e.metadata['translated'] === true && original && (
                          <div className="mt-0.5 text-[10px] font-mono text-nerv-text-muted/70 leading-snug">
                            {original}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="text-[11px] font-mono text-nerv-text-muted/40">no coverage</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PerspectivesPage() {
  const [stories, setStories] = useState<StoryCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowHours, setWindowHours] = useState<number>(48);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (hours: number) => {
    try {
      const res = await fetch(`${API_BASE}/events/divergence?limit=50&windowHours=${hours}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStories((await res.json()) as StoryCluster[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load(windowHours);
    const t = setInterval(() => void load(windowHours), REFRESH_MS);
    return () => clearInterval(t);
  }, [load, windowHours]);

  // Keep a valid selection: honor a deep-link hash, else default to the first
  // (most-contested) story; fall back if the selected story ages out.
  const selected = useMemo(
    () => stories.find((s) => s.id === selectedId) ?? stories[0] ?? null,
    [stories, selectedId],
  );
  useEffect(() => {
    if (stories.length === 0) return;
    const hash = window.location.hash.slice(1);
    if (hash && stories.some((s) => s.id === decodeURIComponent(hash))) {
      setSelectedId(decodeURIComponent(hash));
    }
  }, [stories]);

  return (
    <div className="flex h-[calc(100vh-49px)] flex-col bg-nerv-bg">
      {/* Header */}
      <div className="shrink-0 border-b border-nerv-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[13px] font-mono uppercase tracking-[0.15em] text-nerv-orange">
              Narrative Divergence
            </h1>
            <p className="mt-0.5 text-[11px] font-mono text-nerv-text-muted">
              The same story, split by who is telling it — the gap between columns is the signal.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-nerv-text-muted">
              Most-contested · last
            </span>
            <div className="flex items-center gap-1">
              {WINDOWS.map((w) => (
                <button
                  key={w.hours}
                  type="button"
                  onClick={() => setWindowHours(w.hours)}
                  className={[
                    'rounded-sm border px-2 py-1 text-[11px] font-mono uppercase tracking-wider transition-colors',
                    windowHours === w.hours
                      ? 'border-nerv-orange/60 bg-nerv-orange/10 text-nerv-orange'
                      : 'border-nerv-border text-nerv-text-muted hover:text-nerv-text-secondary',
                  ].join(' ')}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading && stories.length === 0 ? (
        <p className="py-12 text-center text-[12px] font-mono text-nerv-text-muted">loading…</p>
      ) : error ? (
        <p className="py-12 text-center text-[12px] font-mono text-nerv-red">
          failed to load divergence data: {error}
        </p>
      ) : stories.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="max-w-md text-center text-[12px] font-mono text-nerv-text-muted leading-relaxed">
            No multi-perspective stories in the last {WINDOWS.find((w) => w.hours === windowHours)?.label}.
            Divergence requires the same story to surface from two or more perspective classes — widen
            the window or check back as feeds accumulate.
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[360px_1fr]">
          {/* Left rail: scannable index */}
          <div className="flex min-h-0 flex-col border-b border-nerv-border lg:border-b-0 lg:border-r">
            <div className="shrink-0 border-b border-nerv-border px-3 py-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-nerv-text-muted">
                {stories.length} contested {stories.length === 1 ? 'story' : 'stories'}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto max-lg:max-h-[38vh]">
              {stories.map((story) => (
                <StoryRow
                  key={story.id}
                  story={story}
                  active={selected?.id === story.id}
                  onSelect={() => setSelectedId(story.id)}
                />
              ))}
            </div>
          </div>

          {/* Right pane: focused detail */}
          <div className="min-h-0 overflow-hidden">
            {selected ? (
              <StoryDetail story={selected} />
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] font-mono text-nerv-text-muted">
                Select a story
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
