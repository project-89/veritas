# Narrative Repository Pattern

The Narrative Repository Pattern is a key architectural component of the Veritas system for handling narrative insights in a manner that ensures data compliance, anonymization, and effective trend analysis.

## Overview

The repository pattern abstracts the data layer and provides a set of methods to access, store, query, and aggregate narrative insights. It serves as an intermediary between the business logic and the data storage, ensuring that all data is properly transformed, anonymized, and compliant with platform requirements.

## Core Components

### NarrativeRepository Interface

The `NarrativeRepository` interface defines the contract for all repository implementations, ensuring a consistent API regardless of the underlying storage mechanism:

```typescript
export interface NarrativeRepository {
  save(insight: NarrativeInsight): Promise<void>;
  saveMany(insights: NarrativeInsight[]): Promise<void>;
  findByContentHash(contentHash: string): Promise<NarrativeInsight | null>;
  findByTimeframe(timeframe: string, options?: { limit?: number; skip?: number }): Promise<NarrativeInsight[]>;
  getTrendsByTimeframe(timeframe: string): Promise<NarrativeTrend[]>;
  deleteOlderThan(cutoffDate: Date): Promise<number>;
}
```

### Implementations

Currently, the system includes the following implementations:

1. **InMemoryNarrativeRepository**: A lightweight implementation for development and testing, storing data in memory.

2. **MongoNarrativeRepository** (planned): A MongoDB-based implementation for production use, leveraging the database's indexing and aggregation capabilities.

## Key Features

### 1. Data Transformation and Anonymization

The repository pattern works with the [Transform-on-Ingest Architecture](./transform-on-ingest-architecture.md) to ensure that:

- All identifying information is properly anonymized through one-way hashing
- Raw data is never stored in the database
- Only transformed narrative insights are persisted

### 2. Trend Analysis

The repository provides methods for aggregating insights into narrative trends:

- Identifying emerging themes across platforms
- Tracking sentiment shifts over time
- Measuring source diversity and narrative adoption
- Calculating the overall significance of each trend

### 3. Compliance Management

The repository incorporates compliance requirements directly into its design:

- Automatic data aging and deletion
- Content hashing to support deletion requests
- Clear separation between raw data and transformed insights

## Usage Examples

### Storing Narrative Insights

```typescript
// After transforming a social media post
const narrativeInsight = transformOnIngestService.transform(socialMediaPost);

// Save to repository
await narrativeRepository.save(narrativeInsight);
```

### Finding Trends

```typescript
// Get trends for the current quarter
const currentTimeframe = `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`;
const trends = await narrativeRepository.getTrendsByTimeframe(currentTimeframe);

// Process top trends
const topTrends = trends
  .sort((a, b) => b.narrativeScore - a.narrativeScore)
  .slice(0, 10);
```

### Implementing Compliance

```typescript
// Delete data older than 90 days (typical compliance requirement)
const ninetyDaysAgo = new Date();
ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

const deletedCount = await narrativeRepository.deleteOlderThan(ninetyDaysAgo);
logger.info(`Deleted ${deletedCount} insights for compliance purposes`);
```

## Benefits Over Direct Database Access

1. **Abstraction**: Business logic remains isolated from the specifics of data storage
2. **Compliance by Design**: Data handling policies are centralized and consistently applied
3. **Testability**: Repositories can be easily mocked for tests
4. **Flexibility**: Storage backends can be changed without affecting business logic
5. **Aggregation**: Complex data operations are encapsulated within the repository

## Implementation Guidance

When extending or implementing a new repository:

1. Always adhere to the `NarrativeRepository` interface
2. Never store raw data; work exclusively with transformed insights
3. Implement the deletion mechanism for compliance
4. Optimize for both individual insight storage and aggregate trend analysis
5. Consider the performance implications of your aggregation methods 