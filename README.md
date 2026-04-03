# Veritas Narrative Intelligence Platform

Track, analyze, and visualize how narratives emerge, evolve, and spread across digital platforms — using semantic analysis, graph intelligence, and evidence-based reasoning. No paid API keys required.

## What Veritas Does

- **Discovers narratives** across Twitter/X, Reddit, YouTube, Facebook, and RSS by clustering semantically similar content using Gemini embeddings
- **Investigates actors** with per-user timeline archaeology, cross-platform identity discovery (400+ networks via Sherlock), coordination detection, and cui bono analysis
- **Detects manipulation** through 17 classical propaganda techniques, claim verification against Wikipedia and GDELT, bot detection via graph analysis, and source credibility scoring
- **Tracks real-world impact** by correlating narratives with downstream signals from global news, financial markets, and economic indicators

## Key Features

### Narrative Intelligence
Gemini embeddings with agglomerative clustering, LLM-generated narrative summaries, velocity metrics, consensus deviation scoring, and cross-snapshot genealogy tracking.

### Deep Investigation
Per-user narrative archaeology with stance shift detection, cui bono analysis, coordination detection, and timeline fetching across Twitter and Reddit.

### Cross-Platform Discovery
Sherlock integration discovers user accounts across 400+ social networks from a single username.

### Propaganda Detection
Identifies 17 classical propaganda techniques, extracts claims, analyzes framing, and produces bounded-confidence manipulation assessments.

### Claim Verification
Cross-references claims against Wikipedia and GDELT evidence, then applies LLM reasoning to produce verification verdicts.

### Downstream Effects
Correlates narratives with real-world signals via 5 pluggable adapters (GDELT news, Yahoo Finance, World Bank, FRED economic data, LLM hypothesis). Generates transmission chain analysis and Mycelium visualization data.

### Monitoring & Alerting
Scheduled auto-rescans with 6 alert types: new narrative, velocity spike, sentiment reversal, coordination detected, new platform, volume surge. Configurable intervals with severity escalation.

### Source Credibility
5 heuristic signals plus 3 Memgraph graph signals (PageRank, betweenness centrality, community count). Bridge node detection. Graceful degradation without Memgraph.

### Bot Detection
Heterogeneous graph analysis (CO_TIMED, SIMILAR_CONTENT, CO_NARRATIVE edges) with temporal, behavioral, and structural pattern detection. Inspired by BotSim (AAAI 2025).

### Report Generation
LLM executive summaries with structured sections. Markdown and HTML export with XSS escaping.

### 7 D3 Visualizations
NarrativeFlow (branching narrative streams), RealityTunnel (deviation metrics), NarrativeMycelium (downstream impact), NetworkGraph (entity relationships), TemporalNarrative (timeline), NarrativeLandscape (topic space), EnhancedRealityTunnel (consensus/divergence).

### Entity Analysis, Genealogy & Comparison
Entity dossiers with sentiment timelines and co-occurrence networks. Cross-snapshot narrative evolution tracking. Narrative-vs-narrative, period-vs-period, and platform comparison.

## Quick Start

### Prerequisites

- Node.js 22+
- Docker (for MongoDB)
- yt-dlp (`pip install yt-dlp` or `brew install yt-dlp`) — for YouTube connector
- Sherlock (`pip install sherlock-project`) — for cross-platform identity discovery

### Setup

```bash
# Clone and install
git clone https://github.com/oneirocom/veritas.git
cd veritas
npm install

# Start MongoDB
npm run mongodb:up

# Create environment file
cp .env.example .env
# Edit .env — add your GEMINI_API_KEY (free tier is sufficient)

# Start the API (http://localhost:3000)
npx nx serve api

# In another terminal — start the client (http://localhost:4200)
npx nx serve veritas-client

# Or run both in parallel
npm run dev
```

The API serves Swagger docs at `http://localhost:3000/api` and a GraphQL playground at `http://localhost:3000/graphql`.

## Environment Variables

| Variable | Required | Free? | Purpose |
|----------|----------|-------|---------|
| `MONGODB_URI` | Yes | Yes (local or Atlas free tier) | Investigation, snapshot, and alert persistence |
| `GEMINI_API_KEY` | Yes (for LLM features) | Yes (generous free tier) | Embeddings, summaries, sentiment, propaganda analysis, cui bono, reports, hypothesis generation |
| `FRED_API_KEY` | Optional | Yes (free registration) | FRED economic data signals (Fed funds rate, VIX, jobless claims, etc.) |
| `TWITTER_COOKIES` | Optional | Free (your account) | Twitter/X search and timeline fetching |
| `TWITTER_USERNAME` / `TWITTER_PASSWORD` | Optional | Free | Alternative Twitter auth (instead of cookies) |
| `MEMGRAPH_URI` | Optional | Yes (local Docker) | Graph database for credibility scoring and bot detection |
| `REDIS_URI` | Optional | Yes (local Docker) | Caching layer |
| `JINA_API_KEY` | Optional | Yes (free tier) | Higher rate limits for Jina Reader (Facebook connector) |
| `YT_DLP_PATH` | Optional | N/A | Custom path to yt-dlp binary |

No paid API keys are required anywhere in the system.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | NX 22 |
| Backend | NestJS 11, TypeScript (strict mode) |
| Frontend | Next.js 16, React 19, Tailwind CSS |
| Primary Database | MongoDB (Mongoose) |
| Graph Database | Memgraph (optional, neo4j-driver) |
| LLM | Google Gemini (`@google/generative-ai`) |
| Visualizations | D3.js v7 |
| Testing | Jest (294 tests across 23 suites) |
| Linting | Biome |
| Build | Webpack (API), Next.js (client) |

## Architecture Overview

Veritas is an NX monorepo with 2 applications and 7 libraries. Data flows from platform connectors through a classification pipeline into analysis services, with results persisted as investigation snapshots and rendered through D3 visualizations.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture document including data flow diagrams, service descriptions, and extension guides.

## API Endpoints

### Search & Ingestion (`/narratives`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/narratives/search` | Search all connectors, auto-save investigation |
| POST | `/narratives/ingest` | Single post ingestion |
| POST | `/narratives/ingest-batch` | Batch ingestion |

### Narrative Analysis (`/narratives`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/narratives/analyze` | Semantic clustering + summaries + velocity |
| POST | `/narratives/deviations` | Deviation metrics + reality tunnel data |
| POST | `/narratives/report` | Generate markdown/HTML report |
| POST | `/narratives/propaganda-analysis` | Propaganda technique detection |
| POST | `/narratives/entities` | Entity dossiers + co-occurrence network |
| POST | `/narratives/genealogy` | Cross-snapshot narrative evolution |
| POST | `/narratives/compare` | Narrative/period/platform comparison |
| POST | `/narratives/downstream-effects` | Signal correlation + mycelium data |

### Investigations (`/investigations`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/investigations` | List all investigations |
| GET | `/investigations/:id` | Detail + latest snapshot |
| PUT | `/investigations/:id` | Update name/status/settings |
| DELETE | `/investigations/:id` | Archive investigation |
| GET | `/investigations/:id/snapshots` | Snapshot history |
| GET | `/investigations/:id/snapshots/:snapshotId` | Specific snapshot |

### Deep Investigation (`/investigate`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/investigate` | Per-user timeline + Sherlock cross-platform + deep analysis |

### Monitoring (`/monitor`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/monitor/alerts` | List alerts |
| GET | `/monitor/alerts/count` | Unread alert count |
| PUT | `/monitor/alerts/:id/read` | Mark alert as read |
| PUT | `/monitor/alerts/read-all` | Mark all alerts as read |
| GET | `/monitor/config/:investigationId` | Get monitor config |
| PUT | `/monitor/config/:investigationId` | Update monitor config |
| POST | `/monitor/refresh/:investigationId` | Manual re-scan + alert generation |

## Testing

```bash
# Run all tests
npm test

# Run tests for a specific library
npx nx test analysis      # 276 tests — all analysis services
npx nx test api           # 18 tests — controllers + app-level services

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

**Test summary**: 294 tests across 23 suites (19 in libs/analysis, 4 in apps/api).

## Project Structure

```
veritas/
  apps/
    api/                              # NestJS backend — REST + GraphQL
      src/app/
        controllers/                  # InvestigationController, MonitorController
        services/                     # RefreshService, SchedulerService, LoggingService
        middleware/                    # LoggingMiddleware
    veritas-client/                   # Next.js frontend
      app/                            # Pages: home, results, monitor, compare, demos
      components/                     # Panels, visualizations, nav, modals
      lib/                            # API client, transforms, scan history

  libs/
    analysis/                         # Core analysis engine (12 services)
      services/
        narrative-analysis.service    # Embeddings, clustering, summaries, velocity
        deep-investigation.service    # Per-user archaeology, cui bono, coordination
        propaganda.service            # 17 techniques, claims, framing
        claim-verification.service    # Wikipedia + GDELT evidence, LLM reasoning
        downstream-effects.service    # Signal adapters, correlation, transmission chains
        deviation.service             # Consensus deviation, reality tunnel data
        entity-analysis.service       # Dossiers, co-occurrence networks
        genealogy.service             # Cross-snapshot narrative evolution
        comparison.service            # Narrative/period/platform comparison
        monitor.service               # Snapshot comparison, alert generation
        report.service                # LLM executive summary, markdown/HTML
        cross-platform-identity       # Sherlock 400+ network discovery
        source-credibility.service    # Heuristic + graph signals
        graph-bot-detection.service   # Heterogeneous graph analysis
        graph-database.service        # Memgraph wrapper with graceful degradation
      services/signal-adapters/       # Pluggable adapter pattern
        gdelt.adapter                 # Global news with tone scoring
        yahoo-finance.adapter         # Market indices + commodities
        worldbank.adapter             # Economic indicators for 10 economies
        fred.adapter                  # 8 high-frequency US economic series
        llm-hypothesis.adapter        # Gemini-generated downstream hypotheses

    ingestion/                        # Data connectors + persistence
      connectors/                     # TwitterFree, RedditFree, YouTubeFree, FacebookJina, RSS
      repositories/                   # InvestigationRepository, AlertRepository
      controllers/                    # InvestigationController (CRUD + search)

    content-classification/           # NLP pipeline
      services/                       # Topic extraction, sentiment, entities, embeddings

    database/                         # Multi-database adapter (MongoDB, Memgraph, Redis)
    visualization/                    # React/D3.js visualization components (7 visualizations)
    sources/                          # Source management and credibility
    shared/                           # Shared types and utilities
```

## License

MIT License. See [LICENSE](LICENSE).

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Run tests (`npm test`) and linting (`npm run biome:check`)
4. Commit with descriptive messages
5. Open a pull request against `main`

All code must pass Biome linting and existing tests. TypeScript strict mode is enforced across the monorepo.
