# Veritas Architecture

## High-Level Components

### Data Collection Layer
- Web Scrapers
- API Integrators
- Archive Manager

### Processing Layer
- Data Validation Pipeline
- Entity Recognition
- Network Analysis
- Narrative Detection
- Reality Baseline Measurement

### Storage Layer
- Memgraph (graph database)
  - Temporal analysis
  - Relationship mapping
  - Pattern detection
- Redis (caching layer)
- Document Store (MongoDB)

### Analysis Layer
- Pattern Recognition
- Temporal Analysis
- Source Credibility
- Network Influence
- Reality Deviation Metrics

### Presentation Layer
- API Gateway
- Web Interface
- Data Export
- Alert System

## Technology Stack

### Backend
- Node.js with TypeScript
- NestJS framework
- Kafka/Redpanda (event streaming)
- Memgraph (graph database)
- Redis (caching)

### API Layer
- GraphQL with type-gen
- REST endpoints with Zodios
- OpenAPI/Swagger documentation generated from Zod schemas

### Frontend
- Next.js (TypeScript)
- React Query
- D3.js/Cytoscape.js
- TailwindCSS

### Testing
- Jest (unit testing)
- SuperTest (API testing)
- Cypress (E2E testing)
- k6 (load testing)

### Monitoring
- OpenTelemetry (tracing)
- Prometheus (metrics)
- ELK Stack (logging)
- Grafana (visualization)

### DevOps
- Docker
- Kubernetes
- GitHub Actions
- ArgoCD

## Data Models

### Schema Definitions
The system uses Zod for runtime type validation and schema definition. Key schemas include:

#### Base Metrics
- Activity Metrics (post frequency, engagement rate, interaction patterns)
- Engagement Metrics (likes, shares, comments, reach, virality)

#### Node Types
- Account Nodes (platform accounts, activity metrics, credibility)
- Content Nodes (posts, articles, media)
- Source Nodes (original content creators, verification status)

#### Edge Types
- Shares (content propagation)
- Interactions (replies, retweets, quotes, mentions)

### Reality Baseline Measurement

#### Methodology
1. Source Credibility Scoring
    - Historical accuracy
    - Expert verification
    - Cross-reference frequency
    - Citation analysis
2. Event Verification
    - Multiple source confirmation
    - Physical evidence correlation
    - Expert validation
    - Temporal consistency
3. Narrative Deviation Scoring
    - Content similarity analysis
    - Source credibility weighting
    - Propagation pattern analysis
    - Cross-reference density

#### Metrics
```typescript
interface RealityDeviationMetrics {
  baselineScore: number;          // 0-1 scale of correlation with verified reality
  deviationMagnitude: number;     // Degree of separation from baseline
  propagationVelocity: number;    // Speed of narrative spread
  crossReferenceScore: number;    // Density of verifiable references
  sourceCredibility: number;      // Weighted credibility of sources
  impactScore: number;           // Measured real-world impact
}
```

## System Integration

### Event Flow
1. Data Collection
   - Social media API integration
   - Web scraping
   - Manual input
2. Processing Pipeline
   - Data validation
   - Entity extraction
   - Relationship mapping
3. Analysis Pipeline
   - Pattern detection
   - Reality baseline comparison
   - Network analysis
4. Storage
   - Graph database updates
   - Cache management
   - Document storage
5. Presentation
   - API responses
   - Real-time updates
   - Visualization rendering 