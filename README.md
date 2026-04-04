# Veritas — Narrative Intelligence Platform

Track, analyze, and visualize how narratives emerge, evolve, and impact the real world across social media platforms. Built as an intelligence tool for the people — using semantic analysis, graph intelligence, evidence-based reasoning, and psychological profiling. Free and open-source.

## What Veritas Does

- **Discovers narratives** across 7 platforms + 177 RSS feeds by clustering semantically similar content using Gemini embeddings
- **Investigates actors** with per-user timeline analysis, cross-platform identity discovery (400+ networks via Sherlock), coordination detection, and cui bono analysis
- **Profiles identities** with the MAGI system — persistent psychological profiles analyzing communication style, beliefs, emotional triggers, influence patterns, and risk indicators
- **Detects manipulation** through 17 propaganda techniques, evidence-based claim verification (on-chain + financial + social), bot detection, and platform credibility scoring
- **Maps relationships** with a persistent 3-tier social graph (direct, contextual, bridge connections) that accumulates across investigations
- **Tracks real-world impact** by correlating narratives with 8 real-world signal sources (markets, conflicts, economics, natural disasters, crypto)
- **Verifies claims** with multi-source evidence chains from Etherscan, DexScreener, GitHub, SEC EDGAR, and social graph data — generates investigative leads for human-in-the-loop verification

## Architecture

```
7 Social Connectors → BullMQ Scan Queue → MongoDB
  → Gemini Embedding Clustering → 19 Analysis Services
  → 8 Signal Adapters + 5 Evidence Adapters
  → Memgraph Social Graph → NERV Dashboard (11 viz modes)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full technical architecture.

## Data Sources

### Social Platforms (7 connectors)
| Platform | Method | Auth Required |
|----------|--------|---------------|
| Twitter/X | @haruhunab1320/twitter-scraper | Cookies or login |
| Reddit | Public JSON API | None |
| YouTube | yt-dlp CLI | None |
| RSS/News | 177 curated feeds across 15 categories | None |
| Farcaster | Neynar API v2 | Free API key |
| Telegram | Public channel web scrape | None |
| Truth Social | truthbrush CLI | Account required |

### Real-World Signal Adapters (8)
CoinGecko (crypto), GDELT (news), Yahoo Finance (markets), World Bank (development), FRED (US economy), ACLED (conflicts), USGS (earthquakes), LLM Hypothesis (AI)

### Evidence Verification Adapters (5)
Etherscan (on-chain), DexScreener (trading), GitHub (development), SEC EDGAR (filings), Social Graph (internal)

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB
- Redis (for BullMQ queues)
- Python 3 (for yt-dlp, truthbrush, sherlock)

### Optional
- Memgraph (for graph algorithms — `docker run -p 7687:7687 memgraph/memgraph-mage`)

### Setup

```bash
# Install dependencies
npm install
pip install yt-dlp truthbrush sherlock-project

# Configure environment
cp .env.example .env
# Edit .env with your API keys (minimum: GEMINI_API_KEY)

# Start services
docker compose -f docker-compose.dev.yml up -d  # MongoDB, Redis, Memgraph
npx nx serve api                                  # Backend (port 3000)
npx nx serve veritas-client                       # Frontend (port 4200)
```

### Required Environment Variables
```
GEMINI_API_KEY=your-gemini-key
MONGODB_URI=mongodb://localhost:27017
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Optional Environment Variables
```
TWITTER_USERNAME=       # Twitter/X scraper
TWITTER_PASSWORD=
TWITTER_EMAIL=
NEYNAR_API_KEY=         # Farcaster
FRED_API_KEY=           # Federal Reserve data
ETHERSCAN_API_KEY=      # On-chain evidence
GITHUB_TOKEN=           # GitHub evidence (higher rate limit)
MEMGRAPH_HOST=          # Graph database
```

## Features

### Search & Scan
- Multi-platform concurrent scanning via BullMQ
- Smart RSS feed selection (177 feeds matched by query keywords)
- Cross-scan deduplication (87% reduction in redundant scraping)
- Depth presets: Quick (25/connector), Standard (100), Deep (250), Exhaustive (500)
- Custom date range support
- Advanced filters: usernames, hashtags, wallets, subreddits

### Analysis Pipeline
- Semantic clustering with Gemini embeddings + agglomerative clustering
- Saturation detection (recommends when you have enough data)
- 17 propaganda technique detection with educational notes
- Auto-triggered claim verification with evidence routing
- Entity extraction from raw post text (handles, hashtags, tickers, names)
- Causal reasoning agent (gemini-3.1-pro-preview function calling)

### Investigation
- Per-user timeline fetching across all connectors
- Cross-platform identity discovery via Sherlock
- MAGI psychological profiler (9 behavioral dimensions with post citations)
- Persistent identity records (accumulate across investigations)
- 3-tier social graph intelligence (direct, contextual, bridge)
- Bot detection (temporal + behavioral + structural scoring)
- Platform credibility model (credibility vs influence per platform)

### Visualization (11 modes)
- Temporal heatmap, actor matrix, claims grid, effects chain
- 3D globe, entity network, genealogy timeline, propagation flow
- Evidence chains, social graph, narrative radar

## Testing

```bash
npx nx test api                    # 187 tests
npx nx test analysis               # 58+ tests
npx tsc --noEmit                   # Zero type errors
```

## License

See LICENSE file.
