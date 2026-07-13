import type { ReadonlyURLSearchParams } from 'next/navigation';
import { useMemo } from 'react';

export interface ResultsQueryParams {
  query: string;
  invId: string | null;
  requestedScanId: string | null;
  freshSearch: boolean;
  urlSearchMode: 'topic' | 'claim' | 'person';
  urlPlatforms: string[] | undefined;
  urlTimeRange: string;
  urlLimit: number | undefined;
  urlUsernames: string[];
  urlHashtags: string[];
  urlWallets: string[];
  urlSubreddits: string[];
  enhancedQuery: string;
}

function normalizeRouteId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null;
  return trimmed;
}

/**
 * Parses the investigation-workspace query string into typed, stable derived
 * values. Array-valued params are memoized so they keep referential identity
 * across renders (they feed effect/callback dependency arrays downstream).
 */
export function useResultsQueryParams(searchParams: ReadonlyURLSearchParams): ResultsQueryParams {
  const rawQuery = searchParams.get('q');
  // Guard against a literal "undefined"/"null" reaching the URL from a stray
  // stringified value upstream.
  const query = rawQuery && rawQuery !== 'undefined' && rawQuery !== 'null' ? rawQuery : '';
  const invId = normalizeRouteId(searchParams.get('inv'));
  const requestedScanId = normalizeRouteId(searchParams.get('scan'));
  const freshSearch = searchParams.get('fresh') === '1';
  const urlModeParam = searchParams.get('mode');
  const urlSearchMode: 'topic' | 'claim' | 'person' =
    urlModeParam === 'claim' ? 'claim' : urlModeParam === 'person' ? 'person' : 'topic';
  const urlPlatforms = searchParams.get('platforms')?.split(',').filter(Boolean) ?? undefined;
  const urlTimeRange = searchParams.get('timeRange') ?? '7d';
  const parsedUrlLimit = Number.parseInt(searchParams.get('limit') ?? '', 10);
  const urlLimit =
    Number.isFinite(parsedUrlLimit) && parsedUrlLimit > 0 ? parsedUrlLimit : undefined;

  const urlUsernames = useMemo(
    () =>
      searchParams
        .get('usernames')
        ?.split(',')
        .map((s) => s.trim().replace(/^@/, ''))
        .filter(Boolean) ?? [],
    [searchParams],
  );
  const urlHashtags = useMemo(
    () =>
      searchParams
        .get('hashtags')
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [],
    [searchParams],
  );
  const urlWallets = useMemo(
    () =>
      searchParams
        .get('wallets')
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [],
    [searchParams],
  );
  const urlSubreddits = useMemo(
    () =>
      searchParams
        .get('subreddits')
        ?.split(',')
        .map((s) => s.trim().replace(/^r\//, ''))
        .filter(Boolean) ?? [],
    [searchParams],
  );

  // Build enhanced query: base query + hashtags + wallet terms + subreddit scoping
  const enhancedQuery = useMemo(() => {
    const parts = [query];
    for (const tag of urlHashtags) {
      const t = tag.startsWith('#') ? tag : `#${tag}`;
      if (!query.includes(t)) parts.push(t);
    }
    for (const wallet of urlWallets) {
      if (!query.includes(wallet)) parts.push(wallet);
    }
    for (const sub of urlSubreddits) {
      if (!query.includes(`subreddit:${sub}`)) parts.push(`subreddit:${sub}`);
    }
    return parts.join(' ');
  }, [query, urlHashtags, urlSubreddits, urlWallets]);

  return {
    query,
    invId,
    requestedScanId,
    freshSearch,
    urlSearchMode,
    urlPlatforms,
    urlTimeRange,
    urlLimit,
    urlUsernames,
    urlHashtags,
    urlWallets,
    urlSubreddits,
    enhancedQuery,
  };
}
