import { FEED_ACCEPT_HEADER, resolveUserAgent } from './http-identity';

/**
 * Conditional (cache-validating) feed fetching.
 *
 * Veritas was refetching every feed in full on every poll — 160 feeds, some
 * every 10 minutes, forever, regardless of whether anything had changed. That
 * is the behaviour publishers rate-limit and block, and it is why a polite
 * self-identifying user-agent still collected 403s and 429s.
 *
 * Every real feed reader sends `If-None-Match` / `If-Modified-Since` and gets
 * back a ~200-byte `304 Not Modified` instead of a full document.
 *
 * MEASURED, not assumed — sampling 60 feeds from our catalog (2026-08):
 *   29/60 advertise an ETag or Last-Modified
 *   19/60 actually return 304 when revalidated
 * The rest ignore validators or regenerate the document per request (CDNs with
 * weak/rotating ETags are the usual cause). So this is a worthwhile ~third of
 * traffic, not a silver bullet; the poll-interval change is the larger win
 * because it applies to every feed. Sending validators also costs nothing when
 * unsupported — the server simply answers 200 as before.
 *
 * This is deliberately transport-level and storage-agnostic: the caller
 * supplies and persists the validators, so it works for both the ambient
 * global-event poller and the on-demand scan connector.
 */

/** Cache validators returned by a previous fetch of the same URL. */
export interface FeedValidators {
  etag?: string;
  lastModified?: string;
}

export type ConditionalFeedResult =
  /** Server said nothing changed — reuse whatever was cached. */
  | { status: 'not-modified' }
  /** Fresh body, plus validators to persist for next time. */
  | { status: 'modified'; body: string; validators: FeedValidators }
  /** Server asked us to back off. `retryAfterMs` is present when it said how long. */
  | { status: 'rate-limited'; retryAfterMs?: number }
  | { status: 'error'; statusCode?: number; detail: string };

const DEFAULT_TIMEOUT_MS = 15000;

/** Parse `Retry-After`, which may be seconds or an HTTP date. */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(header);
  if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  return undefined;
}

/**
 * Fetch a feed, sending validators so an unchanged feed costs a 304.
 *
 * Never throws — every outcome is a discriminated result, because a single
 * unreachable feed must not abort a polling cycle over 160 of them.
 */
export async function conditionalFeedFetch(
  url: string,
  validators: FeedValidators = {},
  options: { timeoutMs?: number; userAgentEnvKey?: string } = {},
): Promise<ConditionalFeedResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const headers: Record<string, string> = {
    'User-Agent': resolveUserAgent(options.userAgentEnvKey ?? 'RSS_USER_AGENT'),
    Accept: FEED_ACCEPT_HEADER,
    'Accept-Language': 'en-US,en;q=0.9',
  };
  // Only ONE of these is needed, but sending both is standard and lets the
  // server pick whichever it supports.
  if (validators.etag) headers['If-None-Match'] = validators.etag;
  if (validators.lastModified) headers['If-Modified-Since'] = validators.lastModified;

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers,
      redirect: 'follow',
    }).finally(() => clearTimeout(timer));

    if (res.status === 304) return { status: 'not-modified' };

    if (res.status === 429 || res.status === 503) {
      const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
      return { status: 'rate-limited', ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) };
    }

    if (!res.ok) {
      return { status: 'error', statusCode: res.status, detail: `HTTP ${res.status}` };
    }

    const body = await res.text();
    const nextValidators: FeedValidators = {};
    const etag = res.headers.get('etag');
    const lastModified = res.headers.get('last-modified');
    if (etag) nextValidators.etag = etag;
    if (lastModified) nextValidators.lastModified = lastModified;

    return { status: 'modified', body, validators: nextValidators };
  } catch (err) {
    clearTimeout(timer);
    // Caller decides how loudly to report this; the util stays logger-free so
    // libs/shared/utils keeps no framework dependency.
    const detail = err instanceof Error ? err.message : String(err);
    return { status: 'error', detail: detail.slice(0, 120) };
  }
}
