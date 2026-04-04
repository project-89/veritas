# Veritas Architecture

## Overview

Veritas is a narrative intelligence platform that tracks how narratives emerge, evolve, and impact the real world across social media platforms. Built as a NERV-themed command center.

**Stack:** NestJS (API) + Next.js 14 (client) + MongoDB + Memgraph + BullMQ/Redis + Gemini AI

## Data Flow

```
Search → Scan (BullMQ per-connector) → Posts (MongoDB)
  → Narrative Clustering (Gemini embeddings + agglomerative)
  → Propaganda Detection → Claim Verification → Entity Analysis
  → Downstream Effects (8 signal adapters + causal reasoning)
  → Investigation (deep user profiling + bot detection + social graph)
  → MAGI Psychological Profiling (gemini-3.1-pro-preview)
```

## Backend Services (19 analysis + 7 connectors + 13 adapters)

### Analysis Services (`libs/analysis/src/lib/services/`)

| Service | Purpose | LLM Model |
|---------|---------|-----------|
| NarrativeAnalysisService | Semantic clustering + LLM summaries | gemini-embedding-2-preview, gemini-2.0-flash |
| PropagandaAnalysisService | 17 technique detection + claim extraction | gemini-2.0-flash |
| CausalReasoningService | Agentic function-calling causal chains | gemini-3.1-pro-preview |
| DeepInvestigationService | Origin tracing, coordination, cui bono | gemini-2.0-flash |
| PsychologicalProfilerService | MAGI 9-dimension behavioral analysis | gemini-3.1-pro-preview |
| ClaimVerificationService | Multi-source evidence + investigative leads | gemini-2.0-flash |
| SourceCredibilityService | Heuristic + graph credibility scoring | None |
| GraphBotDetectionService | Temporal + behavioral + structural bot detection | None |
| SocialGraphIntelligenceService | 3-tier persistent relationship mapping | None |
| PlatformCredibilityService | Per-platform credibility vs influence scoring | None |
| SaturationMetricsService | Adaptive scan depth recommendation | None |
| DownstreamEffectsService | Real-world signal correlation | None (orchestrator) |
| DeviationService | Reality tunnel visualization data | None |
| EntityAnalysisService | Entity dossiers + co-occurrence networks | None |
| NarrativeGenealogyService | Cross-snapshot narrative evolution | None |
| ComparisonService | Narrative/period/platform comparison | None |
| ReportService | Markdown/HTML report generation | gemini-2.0-flash |
| MonitorService | Snapshot comparison + alert detection | None |
| CrossPlatformIdentityService | Sherlock cross-platform discovery | None (subprocess) |

### Ingestion Connectors (`libs/ingestion/src/lib/services/`)

| Connector | Platform | Auth | Default |
|-----------|----------|------|---------|
| TwitterFreeConnector | Twitter/X | Cookies or username/password | Enabled |
| RedditFreeConnector | Reddit | None (public JSON API) | Enabled |
| YouTubeFreeConnector | YouTube | None (yt-dlp CLI) | Enabled |
| RSSConnector | 177 curated feeds (15 categories) | None | Enabled |
| FarcasterFreeConnector | Farcaster/Warpcast | NEYNAR_API_KEY | Enabled |
| TelegramFreeConnector | Telegram channels | None (web scrape) | Enabled |
| TruthSocialFreeConnector | Truth Social | TRUTHSOCIAL_USERNAME/PASSWORD | Disabled |

### Signal Adapters (`libs/analysis/src/lib/services/signal-adapters/`)

| Adapter | Domain | Scope | API Key |
|---------|--------|-------|---------|
| CoinGeckoAdapter | market | global | None |
| GdeltAdapter | media | query | None |
| YahooFinanceAdapter | market | query | None |
| WorldBankAdapter | economic | global | None |
| FredAdapter | economic | global | FRED_API_KEY |
| AcledAdapter | political | global | ACLED_API_KEY + ACLED_EMAIL |
| UsgsAdapter | social | global | None |
| LlmHypothesisAdapter | query | query | GEMINI_API_KEY |

### Evidence Adapters (`libs/analysis/src/lib/services/evidence-adapters/`)

| Adapter | Type | What it verifies | API Key |
|---------|------|-----------------|---------|
| EtherscanEvidenceAdapter | on-chain | Wallet balances, token transfers | ETHERSCAN_API_KEY |
| DexScreenerEvidenceAdapter | on-chain | Trading volume, liquidity, price | None |
| GitHubEvidenceAdapter | social | Repo activity, commits | GITHUB_TOKEN (optional) |
| SecEdgarEvidenceAdapter | governmental | Corporate filings | None |
| SocialGraphEvidenceAdapter | social | Internal credibility/identity data | None |

## Frontend (30 components, 11 visualization modes)

### Pages
- `/` — Command center (investigations + alerts)
- `/search` — Scan initiation (platforms, depth, time range, advanced filters)
- `/results` — Main workspace (11 viz modes + 3-panel layout)
- `/monitor` — Alert monitoring + investigation scheduling

### Visualization Modes (center panel)
1. **TEMPORAL** — Time x narrative heatmap
2. **ACTORS** — Author credibility/bot matrix
3. **CLAIMS** — Propaganda technique + claim verification
4. **EFFECTS** — Downstream causal transmission chains
5. **GLOBE** — 3D narrative geographic distribution
6. **ENTITIES** — Entity dossiers + co-occurrence network
7. **GENEALOGY** — Narrative evolution across snapshots
8. **FLOW** — Cross-platform propagation
9. **EVIDENCE** — Multi-source evidence chains + investigative leads
10. **GRAPH** — Social relationship network (3-tier)
11. **RADAR** — Multi-axis narrative comparison

### Advanced Search Filters
- **Usernames** — Auto-investigate specified users
- **Hashtags** — Appended to search query
- **Wallet/Contract** — Triggers on-chain evidence lookup
- **Subreddits** — Scopes Reddit to specific communities

## Database Architecture

### MongoDB Collections
| Collection | Purpose |
|-----------|---------|
| scan_jobs | Scan results + post storage + analysis cache |
| investigations | Persistent investigation tracking |
| investigation_snapshots | Point-in-time analysis snapshots |
| identity_records | Persistent user profiles (MAGI) |
| analysis_jobs | BullMQ job tracking |
| narrative_insights | Accumulated narrative data |
| signal_cache | External signal adapter cache |
| alerts | Monitor alerts |
| monitor_configs | Auto-refresh configuration |

### Memgraph (Graph Database)
- **Nodes:** User, Narrative, Community
- **Edges:** INTERACTS_WITH (weighted, 3-tier), CO_TIMED, CO_NARRATIVE, SIMILAR_CONTENT, AMPLIFIED, REPLIED_TO, REPOSTED
- **Algorithms:** PageRank, Betweenness Centrality, Community Detection (require memgraph/memgraph-mage Docker image)

## Queue System (BullMQ + Redis)
- **scan** queue — one job per connector per scan
- **analysis** queue (concurrency: 2) — investigation, propaganda, claims, downstream, psychological-profile

## Environment Variables

### Required
```
GEMINI_API_KEY=           # Google AI (embeddings, summaries, profiling)
MONGODB_URI=              # default: mongodb://localhost:27017
REDIS_HOST=               # BullMQ queue backend
REDIS_PORT=               # default: 6379
```

### Optional
```
MEMGRAPH_HOST=            # Graph database (default: localhost)
MEMGRAPH_PORT=            # default: 7687
TWITTER_USERNAME=         # Twitter scraper auth
TWITTER_PASSWORD=
TWITTER_EMAIL=
NEYNAR_API_KEY=           # Farcaster connector
FRED_API_KEY=             # Federal Reserve economic data
ETHERSCAN_API_KEY=        # On-chain evidence verification
GITHUB_TOKEN=             # Higher rate limit for GitHub evidence
ACLED_API_KEY=            # Armed Conflict Location & Event data
ACLED_EMAIL=
TRUTHSOCIAL_USERNAME=     # Truth Social (disabled by default)
TRUTHSOCIAL_PASSWORD=
```

## Testing

- **187 API tests** across 5 suites
- **58 saturation metrics tests**
- **169 service coverage tests** (registration, adapters, data flow, error handling)
- Run: `npx nx test api && npx nx test analysis`

## Key Features
- Cross-scan deduplication (87% reduction in redundant scraping)
- Signal caching with per-adapter TTL (hourly date-key matching)
- Platform credibility model (credibility vs influence scoring)
- Adaptive saturation detection (recommends scan depth)
- Persistent identity records across investigations
- 3-tier social graph (direct, contextual, bridge connections)
- Evidence-based claim verification with investigative leads
- Scan coverage timeline with gap detection
