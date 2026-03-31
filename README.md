# Veritas

Advanced narrative tracking and analysis system. Identifies, tracks, and visualizes information flow across digital platforms using graph database technology, content classification, and multi-source data ingestion.

## Key Features

- **Multi-Source Ingestion** - Reddit, Twitter/X, YouTube, RSS, web scraping (all API-free, no paid keys needed)
- **Transform-on-Ingest** - Content is anonymized and classified immediately on ingestion for privacy compliance
- **Content Classification** - Automatic topic extraction, sentiment analysis, entity recognition, and embedding generation
- **Narrative Analysis** - Reality deviation detection, pattern recognition, source credibility scoring
- **GraphQL + REST APIs** - 13 REST endpoints + 18 GraphQL queries/mutations
- **Visualization** - React/D3.js components for narrative flow, network graphs, and temporal analysis

## Architecture

NX monorepo with 7 libraries and 2 applications:

```
apps/
  api/                          # NestJS backend (REST + GraphQL)
  visualization-showcase/       # React/Vite frontend

libs/
  database/                     # Multi-database adapter (MongoDB, Memgraph, Redis)
  ingestion/                    # Data connectors and transform-on-ingest pipeline
  content-classification/       # NLP classification, embeddings, vector search
  analysis/                     # Narrative analysis and deviation detection
  sources/                      # Source management and credibility
  visualization/                # React/D3.js visualization components
  shared/                       # Shared types and utilities
    types/
    utils/
```

### Data Connectors

| Platform | Method | Auth Required |
|----------|--------|--------------|
| Reddit | Public JSON API | None |
| Twitter/X | @the-convocation/twitter-scraper | Free Twitter account |
| YouTube | yt-dlp CLI | None |
| Facebook | Jina Reader | None |
| RSS | rss-parser | None |
| Web | cheerio + axios | None |

## Getting Started

### Prerequisites

- Node.js 22+ (Node 25 works but has some dependency warnings)
- Docker (for MongoDB)
- yt-dlp (`pip install yt-dlp` or `brew install yt-dlp`)

### Setup

```bash
# Clone and install
git clone https://github.com/oneirocom/veritas.git
cd veritas
npm install

# Create .env from template
cp .env.example .env

# Start MongoDB
npm run mongodb:up

# Build and run the API
npx nx build api
node dist/apps/api/main.js
```

The API starts at http://localhost:3000 with:
- Swagger docs at http://localhost:3000/api
- GraphQL playground at http://localhost:3000/graphql

### Optional: Twitter/X Connector

Add your Twitter session cookies to `.env`:

```bash
TWITTER_COOKIES='["auth_token=YOUR_TOKEN; Domain=.x.com", "ct0=YOUR_CT0; Domain=.x.com"]'
```

Get these from Chrome DevTools > Application > Cookies > x.com.

## Development

```bash
# Run all tests (740 tests across 10 projects)
npm test

# Run tests for a specific lib
npx nx test ingestion
npx nx test database

# Build the API
npx nx build api

# Lint
npm run lint
```

### Project Structure

```
libs/X/
  src/lib/          # Source code
  __tests__/        # Tests (mirrors src/ structure)
  jest.config.ts
  tsconfig.*.json
```

### Key Technologies

- **Runtime**: NestJS, TypeScript (strict mode), GraphQL (Apollo)
- **Databases**: MongoDB (primary), Memgraph (graph), Redis (cache)
- **Testing**: Jest (740 tests, 41 test suites)
- **Tooling**: NX 20.4, Biome (formatting/linting), Webpack
- **Ingestion**: axios, cheerio, yt-dlp, @the-convocation/twitter-scraper, rss-parser

## API Endpoints

### REST (Swagger at /api)

| Method | Path | Description |
|--------|------|-------------|
| POST | /ingestion/content | Ingest content with source |
| PUT | /ingestion/source/:id/verify | Update source verification |
| POST | /content | Create content |
| GET | /content | Search content |
| GET | /content/:id | Get content by ID |
| PUT | /content/:id | Update content |
| DELETE | /content/:id | Delete content |
| GET | /content/:id/related | Find related content |
| PUT | /content/:id/engagement | Update engagement metrics |
| GET | /content/semantic-search | Semantic search |
| GET | /content/:id/similar | Find similar content |
| POST | /content/:id/embedding | Generate embedding |
| POST | /content/embeddings/generate-all | Batch generate embeddings |
| GET | /analysis/deviation/:narrativeId | Get reality deviation metrics |
| GET | /analysis/patterns | Detect patterns in timeframe |
| POST | /analysis/analyze | Analyze content |

### GraphQL (Playground at /graphql)

**Queries**: content, searchContent, semanticSearch, similarContent, relatedContent, getNarrativeInsights, getNarrativeTrends, detectPatterns, getRealityDeviation

**Mutations**: createContent, updateContent, deleteContent, updateEngagementMetrics, generateEmbedding, generateAllEmbeddings, ingestSocialContent, verifySource, analyzeContent

## Environment Variables

See [.env.example](.env.example) for all configuration options. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| MONGODB_URI | Yes | MongoDB connection string |
| TWITTER_COOKIES | No | Twitter session cookies for Twitter connector |
| FACEBOOK_PAGE_URLS | No | JSON array of Facebook page URLs to monitor |
| YT_DLP_PATH | No | Custom path to yt-dlp binary |

## Documentation

- [Development Guide](docs/development/)
- [API Documentation](docs/development/api-docs.md)
- [Data Model](docs/development/data-model.md)
- [Transform-on-Ingest Architecture](docs/development/transform-on-ingest-architecture.md)
- [Deployment Guide](docs/deployment/)
- [Visualization Components](docs/visualization/)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE).
