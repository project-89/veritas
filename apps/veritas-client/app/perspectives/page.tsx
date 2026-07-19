'use client';

import { useCallback, useEffect, useState } from 'react';
import { NervPanel } from '../../components/nerv';
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

const PERSPECTIVE_META: Record<PerspectiveClass, { label: string; className: string }> = {
  'state-domestic': {
    label: 'State — domestic audience',
    className: 'border-nerv-red/50 text-nerv-red',
  },
  'state-international': {
    label: 'State — international audience',
    className: 'border-nerv-orange/50 text-nerv-orange',
  },
  'public-broadcaster': {
    label: 'Public broadcaster',
    className: 'border-nerv-blue/40 text-nerv-blue/90',
  },
  independent: {
    label: 'Independent',
    className: 'border-nerv-border text-nerv-text-secondary',
  },
};

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
  if (ownership === 'state-media') {
    return audience === 'domestic' ? 'state-domestic' : 'state-international';
  }
  if (ownership === 'public-broadcaster') return 'public-broadcaster';
  return 'independent';
}

function StoryCard({ story }: { story: StoryCluster }) {
  const byPerspective = new Map<PerspectiveClass, GlobalEvent[]>();
  for (const e of story.events) {
    const p = perspectiveOf(e);
    const arr = byPerspective.get(p);
    if (arr) arr.push(e);
    else byPerspective.set(p, [e]);
  }

  return (
    <div className="border border-nerv-border rounded-sm bg-nerv-bg-panel">
      <div className="flex items-baseline justify-between gap-3 border-b border-nerv-border px-3 py-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-mono font-bold text-nerv-text leading-snug">
            {story.title}
          </h3>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-nerv-text-muted">
            <span style={{ color: EVENT_COLORS[story.category] }}>{story.category}</span>
            <span>·</span>
            <span>{story.location.label}</span>
            <span>·</span>
            <span>{timeAgo(story.latest)}</span>
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-nerv-text-muted">
          {story.events.length} reports · {story.perspectives.length} perspectives
        </span>
      </div>

      <div className="grid grid-cols-1 gap-px bg-nerv-border sm:grid-cols-2 lg:grid-cols-4">
        {PERSPECTIVE_ORDER.map((p) => {
          const evs = byPerspective.get(p);
          const meta = PERSPECTIVE_META[p];
          return (
            <div key={p} className="bg-nerv-bg-panel p-2.5 min-h-[72px]">
              <div
                className={`mb-1.5 inline-block border px-1.5 py-0.5 rounded-sm text-[9px] font-mono uppercase tracking-wider ${meta.className}`}
              >
                {meta.label}
              </div>
              {evs ? (
                <ul className="space-y-2">
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
                <div className="text-[11px] font-mono text-nerv-text-muted/50">no coverage</div>
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

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/events/divergence?limit=20&windowHours=48`);
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
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="min-h-[calc(100vh-49px)] bg-nerv-bg px-4 pt-4 pb-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <NervPanel
          title="NARRATIVE DIVERGENCE"
          subtitle="the same story, by who is telling it"
          accent="orange"
          className="p-3"
        >
          <p className="text-[12px] font-mono text-nerv-text-muted leading-relaxed">
            Recent stories covered from two or more perspective classes. What state outlets tell
            their own population, what they broadcast abroad, and what public broadcasters and
            independent outlets report — side by side. The gap between the columns is the signal.
          </p>
        </NervPanel>

        {loading ? (
          <p className="py-8 text-center text-[12px] font-mono text-nerv-text-muted">loading…</p>
        ) : error ? (
          <p className="py-8 text-center text-[12px] font-mono text-nerv-red">
            failed to load divergence data: {error}
          </p>
        ) : stories.length === 0 ? (
          <p className="py-8 text-center text-[12px] font-mono text-nerv-text-muted">
            No multi-perspective stories in the current window. Divergence requires the same story
            to surface from at least two perspective classes — check back as feeds accumulate.
          </p>
        ) : (
          <div className="space-y-3">
            {stories.map((story) => (
              <StoryCard key={story.id} story={story} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
