# Veritas Architecture

## System Overview

```
                                          External Services
                                    ┌─────────────────────────┐
                                    │  Gemini API (embeddings, │
                                    │  summaries, analysis)    │
                                    │  Sherlock (subprocess)   │
                                    │  yt-dlp (subprocess)     │
                                    └────────────┬────────────┘
                                                 │
  ┌──────────┐    ┌──────────────┐    ┌──────────┴──────────┐    ┌────────────┐
  │          │    │              │    │                     │    │            │
  │  Next.js ├───►│   NestJS     ├───►│   libs/analysis     │    │  MongoDB   │
  │  Client  │◄───┤   API        │◄───┤   libs/content-cls  │───►│  Memgraph  │
  │          │    │              │    │   libs/ingestion     │    │  (optional)│
  └──────────┘    └──────┬───────┘    └──────────┬──────────┘    └────────────┘
                         │                       │
                         │              ┌────────┴────────┐
                         │              │   Connectors     │
                         │              ├──────────────────┤
                         │              │ Twitter (scraper) │
                         │              │ Reddit (JSON API) │
                         │              │ YouTube (yt-dlp)  │
                         │              │ Facebook (Jina)   │
                         │              │ RSS (rss-parser)  │
                         │              └──────────────────┘
                         │
                ┌────────┴────────┐
                │ Signal Adapters  │
                ├──────────────────┤
                │ GDELT (news)     │
                │ Yahoo Finance    │
                │ World Bank       │
                │ FRED (economic)  │
                │ LLM Hypothesis   │
                └──────────────────┘
```

## Monorepo Structure

| Library | Purpose |
|---------|---------|
| `libs/analysis` | Core analysis engine. 12 services covering narrative clustering, investigation, propaganda detection, claim verification, downstream effects, deviation metrics, entity analysis, genealogy, comparison, monitoring, reporting, and cross-platform identity. Also contains signal adapters, graph database, source credibility, and bot detection services. |
| `libs/ingestion` | Data connectors (5 platform connectors), investigation/alert repositories (MongoDB), and the ingestion controller handling search, single-post ingest, and batch ingest. |
| `libs/content-classification` | NLP pipeline — topic extraction, sentiment analysis, entity recognition, and Gemini embedding generation. Runs as transform-on-ingest. |
| `libs/database` | Multi-database adapter with a provider pattern supporting MongoDB, Memgraph, and Redis. Used via `DatabaseModule.register()`. |
| `libs/visualization` | 7 React/D3.js visualization components: NarrativeFlow, RealityTunnel, NarrativeMycelium, NetworkGraph, TemporalNarrative, NarrativeLandscape, EnhancedRealityTunnel. |
| `libs/sources` | Source management and credibility tracking. |
| `libs/shared` | Shared TypeScript types and utility functions used across all libraries. |

| Application | Purpose |
|-------------|---------|
| `apps/api` | NestJS backend. Wires all library modules together. Adds app-level controllers (InvestigationController for deep investigation orchestration, MonitorController for alerts), SchedulerService for auto-monitoring, RefreshService for re-scan pipeline, and LoggingMiddleware. Serves REST + GraphQL. |
| `apps/veritas-client` | Next.js 16 frontend. Pages: Home (search + investigation list), Results (analytical workspace), Monitor (alerts + refresh), Compare (side-by-side analysis). Demo pages for each visualization. |

## Data Flow

### Search to Visualization Pipeline

```
User enters search query
        │
        ▼
POST /narratives/search
        │
        ▼
┌─────────────────────┐
│  Platform Connectors │  Twitter, Reddit, YouTube, Facebook, RSS
│  (parallel fetch)    │  Each returns raw posts with platform metadata
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Transform-on-Ingest │  Content classification runs immediately:
│  (content-cls lib)   │  - Topic extraction
│                      │  - Sentiment analysis (AFINN + LLM)
│                      │  - Entity recognition
│                      │  - Gemini embedding generation
│                      │  - PII removal / anonymization
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Investigation       │  Create/update investigation in MongoDB
│  Persistence         │  Store classified posts as a snapshot
└─────────┬───────────┘
          │
          ▼
POST /narratives/analyze (client calls after search completes)
          │
          ▼
┌─────────────────────┐
│  Narrative Analysis  │  1. Generate Gemini embeddings for all posts
│  Service             │  2. Compute pairwise cosine similarity
│                      │  3. Agglomerative clustering (threshold-based)
│                      │  4. LLM summary per cluster (= narrative)
│                      │  5. Velocity metrics (posts/hour acceleration)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Client Renders      │  NarrativeFlow hero visualization
│                      │  Sidebar: narrative list + detail panel
│                      │  Tabs: RealityTunnel, Entities, Downstream,
│                      │        Propaganda, Investigation, Genealogy
└─────────────────────┘
```

### Deep Investigation Flow

```
POST /investigate { usernames, investigationId }
        │
        ├──► Twitter timeline fetch (per user)
        ├──► Reddit timeline fetch (per user)
        └──► Sherlock cross-platform discovery (subprocess)
                │
                ▼
        Per-user narrative archaeology:
        - Stance shift detection over time
        - Topic consistency analysis
        - Posting pattern analysis
                │
                ▼
        Cui bono analysis (LLM reasoning):
        - Who benefits from this narrative?
        - Financial, political, ideological motivations
                │
                ▼
        Coordination detection:
        - Temporal clustering of posts
        - Content similarity across users
        - Synchronized behavior patterns
                │
                ▼
        Source credibility + bot probability scoring
```

### Monitoring Flow

```
SchedulerService (checks every 60s)
        │
        ▼
  For each due investigation:
        │
        ▼
  RefreshService.refresh(investigationId)
        │
        ├──► Re-run search with original query
        ├──► Re-run classification pipeline
        ├──► Create new snapshot
        └──► MonitorService.compareSnapshots()
                │
                ▼
          Generate alerts (6 types):
          - New narrative emerged
          - Velocity spike detected
          - Sentiment reversal
          - Coordination detected
          - New platform appeared
          - Volume surge
                │
                ▼
          Severity escalation + persistence
```

## Analysis Pipeline

### NarrativeAnalysisService

The core clustering engine. Takes classified posts and produces narrative groupings.

1. **Embedding generation** — calls Gemini `embedding-001` for each post's text content
2. **Similarity matrix** — pairwise cosine similarity between all embeddings
3. **Agglomerative clustering** — bottom-up merging with a similarity threshold (default 0.7). Posts below threshold become singleton narratives
4. **LLM summarization** — Gemini generates a title and summary for each cluster based on representative posts
5. **Velocity metrics** — calculates posts/hour rate and acceleration to identify fast-moving narratives

### DeepInvestigationService

Per-user deep dive with cross-platform correlation.

- Fetches user timelines from Twitter and Reddit connectors
- Runs Sherlock as a subprocess to discover accounts on 400+ platforms
- Analyzes each user's posting history for stance shifts, topic consistency
- LLM-powered cui bono analysis identifies who benefits from the narrative
- Coordination detection finds synchronized posting patterns across users

### PropagandaAnalysisService

Detects 17 classical propaganda techniques (bandwagon, fear appeal, loaded language, false dichotomy, etc.). For each post:

- **Technique detection** — LLM identifies which techniques are present with confidence scores
- **Claim extraction** — pulls out verifiable factual claims
- **Framing analysis** — identifies the narrative frame and rhetorical strategy
- **Manipulation assessment** — bounded-confidence overall score

### ClaimVerificationService

Evidence-based fact-checking pipeline:

1. Extract claims from narrative content
2. Search Wikipedia for relevant evidence articles
3. Query GDELT for corroborating/contradicting news coverage
4. LLM reasoning step — weighs evidence, produces a verification verdict with confidence

### DownstreamEffectsService

Correlates narratives with real-world signals using pluggable adapters:

1. Each adapter fetches time-series data for the narrative's timeframe
2. Service correlates narrative volume/velocity with signal movements
3. Generates transmission chain hypotheses (narrative -> media coverage -> market reaction)
4. Produces Mycelium visualization data (nodes = signals, edges = correlations)

### DeviationService

Measures how far each post/narrative deviates from consensus:

- Computes consensus centroid embedding from all posts
- Calculates cosine distance from each post to centroid
- Produces RealityTunnel visualization data (deviation over time)
- EnhancedTunnel adds consensus vs. divergence bands

### EntityAnalysisService

- Extracts named entities (people, organizations, locations) across all posts
- Builds entity dossiers with sentiment timelines
- Generates co-occurrence network (which entities appear together)

### NarrativeGenealogyService

Tracks narrative evolution across investigation snapshots:

- Compares narrative embeddings between snapshots
- Similarity > 0.7 = same narrative (continued)
- Similarity 0.4-0.7 = branch (narrative evolved)
- Similarity < 0.4 = new narrative or died

### ComparisonService

Three comparison modes:

- **Narrative vs. Narrative** — side-by-side sentiment, velocity, entity overlap
- **Period vs. Period** — same investigation across two time windows
- **Platform vs. Platform** — how the same narrative differs across Twitter, Reddit, etc.

## Signal Adapter Architecture

Signal adapters follow a pluggable interface pattern defined in `signal-adapter.interface.ts`:

```typescript
interface SignalAdapter {
  name: string;
  fetchSignals(query: string, timeRange: TimeRange): Promise<Signal[]>;
}
```

### Existing Adapters

| Adapter | Source | API Key | Signals |
|---------|--------|---------|---------|
| `GdeltAdapter` | GDELT Global News API | None | News articles with tone scoring, 250+ countries |
| `YahooFinanceAdapter` | Yahoo Charts API | None | S&P 500, Dow, Oil, Gold, Bitcoin — flags >2% daily moves |
| `WorldBankAdapter` | World Bank Open Data | None | Inflation, GDP growth, unemployment for 10 economies |
| `FredAdapter` | FRED API | `FRED_API_KEY` (free) | Fed funds rate, jobless claims, treasury spread, VIX, CPI, unemployment — 8 series |
| `LlmHypothesisAdapter` | Gemini | `GEMINI_API_KEY` | Hypothesizes downstream effects based on narrative content |

### Adding a New Adapter

1. Create `libs/analysis/src/lib/services/signal-adapters/my-adapter.ts`
2. Implement the `SignalAdapter` interface
3. Register in the adapter index (`signal-adapters/index.ts`)
4. The `DownstreamEffectsService` auto-discovers registered adapters

## Graph Database (Memgraph)

Memgraph is optional. When available, it provides enhanced credibility and bot detection signals. When unavailable, these services degrade gracefully to heuristic-only scoring.

### What's Stored

- **Author nodes** — usernames with posting metadata
- **Content nodes** — posts with embeddings and classification data
- **POSTED edges** — author -> content
- **CO_TIMED edges** — posts within temporal proximity
- **SIMILAR_CONTENT edges** — posts above embedding similarity threshold
- **CO_NARRATIVE edges** — posts in the same narrative cluster

### Credibility Scoring (SourceCredibilityService)

5 heuristic signals (account age, posting regularity, content diversity, engagement ratios, platform verification) plus 3 graph signals when Memgraph is available:

- **PageRank** — influence within the interaction graph
- **Betweenness centrality** — bridge node detection
- **Community count** — number of distinct communities reached

### Bot Detection (GraphBotDetectionService)

Builds a heterogeneous graph from CO_TIMED, SIMILAR_CONTENT, and CO_NARRATIVE edges, then analyzes:

- **Temporal patterns** — unnaturally regular posting intervals
- **Behavioral signals** — content repetition, engagement anomalies
- **Structural patterns** — star topology (one hub, many spokes), chain patterns (relay amplification), clique patterns (coordinated groups)

Inspired by BotSim (AAAI 2025) heterogeneous graph approach.

## Persistence Model

```
Investigation
  ├── id, name, query, status, settings
  ├── createdAt, updatedAt
  └── Snapshots[]
        ├── id, investigationId, timestamp
        ├── posts[] (classified content)
        ├── narratives[] (clustering results)
        ├── metadata (post count, platform breakdown)
        └── analysisResults (cached analysis outputs)

MonitorConfig
  ├── investigationId
  ├── enabled, intervalMinutes
  ├── alertTypes[] (which alert types are active)
  └── lastRunAt

Alert
  ├── investigationId, type, severity
  ├── message, details
  ├── read (boolean)
  └── createdAt
```

Investigations are the top-level entity. Each search or refresh creates a new Snapshot. Analysis results are cached on the snapshot to avoid redundant LLM calls.

## Monitoring System

### SchedulerService

Runs a 60-second interval check. For each investigation with monitoring enabled:

- Checks if `lastRunAt + intervalMinutes` has elapsed
- Invokes `RefreshService.refresh()` with a concurrency guard (one refresh at a time per investigation)
- Errors are isolated per investigation — one failure doesn't block others

### RefreshService

Encapsulates the full re-scan pipeline:

1. Re-run the original search query through all connectors
2. Classify new posts through the content-classification pipeline
3. Create a new snapshot
4. Call `MonitorService.compareSnapshots(previousSnapshot, newSnapshot)`

### Alert Types

| Type | Trigger |
|------|---------|
| `new_narrative` | Narrative cluster in new snapshot with no >0.7 match in previous |
| `velocity_spike` | Narrative velocity exceeds 2x the previous snapshot's rate |
| `sentiment_reversal` | Dominant sentiment flips (positive -> negative or vice versa) |
| `coordination_detected` | Temporal + content similarity patterns exceed threshold |
| `new_platform` | Posts from a platform not seen in previous snapshot |
| `volume_surge` | Total post count increases by >50% |

## Frontend Architecture

### Pages

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Home | Search bar with connector config, server-rendered investigation list with rename/archive |
| `/results` | Results | Analytical workspace: NarrativeFlow hero viz, narrative sidebar, tabbed detail panel |
| `/monitor` | Monitor | Investigation grid with alert feed, refresh buttons, auto-monitor toggle + interval config |
| `/compare` | Compare | Side-by-side narrative/period/platform comparison |
| `/demos/*` | Demos | Individual demo pages for each visualization component |

### Results Page Structure

```
┌─────────────────────────────────────────────────┐
│  NavBar (Veritas | Monitor [badge] | Compare)   │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │          NarrativeFlow (hero D3)        │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  ┌──────────┐  ┌───────────────────────────┐    │
│  │ Narrative │  │  Detail Panel             │    │
│  │ Sidebar   │  │  ┌─────────────────────┐  │    │
│  │           │  │  │ Tabs:               │  │    │
│  │ - Cluster │  │  │  Overview           │  │    │
│  │ - Cluster │  │  │  RealityTunnel      │  │    │
│  │ - Cluster │  │  │  Entities           │  │    │
│  │           │  │  │  Downstream/Mycelium│  │    │
│  │           │  │  │  Propaganda         │  │    │
│  │           │  │  │  Investigation      │  │    │
│  │           │  │  │  Claims             │  │    │
│  │           │  │  │  Genealogy          │  │    │
│  │           │  │  └─────────────────────┘  │    │
│  └──────────┘  └───────────────────────────┘    │
│                                                 │
│  [Generate Report]                              │
└─────────────────────────────────────────────────┘
```

### Component Hierarchy

- `NavBar` — global navigation with unread alert badge
- `SearchConfig` — connector selection and query configuration
- `NarrativeFlow` — D3 branching stream visualization (hero component)
- `InvestigationPanel` — origin analysis, cui bono, coordination, user cards with credibility/bot badges
- `PropagandaAnalysisPanel` — technique breakdown, claims, frames, assessment
- `ClaimVerificationPanel` — evidence display, verification verdicts
- `EntityPanel` — dossiers, co-occurrence network
- `MyceliumPanel` — downstream effects visualization + transmission chain cards
- `GenealogyPanel` — cross-snapshot evolution timeline
- `ReportModal` — markdown/HTML preview and download

### Visualization Components (libs/visualization)

All built with React + D3.js, accepting typed props:

| Component | Data Source | Visualization |
|-----------|-----------|---------------|
| `NarrativeFlow` | Clustering results | Branching stream diagram showing narrative clusters over time |
| `RealityTunnelVisualization` | Deviation metrics | Tunnel showing consensus vs. divergent posts |
| `EnhancedRealityTunnel` | Enhanced deviation data | Consensus/divergence bands with drill-down |
| `NarrativeMycelium` | Downstream effects | Organic network showing narrative-to-signal correlations |
| `NetworkGraph` | Entity co-occurrence | Force-directed graph of entity relationships |
| `TemporalNarrativeVisualization` | Time-series data | Timeline showing narrative volume and events |
| `NarrativeLandscape` | Embedding projections | 2D topic space showing narrative positions |

## Security & Privacy

### Transform-on-Ingest

Content is classified and anonymized at ingestion time:

- Author identifiers are hashed — no raw usernames stored in post content
- PII (emails, phone numbers) is stripped during classification
- Only derived insights (sentiment, topics, entities, embeddings) are persisted
- Raw platform data is not retained after classification

### Evidence-First Principles

- All analysis outputs include the evidence chain that produced them
- Claim verification shows source articles and reasoning steps
- Propaganda detection includes confidence scores and technique explanations
- No assertions without traceable supporting data

### XSS Protection

Report generation (markdown/HTML export) applies XSS escaping to all user-derived content before rendering.

## External Dependencies

| Dependency | Type | Required | Installation |
|-----------|------|----------|-------------|
| MongoDB | Database | Yes | `npm run mongodb:up` (Docker) or MongoDB Atlas free tier |
| Memgraph | Graph DB | No | `docker run memgraph/memgraph` — enhances credibility + bot detection |
| Sherlock | CLI tool | No | `pip install sherlock-project` — required for cross-platform identity discovery |
| yt-dlp | CLI tool | No | `pip install yt-dlp` or `brew install yt-dlp` — required for YouTube connector |
| ffprobe | CLI tool | No | Part of ffmpeg (`brew install ffmpeg`) — used by yt-dlp for media processing |
| Gemini API | Cloud API | Yes* | Free tier at `https://aistudio.google.com/apikey` |

*Gemini is required for LLM-powered features (embeddings, summaries, propaganda analysis, claim verification, reports). Basic search and ingestion work without it.
