/**
 * Veritas MCP server.
 *
 * Exposes the Veritas narrative-intelligence backend as agent-callable tools
 * over MCP (stdio). It's a thin adapter over the hardened REST API plus a Redis
 * subscription for the async scan lifecycle:
 *
 *   veritas_scan        -> start a scan (async, returns immediately)
 *   veritas_wait_for_scan -> subscribe to Redis, return when the scan is done
 *   veritas_get_scan / _posts -> read what a scan collected
 *   veritas_analyze_narratives -> cluster + summarize (surfaces provenance flags)
 *   veritas_verify_claim -> grounded fact-check
 *   veritas_extract_failure_examples -> evidence-grounded failure corpus from a scan
 *   veritas_coverage_probe -> when was a topic active (adaptive-window signal)
 *   veritas_recent_scans -> list recent scans/investigations
 *
 * IMPORTANT: stdout is the MCP protocol channel — all logging goes to stderr.
 * Config via env: VERITAS_API_URL, VERITAS_API_KEY, REDIS_HOST, REDIS_PORT,
 * VERITAS_MCP_MAX_CALLS (per-process tool-call budget).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient, type RedisClientType } from 'redis';
import { z } from 'zod';

const API_URL = (process.env['VERITAS_API_URL'] ?? 'http://localhost:3000').replace(/\/$/, '');
const API_KEY = process.env['VERITAS_API_KEY'];
const REDIS_HOST = process.env['REDIS_HOST'] || 'localhost';
const REDIS_PORT = process.env['REDIS_PORT'] || '6379';
// Must match libs/ingestion ScanEventsService SCAN_EVENTS_CHANNEL.
const SCAN_EVENTS_CHANNEL = 'veritas:scan-events';
const MAX_CALLS = Number(process.env['VERITAS_MCP_MAX_CALLS'] ?? '200');

const log = (...args: unknown[]) => console.error('[veritas-mcp]', ...args);

// ---------------------------------------------------------------------------
// REST + call budget
// ---------------------------------------------------------------------------

let callCount = 0;
function budgetCheck(): void {
  if (++callCount > MAX_CALLS) {
    throw new Error(
      `Tool-call budget exhausted (${MAX_CALLS}). Raise VERITAS_MCP_MAX_CALLS if intended.`,
    );
  }
}

async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY;
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body != null ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`API ${init.method ?? 'GET'} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** MCP tool result from a JSON payload. */
function ok(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

// ---------------------------------------------------------------------------
// Redis-backed scan wait
// ---------------------------------------------------------------------------

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

async function waitForScan(scanId: string, timeoutMs: number): Promise<Record<string, unknown>> {
  // Fast path: already terminal?
  const initial = await api<Record<string, unknown>>(`/scan/${scanId}`);
  if (TERMINAL.has(String(initial['status']))) return initial;

  const sub: RedisClientType = createClient({ url: `redis://${REDIS_HOST}:${REDIS_PORT}` });
  sub.on('error', (e: Error) => log('wait redis error:', e.message));
  await sub.connect();

  try {
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for scan ${scanId}`));
      }, timeoutMs);

      const finish = (result: Record<string, unknown>) => {
        clearTimeout(timer);
        resolve(result);
      };

      // Any event for this scan → re-check its overall status.
      void sub.subscribe(SCAN_EVENTS_CHANNEL, (message: string) => {
        try {
          const evt = JSON.parse(message) as { scanId?: string };
          if (evt.scanId !== scanId) return;
          void api<Record<string, unknown>>(`/scan/${scanId}`).then((scan) => {
            if (TERMINAL.has(String(scan['status']))) finish(scan);
          });
        } catch {
          /* ignore malformed */
        }
      });
    });
  } finally {
    await sub.quit().catch(() => {});
  }
}

/** Compact scan summary (connector statuses + counts) for token economy. */
function summarizeScan(scan: Record<string, unknown>) {
  const connectors = (scan['connectors'] ?? {}) as Record<string, { status?: string }>;
  return {
    scanId: scan['id'] ?? scan['_id'],
    query: scan['query'],
    status: scan['status'],
    totalPosts: scan['totalPosts'],
    connectors: Object.fromEntries(
      Object.entries(connectors).map(([k, v]) => [k, v?.status ?? 'unknown']),
    ),
  };
}

// ---------------------------------------------------------------------------
// Server + tools
// ---------------------------------------------------------------------------

const server = new McpServer({ name: 'veritas', version: '1.0.0' });

server.registerTool(
  'veritas_scan',
  {
    description:
      'Start a narrative-intelligence scan (async — returns a scanId immediately). ' +
      'Follow with veritas_wait_for_scan, then veritas_analyze_narratives.',
    inputSchema: {
      query: z.string().describe('Topic, claim, or handle to investigate'),
      platforms: z
        .array(z.string())
        .optional()
        .describe('Subset of connectors (default: all live)'),
      timeRange: z
        .string()
        .optional()
        .describe("'7d' | '30d' | '24h' | absolute 'YYYY-MM-DD_YYYY-MM-DD' (default 7d)"),
      searchMode: z.enum(['topic', 'claim', 'person']).optional(),
      limit: z.number().optional(),
    },
  },
  async ({ query, platforms, timeRange, searchMode, limit }) => {
    budgetCheck();
    const res = await api<{ scanId: string }>('/scan', {
      method: 'POST',
      body: { query, platforms, timeRange, searchMode, limit },
    });
    return ok({ scanId: res.scanId, status: 'pending', next: 'veritas_wait_for_scan' });
  },
);

server.registerTool(
  'veritas_wait_for_scan',
  {
    description:
      'Block until a scan reaches a terminal state (completed/failed), driven by Redis events ' +
      '(no polling). Returns the connector breakdown + post count.',
    inputSchema: {
      scanId: z.string(),
      timeoutMs: z.number().optional().describe('Default 120000'),
    },
  },
  async ({ scanId, timeoutMs }) => {
    budgetCheck();
    const scan = await waitForScan(scanId, timeoutMs ?? 120_000);
    return ok(summarizeScan(scan));
  },
);

server.registerTool(
  'veritas_get_scan',
  {
    description: 'Get a scan status + per-connector breakdown + post count.',
    inputSchema: { scanId: z.string() },
  },
  async ({ scanId }) => {
    budgetCheck();
    return ok(summarizeScan(await api<Record<string, unknown>>(`/scan/${scanId}`)));
  },
);

server.registerTool(
  'veritas_get_scan_posts',
  {
    description: 'Get the raw posts a scan collected (text, platform, author handle, timestamp).',
    inputSchema: { scanId: z.string(), limit: z.number().optional() },
  },
  async ({ scanId, limit }) => {
    budgetCheck();
    const data = await api<{ posts?: Array<Record<string, unknown>> }>(`/scan/${scanId}/posts`);
    const posts = (data.posts ?? []).slice(0, limit ?? 50).map((p) => ({
      platform: p['platform'],
      author: p['authorHandle'] ?? p['authorName'],
      text: p['text'],
      timestamp: p['timestamp'],
      url: p['url'],
      media: p['media'],
    }));
    return ok({ count: posts.length, posts });
  },
);

server.registerTool(
  'veritas_analyze_narratives',
  {
    description:
      "Cluster a scan's posts into narratives (Gemini embeddings + LLM summaries). " +
      'Surfaces provenance flags: embeddingSource (gemini|hash-fallback) and summarySource ' +
      '(llm|first-post) — do NOT treat fallback output as fully semantic.',
    inputSchema: { scanId: z.string() },
  },
  async ({ scanId }) => {
    budgetCheck();
    const data = await api<{ posts?: Array<Record<string, unknown>> }>(`/scan/${scanId}/posts`);
    const payload = (data.posts ?? []).map((p) => ({
      text: p['text'],
      platform: p['platform'],
      authorName: p['authorName'],
      authorHandle: p['authorHandle'],
      timestamp: p['timestamp'],
      sentiment: p['sentiment'],
      engagement: p['engagement'],
    }));
    if (payload.length === 0) return ok({ narratives: [], note: 'no posts to analyze' });
    const result = await api<{
      narratives?: Array<Record<string, unknown>>;
      embeddingSource?: string;
      summarySource?: string;
      saturation?: { deduplicationRate?: number };
    }>('/narratives/analyze', { method: 'POST', body: { posts: payload } });
    return ok({
      embeddingSource: result.embeddingSource,
      summarySource: result.summarySource,
      deduplicationRate: result.saturation?.deduplicationRate,
      narratives: (result.narratives ?? []).map((n) => ({
        summary: n['summary'],
        postCount: (n['postIndices'] as unknown[] | undefined)?.length ?? 0,
        platforms: n['platforms'],
        trend: (n['velocity'] as { trend?: string } | undefined)?.trend,
        avgSentiment: n['avgSentiment'],
      })),
    });
  },
);

server.registerTool(
  'veritas_verify_claim',
  {
    description:
      'Fact-check a claim against real sources (Wikipedia/GDELT + on-chain/SEC/GitHub/Wayback). ' +
      'Returns status (verified|false|disputed|unverified), confidence, groundingScore, and ' +
      'analysisMode (llm|heuristic|unavailable — heuristic/unavailable are NOT authoritative).',
    inputSchema: { claim: z.string() },
  },
  async ({ claim }) => {
    budgetCheck();
    const result = await api<{ analysisMode?: string; results?: Array<Record<string, unknown>> }>(
      '/narratives/verify-claims',
      {
        method: 'POST',
        body: {
          claims: [
            {
              claim,
              type: 'factual',
              sources: [],
              firstSeen: new Date().toISOString(),
              frequency: 1,
              verifiability: 'verifiable',
            },
          ],
        },
      },
    );
    const r = result.results?.[0];
    return ok({
      analysisMode: result.analysisMode,
      status: r?.['status'],
      confidence: r?.['confidence'],
      groundingScore: r?.['groundingScore'],
      reasoning: r?.['reasoning'],
      sourcesChecked: r?.['sourcesChecked'],
    });
  },
);

server.registerTool(
  'veritas_extract_failure_examples',
  {
    description:
      'Extract concrete, documented failure examples about a subject (typically an AI ' +
      "model, e.g. 'Google Gemini') from a completed scan's posts. Each example cites a " +
      'verbatim excerpt from its source post, verified server-side — vague complaints are ' +
      'counted separately, never turned into examples. Returns provenance (platform, ' +
      'author, url, engagement) per example.',
    inputSchema: { scanId: z.string(), subject: z.string() },
  },
  async ({ scanId, subject }) => {
    budgetCheck();
    const data = await api<{ posts?: Array<Record<string, unknown>> }>(`/scan/${scanId}/posts`);
    const payload = (data.posts ?? []).map((p) => ({
      id: p['id'] ?? p['postId'] ?? '',
      text: p['text'],
      platform: p['platform'],
      authorName: p['authorName'],
      authorHandle: p['authorHandle'],
      timestamp: p['timestamp'],
      engagement: p['engagement'],
      url: p['url'],
      media: p['media'],
    }));
    if (payload.length === 0) return ok({ examples: [], note: 'no posts to extract from' });
    return ok(
      await api('/narratives/failure-examples', {
        method: 'POST',
        body: { subject, posts: payload },
      }),
    );
  },
);

server.registerTool(
  'veritas_web_search',
  {
    description:
      'General web + news search (keyless: DuckDuckGo + Google News RSS; Brave when ' +
      'configured). Results are provenance-tagged per provider. Use to ground a vague ' +
      'topic before spending a full multi-connector scan on it.',
    inputSchema: { query: z.string(), limit: z.number().optional() },
  },
  async ({ query, limit }) => {
    budgetCheck();
    return ok(
      await api(`/web/search?q=${encodeURIComponent(query)}&limit=${limit ?? 8}`),
    );
  },
);

server.registerTool(
  'veritas_refine_query',
  {
    description:
      'Turn a vague topic into sharper scan queries: web-searches the topic, then LLM ' +
      'extracts what it currently refers to, 3-5 refined query angles, and the central ' +
      "entities. analysisMode 'unavailable' means no LLM — raw web results only, " +
      'nothing fabricated. Feed refinedQueries into veritas_scan.',
    inputSchema: { query: z.string() },
  },
  async ({ query }) => {
    budgetCheck();
    return ok(await api(`/web/refine?q=${encodeURIComponent(query)}`));
  },
);

server.registerTool(
  'veritas_coverage_probe',
  {
    description:
      'Ask WHEN a topic was actually active over time (GDELT volume histogram). Use when a ' +
      'scan window is sparse — the suggestedWindow tells you where the story lives. ' +
      'probed=false means the signal was unavailable (do not infer activity).',
    inputSchema: { query: z.string(), timespan: z.string().optional() },
  },
  async ({ query, timespan }) => {
    budgetCheck();
    return ok(
      await api('/narratives/coverage-probe', { method: 'POST', body: { query, timespan } }),
    );
  },
);

server.registerTool(
  'veritas_recent_scans',
  {
    description: 'List recent scans (id, query, status, post count).',
    inputSchema: { limit: z.number().optional() },
  },
  async ({ limit }) => {
    budgetCheck();
    const scans = await api<Array<Record<string, unknown>>>(`/scan/recent?limit=${limit ?? 10}`);
    return ok((scans ?? []).map(summarizeScan));
  },
);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`ready — API ${API_URL}, redis ${REDIS_HOST}:${REDIS_PORT}, call budget ${MAX_CALLS}`);
}

main().catch((err) => {
  log('fatal:', err);
  process.exit(1);
});
