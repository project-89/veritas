# Veritas — Narrative Intelligence Platform

Veritas tracks how narratives emerge, diverge, and travel across the open web. It is a free, open-source OSINT platform built on a single principle: **the job is to see who is saying what — not to decide what is true.** Provenance is treated as a structural fact (who controls an outlet, who funds it, who it addresses); allegiance is never assumed. Where the platform makes a factual claim, it grounds it in evidence and shows its work; where it can't, it abstains and says so.

## What Veritas does

- **Surfaces narrative divergence** — clusters the same real-world story across outlets and lays its coverage side by side by *perspective class* (state-media domestic, state-media international, public broadcaster, independent). The gap between how a state tells its own population vs. the world vs. how independents report the same event is the signal.
- **Ingests a live global event feed** — a continuously-polled worldwide stream from 8 signal sources (earthquakes, disasters, weather, conflict, markets, news) and ~160 curated RSS feeds, rendered on an interactive globe and a NERV-style tactical map with per-zone **surge detection** (a zone flagged only when it beats its *own* baseline, not just absolute volume).
- **Runs targeted scans** across 11 platform connectors, with strict term matching and an LLM **query-refinement** layer that turns a vague topic into sharp, vocabulary-matched queries grounded in live web results.
- **Extracts evidence-grounded examples** — e.g. a provenance-tracked corpus of real-world AI-model failures. Every entry cites a verbatim excerpt from its source post (mechanically verified) and survives an adversarial skeptic pass that rejects non-interactions.
- **Investigates actors** — per-user timelines across connectors, cross-platform identity discovery (Sherlock, 400+ networks), coordination and bot detection, and cui-bono reasoning.
- **Detects manipulation** — 17 propaganda techniques (technique-based, never actor-based), evidence-based claim verification (on-chain / SEC / GitHub / Wayback / Wikipedia), and platform-credibility scoring.
- **Translates and preserves** — non-English state media (Russian, Persian) is machine-translated at ingest with the original always kept alongside; an append-only history captures editorial edits (stealth retitles) and a no-TTL archive retains framing data for longitudinal analysis.
- **Is agent-operable** — the whole pipeline is exposed over MCP, so an external agent can scan, analyze, verify, refine queries, and extract examples autonomously.

## Design principles

- **Honest degradation.** Every LLM-backed stage has a defined fallback and says which mode produced a result (semantic vs. hash-fallback embeddings, llm-grounded vs. heuristic verification). Missing a key degrades a feature visibly rather than faking output.
- **Provenance over opinion.** The ownership taxonomy (`independent` / `public-broadcaster` / `state-media` / `state-official`) is structural and **bloc-agnostic** — the same rule applied to Washington, Brussels, Moscow, and Beijing. A US government feed is tagged `state-official` exactly as a Russian ministry feed is.
- **No drift.** The UI builds its capability displays (connectors, feed stats, signal sources, LLM status) from a live `/capabilities` endpoint, never hardcoded lists — a connector that goes offline shows as offline everywhere, automatically.
- **Grounded or silent.** Claims and extracted examples must cite verifiable evidence; unverifiable ones are dropped and *counted*, so outputs state what they filtered rather than silently shrinking.

## Architecture

```
11 platform connectors ─┐
8 signal sources ────────┼─► BullMQ scan queue ─► MongoDB (live + append-only history/archive)
~160 RSS feeds ──────────┘        │
                                  ▼
        Analysis (libs/analysis): Gemini semantic clustering · claim verification ·
        propaganda · deep investigation · divergence clustering · failure extraction ·
        translation · surge aggregation
                                  │
        Memgraph (MAGE) social graph ── Redis (queues + scan events)
                                  ▼
   NestJS API (apps/api) ─► Next.js NERV dashboard (apps/veritas-client)
                         └► MCP server (apps/veritas-mcp) for agent control
```

**Monorepo (Nx):** `apps/{api, veritas-client, veritas-mcp}` · `libs/{analysis, ingestion, database, shared, content-classification, visualization}` · `packages/atlas-plugin`.

## Data sources

### Platform connectors (11 registered — see `GET /capabilities` for live status)

| Platform | Method | Auth |
|----------|--------|------|
| Twitter/X | `@haruhunab1320/twitter-scraper` | Cookies or login |
| Bluesky | AT Protocol AppView API | None |
| 4chan | Public JSON API | None |
| YouTube | yt-dlp CLI (+ transcripts) | None |
| Farcaster | Neynar API v2 | Free key |
| Telegram | t.me web-preview scrape | None |
| Wikipedia | Current Events portal API | None |
| GDELT | GDELT DOC 2.0 API | None |
| RSS / News | ~160 curated feeds | None |
| Reddit | Application-only OAuth | `REDDIT_CLIENT_ID` + `SECRET` |
| Facebook | Page monitoring via Jina Reader | `FACEBOOK_PAGE_URLS` |

### RSS catalog (~160 feeds, 89 tier-1)

Independent, plus **19 public broadcasters** (BBC, DW, France 24, NPR, Al Jazeera…) and **14 state-media** outlets (Xinhua/CGTN, RT/Sputnik/TASS, Press TV, Anadolu, teleSUR) tagged with ownership and audience. **9 domestic-audience feeds** in Russian and Persian (RIA Novosti, TASS-ru, Lenta, Rossiyskaya Gazeta, IRNA) are machine-translated at ingest, originals preserved.

### Global-event signal sources (8, keyless)

USGS (earthquakes) · GDACS (disasters) · NASA EONET (natural events) · NOAA/NWS (weather alerts) · ACLED (conflict) · GDELT (news) · CoinGecko (markets) · RSS tier-1.

### Evidence & correlation adapters

Claim verification grounds against Etherscan, DexScreener, GitHub, SEC EDGAR, Wayback Machine, and Wikipedia. Downstream-effects correlation adds Yahoo Finance, World Bank, and FRED.

### Web search (keyless)

DuckDuckGo HTML + Google News RSS for query enrichment; Brave Search API used automatically when `BRAVE_SEARCH_API_KEY` is set.

## Quick start

### Prerequisites
- Node.js 18+, MongoDB, Redis
- Python 3 (for yt-dlp, sherlock)
- Optional: Memgraph with MAGE for graph algorithms

```bash
npm install
pip install yt-dlp sherlock-project

cp .env.example .env          # edit — minimum: GEMINI_API_KEY, MONGODB_URI

docker compose -f docker-compose.dev.yml up -d   # MongoDB, Redis, Memgraph (MAGE)
npx nx serve api                                  # backend  → :3000
npx nx serve veritas-client                       # frontend → :4200
```

### Environment variables

**Required**
```
GEMINI_API_KEY=          # analysis (clustering, verification, translation, refinement)
MONGODB_URI=mongodb://localhost:27017
REDIS_HOST=localhost
REDIS_PORT=6379
```

Without `GEMINI_API_KEY` the app still runs — analysis degrades to heuristics/abstention and says so.

**Optional (each unlocks a capability, surfaced in `/capabilities` and the Monitor panel)**
```
TWITTER_COOKIES=         # or TWITTER_USERNAME/PASSWORD/EMAIL — Twitter/X
REDDIT_CLIENT_ID=        # + REDDIT_CLIENT_SECRET — Reddit (free script app)
NEYNAR_API_KEY=          # Farcaster
FACEBOOK_PAGE_URLS=      # Facebook page monitoring
FRED_API_KEY=            # Federal Reserve data
ETHERSCAN_API_KEY=       # on-chain evidence
GITHUB_TOKEN=            # GitHub evidence (higher rate limit)
BRAVE_SEARCH_API_KEY=    # upgrades web search ranking
MEMGRAPH_HOST=           # graph database
```

## Dashboard

- **Command / Tactical** — home dashboard and NERV hex tactical map (category hexes, surge rings, severity radar, region ticker).
- **World Map** — interactive 3D globe of the live global event feed with category/severity filters and search fly-to.
- **Perspectives** — narrative-divergence view: master-detail list of the most-contested stories over a selectable window (24h/48h/7d), each split by perspective class.
- **Search** — capability-driven scan builder with query refinement.
- **Monitor** — investigations, alerts, and a live system-capabilities panel.
- **Atlas** — reusable reasoning-lens extraction (plugin).

## MCP tools

`veritas_scan` · `veritas_wait_for_scan` · `veritas_get_scan(_posts)` · `veritas_analyze_narratives` · `veritas_verify_claim` · `veritas_extract_failure_examples` · `veritas_web_search` · `veritas_refine_query` · `veritas_coverage_probe` · `veritas_recent_scans`.

## Testing

```bash
npx nx test analysis      # ~560 tests
npx nx test ingestion     # ~390 tests
npx nx test api
npx tsc --noEmit          # type check
```

## License

See repository license.
