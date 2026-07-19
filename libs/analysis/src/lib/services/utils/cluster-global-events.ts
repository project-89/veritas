import type { GlobalEvent } from '../../types/global-event';
import { overlapCoefficient, sameLocation, significantTitleTokens } from './dedupe-global-events';

/**
 * Groups feed events that describe the SAME real-world happening reported by
 * different outlets — the inverse of dedupeGlobalEvents, which collapses them.
 * The divergence view needs the whole group: how TASS, Press TV, the BBC and
 * Reuters each frame one event IS the data.
 *
 * Grouping is deliberately looser than dedup on category (the same story
 * arrives as 'political' from a regional feed and 'media' from a world-news
 * feed) but keeps the token-overlap and time constraints. Location must match
 * when both sides have a confident (geocoded) location; a region-centroid
 * fallback location is not evidence of a different story.
 */

/** How an outlet relates to state power — the comparison axis. */
export type PerspectiveClass =
  | 'state-domestic'
  | 'state-international'
  | 'public-broadcaster'
  | 'independent';

export interface StoryCluster {
  /** Stable id derived from the first member. */
  id: string;
  /** Representative headline (from the best-connected member). */
  title: string;
  category: GlobalEvent['category'];
  location: GlobalEvent['location'];
  earliest: string;
  latest: string;
  events: GlobalEvent[];
  /** Distinct perspective classes present in this cluster. */
  perspectives: PerspectiveClass[];
}

// Looser than dedup's 0.5: DIVERGENT framings of one event share few words by
// definition (TASS's "strikes completed" vs Press TV's "Washington cannot be
// trusted" share only the subject). Location tokens are deliberately KEPT here
// (unlike dedup) — place is the strongest shared anchor across framings, and
// the geographic constraint below still separates same-topic different-place
// stories.
const DEFAULT_WINDOW_MS = 48 * 60 * 60 * 1000;
const DEFAULT_OVERLAP = 0.34;
const MIN_SHARED_TOKENS = 2;

export function perspectiveOf(event: GlobalEvent): PerspectiveClass {
  const ownership = event.metadata?.['feedOwnership'];
  const audience = event.metadata?.['feedAudience'];
  if (ownership === 'state-media') {
    return audience === 'domestic' ? 'state-domestic' : 'state-international';
  }
  if (ownership === 'public-broadcaster') return 'public-broadcaster';
  return 'independent';
}

/** Whether the event's location came from its own text rather than the feed's
 *  home-region fallback (which says where the OUTLET lives, not the story). */
function hasConfidentLocation(event: GlobalEvent): boolean {
  return event.location?.region === 'geocoded';
}

function sharedTokenCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

export interface ClusterOptions {
  windowMs?: number;
  overlapThreshold?: number;
}

export function clusterGlobalEvents(
  events: GlobalEvent[],
  options: ClusterOptions = {},
): StoryCluster[] {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const overlapThreshold = options.overlapThreshold ?? DEFAULT_OVERLAP;

  interface Member {
    event: GlobalEvent;
    tokens: Set<string>;
    time: number;
  }
  const clusters: Member[][] = [];

  for (const event of events) {
    const tokens = significantTitleTokens(event.title);
    if (tokens.size === 0) continue;
    const time = new Date(event.timestamp).getTime();

    let placed = false;
    for (const cluster of clusters) {
      const matches = cluster.some((member) => {
        if (
          Number.isFinite(time) &&
          Number.isFinite(member.time) &&
          Math.abs(member.time - time) > windowMs
        ) {
          return false;
        }
        if (
          hasConfidentLocation(event) &&
          hasConfidentLocation(member.event) &&
          !sameLocation(event.location, member.event.location)
        ) {
          return false;
        }
        return (
          overlapCoefficient(tokens, member.tokens) >= overlapThreshold &&
          sharedTokenCount(tokens, member.tokens) >= MIN_SHARED_TOKENS
        );
      });
      if (matches) {
        cluster.push({ event, tokens, time });
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([{ event, tokens, time }]);
  }

  return clusters.map((members) => {
    const evs = members.map((m) => m.event);
    const times = members
      .map((m) => m.time)
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);
    const perspectives = [...new Set(evs.map(perspectiveOf))];
    // Representative: prefer a geocoded independent/broadcaster headline
    // (usually the most neutral phrasing), else the first member.
    const representative =
      evs.find((e) => perspectiveOf(e) !== 'state-domestic' && hasConfidentLocation(e)) ?? evs[0];
    if (!representative) throw new Error('unreachable: empty cluster');
    return {
      id: `story-${representative.id}`,
      title: representative.title,
      category: representative.category,
      location: representative.location,
      earliest: new Date(times[0] ?? Date.now()).toISOString(),
      latest: new Date(times[times.length - 1] ?? Date.now()).toISOString(),
      events: evs,
      perspectives,
    };
  });
}
