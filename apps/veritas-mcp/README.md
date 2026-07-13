# Veritas MCP server

Exposes the Veritas narrative-intelligence backend as **agent-callable MCP tools**
(stdio). It's a thin, decoupled adapter over the REST API plus a Redis
subscription for the async scan lifecycle — an AI agent can initiate
investigations and read results the same way the dashboard does.

## Tools

| Tool | Purpose |
|---|---|
| `veritas_scan` | Start a scan (async — returns a `scanId` immediately) |
| `veritas_wait_for_scan` | Block until the scan is done, **driven by Redis events** (no polling) |
| `veritas_get_scan` | Scan status + per-connector breakdown |
| `veritas_get_scan_posts` | Raw posts a scan collected |
| `veritas_analyze_narratives` | Cluster + summarize; surfaces `embeddingSource`/`summarySource` provenance |
| `veritas_verify_claim` | Grounded fact-check; surfaces `analysisMode`/`groundingScore` |
| `veritas_coverage_probe` | When a topic was active over time (adaptive-window signal) |
| `veritas_recent_scans` | List recent scans |

Typical agent flow: `veritas_scan` → `veritas_wait_for_scan` → `veritas_analyze_narratives`.

### Honesty flags matter for agents

Tool responses deliberately surface the backend's honesty signals — `embeddingSource`
(`gemini` vs `hash-fallback`), `summarySource` (`llm` vs `first-post`), `analysisMode`
(`llm`/`heuristic`/`unavailable`), `groundingScore`, and `probed: false` on the
coverage probe. A consuming agent should treat fallback/heuristic/unavailable output
as **not authoritative** and abstain accordingly, rather than over-trusting it.

## Config (env)

| Var | Default | Notes |
|---|---|---|
| `VERITAS_API_URL` | `http://localhost:3000` | Veritas API base URL |
| `VERITAS_API_KEY` | — | Sent as `x-api-key`; required when the API enforces it |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | Must be the same Redis the API publishes to |
| `VERITAS_MCP_MAX_CALLS` | `200` | Per-process tool-call budget (guards agent runaway/cost) |

## Run

```bash
npx nx serve veritas-mcp
```

## Wire into an MCP host (e.g. Claude Desktop)

```json
{
  "mcpServers": {
    "veritas": {
      "command": "node",
      "args": [
        "-r", "@swc-node/register",
        "-r", "tsconfig-paths/register",
        "apps/veritas-mcp/src/main.ts"
      ],
      "cwd": "/absolute/path/to/veritas",
      "env": {
        "NODE_PATH": "/absolute/path/to/veritas/node_modules",
        "VERITAS_API_URL": "http://localhost:3000",
        "VERITAS_API_KEY": "…"
      }
    }
  }
}
```

The Veritas API (`nx serve api`) and Redis must be running.
