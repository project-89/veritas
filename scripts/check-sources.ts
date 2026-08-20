#!/usr/bin/env npx tsx
/**
 * Data-source health check.
 *
 * The connector capability table at startup reports whether CREDENTIALS are
 * present — not whether the source actually works. GDELT reported "live" and
 * returned HTTP 429; RSS reported "live" and silently discarded everything it
 * fetched. This checks the other thing: does each source still return usable
 * data today?
 *
 * Feeds rot quietly. A dead feed produces no error anyone sees — it just
 * contributes nothing, forever, while the catalog still claims coverage. The
 * China-domestic feeds are already known to be extinct.
 *
 * Usage:
 *   tsx scripts/check-sources.ts            # RSS catalog + keyless HTTP sources
 *   tsx scripts/check-sources.ts --json
 *   tsx scripts/check-sources.ts --failing  # only problems
 */

import { RSS_FEED_CATALOG, type RssFeedEntry } from '../libs/ingestion/src/lib/config/rss-feed-catalog';

type Verdict = 'ok' | 'stale' | 'empty' | 'http-error' | 'unreachable' | 'parse-error';

interface FeedHealth {
  name: string;
  category: string;
  language: string;
  url: string;
  verdict: Verdict;
  items: number;
  newestAgeDays: number | null;
  detail?: string;
}

/**
 * MUST match RSSConnector.fetchFeedXml. An earlier version of this script sent
 * its own UA and reported the US State Department feed as "not RSS" — a false
 * positive, because that publisher varies its response by user-agent. A health
 * check that does not use the real client's configuration measures a different
 * system than the one in production.
 */
const CONNECTOR_UA =
  process.env['RSS_USER_AGENT'] ?? 'Mozilla/5.0 (compatible; VeritasRSS/1.0; +https://oneirocom.com)';
const CONNECTOR_ACCEPT =
  'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8';

/** Beyond this, a feed is technically alive but contributes nothing current. */
const STALE_AFTER_DAYS = 30;
/**
 * 15s reported GDELT as "unreachable" — but GDELT genuinely takes 11-16s under
 * load, so the checker was timing out and blaming the source. A health check
 * whose timeout is tighter than the real latency manufactures outages.
 */
const TIMEOUT_MS = 35000;
const CONCURRENCY = 12;

function allFeeds(): RssFeedEntry[] {
  return Object.values(RSS_FEED_CATALOG).flat();
}

/** Crude but dependency-free: pull <pubDate>/<updated>/<published> values. */
function newestItemAgeDays(xml: string): { items: number; ageDays: number | null } {
  const itemCount = (xml.match(/<item[\s>]/gi) ?? []).length + (xml.match(/<entry[\s>]/gi) ?? []).length;
  const dates = [
    ...(xml.match(/<pubDate>([^<]+)<\/pubDate>/gi) ?? []),
    ...(xml.match(/<updated>([^<]+)<\/updated>/gi) ?? []),
    ...(xml.match(/<published>([^<]+)<\/published>/gi) ?? []),
  ]
    .map((m) => m.replace(/<[^>]+>/g, '').trim())
    .map((d) => new Date(d).getTime())
    .filter((t) => Number.isFinite(t) && t > 0);

  if (dates.length === 0) return { items: itemCount, ageDays: null };
  const newest = Math.max(...dates);
  return { items: itemCount, ageDays: (Date.now() - newest) / 86400000 };
}

async function checkFeed(feed: RssFeedEntry): Promise<FeedHealth> {
  const base: Omit<FeedHealth, 'verdict' | 'items' | 'newestAgeDays'> = {
    name: feed.name,
    category: feed.category,
    language: feed.language,
    url: feed.url,
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(feed.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': CONNECTOR_UA,
        Accept: CONNECTOR_ACCEPT,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      return { ...base, verdict: 'http-error', items: 0, newestAgeDays: null, detail: `HTTP ${res.status}` };
    }
    const body = await res.text();
    if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(body)) {
      return { ...base, verdict: 'parse-error', items: 0, newestAgeDays: null, detail: 'not RSS/Atom' };
    }
    const { items, ageDays } = newestItemAgeDays(body);
    if (items === 0) return { ...base, verdict: 'empty', items: 0, newestAgeDays: ageDays };
    if (ageDays !== null && ageDays > STALE_AFTER_DAYS) {
      return { ...base, verdict: 'stale', items, newestAgeDays: ageDays };
    }
    return { ...base, verdict: 'ok', items, newestAgeDays: ageDays };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      verdict: 'unreachable',
      items: 0,
      newestAgeDays: null,
      detail: msg.slice(0, 60),
    };
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

/** Keyless non-RSS sources, checked with a representative request. */
async function checkKeylessApis(): Promise<Array<{ name: string; verdict: string; detail: string }>> {
  const targets: Array<{ name: string; url: string }> = [
    { name: 'GDELT (doc api)', url: 'https://api.gdeltproject.org/api/v2/doc/doc?query=nuclear%20sourcelang:eng&mode=artlist&format=json&maxrecords=1' },
    { name: 'Wikipedia (current events)', url: 'https://en.wikipedia.org/api/rest_v1/page/summary/Portal:Current_events' },
    { name: 'Bluesky AppView', url: 'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=nuclear&limit=1' },
    { name: '4chan (boards)', url: 'https://a.4cdn.org/boards.json' },
    { name: 'USGS earthquakes', url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson' },
    { name: 'Open-Meteo', url: 'https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m' },
    { name: 'CoinGecko', url: 'https://api.coingecko.com/api/v3/ping' },
  ];
  return mapLimit(targets, 4, async (t) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(t.url, {
        signal: controller.signal,
        headers: { 'User-Agent': CONNECTOR_UA },
      }).finally(() => clearTimeout(timer));
      return {
        name: t.name,
        verdict: res.ok ? 'ok' : 'http-error',
        detail: `HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        name: t.name,
        verdict: 'unreachable',
        detail: (err instanceof Error ? err.message : String(err)).slice(0, 50),
      };
    }
  });
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const feeds = allFeeds();

  console.log(`Checking ${feeds.length} RSS feeds (concurrency ${CONCURRENCY})...\n`);
  const results = await mapLimit(feeds, CONCURRENCY, checkFeed);

  if (args.has('--json')) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const byVerdict = new Map<Verdict, FeedHealth[]>();
  for (const r of results) {
    const list = byVerdict.get(r.verdict);
    if (list) list.push(r);
    else byVerdict.set(r.verdict, [r]);
  }

  const order: Verdict[] = ['unreachable', 'http-error', 'parse-error', 'empty', 'stale', 'ok'];
  console.log('RSS catalog');
  console.log('-'.repeat(60));
  for (const v of order) {
    const list = byVerdict.get(v) ?? [];
    console.log(`  ${v.padEnd(14)} ${String(list.length).padStart(4)}`);
  }

  const problems = order
    .filter((v) => v !== 'ok')
    .flatMap((v) => byVerdict.get(v) ?? []);
  if (problems.length > 0) {
    console.log(`\nProblem feeds (${problems.length}):`);
    for (const p of problems) {
      const age = p.newestAgeDays === null ? '' : ` newest=${p.newestAgeDays.toFixed(0)}d`;
      console.log(
        `  ${p.verdict.padEnd(13)} ${p.language.padEnd(3)} ${p.name.padEnd(30).slice(0, 30)} ${p.detail ?? ''}${age}`,
      );
    }
  }

  if (!args.has('--failing')) {
    console.log('\nKeyless non-RSS sources');
    console.log('-'.repeat(60));
    for (const a of await checkKeylessApis()) {
      console.log(`  ${a.verdict.padEnd(13)} ${a.name.padEnd(30)} ${a.detail}`);
    }
  }

  const ok = (byVerdict.get('ok') ?? []).length;
  console.log(
    `\n${ok}/${feeds.length} feeds healthy. ` +
      'Sources reported "live" at startup only have credentials — this is whether they answer.\n',
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
