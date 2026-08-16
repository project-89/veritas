/**
 * Single source of truth for how Veritas identifies itself to external hosts.
 *
 * Previously this string was duplicated across ~10 files in three variants,
 * and every one of them advertised `github.com/oneirocom/veritas` — which
 * returns 404. The whole purpose of the `+URL` convention is to let a
 * publisher work out who is fetching them and get in touch instead of
 * blocking. A dead link inverts that: it reads as a scraper wearing a fake
 * badge, and is a plausible contributor to the 403s the source health check
 * found (NIH, RAND, State Dept).
 *
 * The repository actually lives at github.com/project-89/veritas.
 *
 * Override with VERITAS_USER_AGENT (or RSS_USER_AGENT for feeds specifically)
 * when running a fork or a private deployment — but keep a real, reachable
 * contact URL in it.
 */

/** Canonical, reachable project URL. Verify before changing. */
export const VERITAS_PROJECT_URL = 'https://github.com/project-89/veritas';

/** Identifies the client honestly and points somewhere a publisher can reach. */
export const VERITAS_USER_AGENT = `Mozilla/5.0 (compatible; Veritas/2.0; +${VERITAS_PROJECT_URL})`;

/** Resolve the UA, honouring env overrides. `specificKey` wins over the general one. */
export function resolveUserAgent(specificKey?: string): string {
  const specific = specificKey ? process.env[specificKey] : undefined;
  return specific || process.env['VERITAS_USER_AGENT'] || VERITAS_USER_AGENT;
}

/** Accept header for RSS/Atom feed requests. */
export const FEED_ACCEPT_HEADER =
  'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8';
