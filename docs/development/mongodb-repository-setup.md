# MongoDB Repository Implementation

This document provides a guide for setting up and using the MongoDB implementation of the `NarrativeRepository` in the Veritas system.

## Overview

The `MongoNarrativeRepository` provides a MongoDB-based implementation of the `NarrativeRepository` interface, allowing storage and retrieval of narrative insights and trends in a MongoDB database. This implementation is suitable for production environments where persistent storage is required.

## Setup Instructions

### Prerequisites

- Docker and Docker Compose installed
- Node.js and npm installed

### Starting MongoDB

The repository includes a Docker Compose configuration for MongoDB:

```bash
# Start MongoDB containers
docker-compose -f docker-compose.mongodb.yml up -d
```

This will start:
- A MongoDB server container named `veritas-mongodb` accessible on port 27017
- A MongoDB Express admin UI container named `veritas-mongo-express` accessible on port 8081

### MongoDB Express UI

The MongoDB Express UI provides a web interface for managing the MongoDB database. You can access it at [http://localhost:8081](http://localhost:8081) once the containers are running.

## Usage in Applications

### Configuration

To use the MongoDB repository implementation in your application, configure the `NarrativeModule` with the MongoDB repository type:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NarrativeModule } from '@veritas/ingestion';

@Module({
  imports: [
    ConfigModule.forRoot(),
    NarrativeModule.forRoot({
      repositoryType: 'mongodb', // Use MongoDB implementation
    }),
  ],
})
export class AppModule {}
```

### Dependency Injection

The repository is automatically registered with the NestJS dependency injection system, so you can inject it into your services:

```typescript
import { Injectable } from '@nestjs/common';
import { NarrativeRepository, NarrativeInsight } from '@veritas/ingestion';

@Injectable()
export class YourService {
  constructor(private readonly narrativeRepository: NarrativeRepository) {}

  async storeInsight(insight: NarrativeInsight): Promise<void> {
    await this.narrativeRepository.save(insight);
  }

  async findInsightByHash(contentHash: string): Promise<NarrativeInsight | null> {
    return this.narrativeRepository.findByContentHash(contentHash);
  }
}
```

## Repository Methods

The MongoDB repository implementation provides these methods:

| Method | Description |
|--------|-------------|
| `save(insight)` | Saves a single narrative insight to the database |
| `saveMany(insights)` | Saves multiple narrative insights in a single operation |
| `findByContentHash(contentHash)` | Finds an insight by its content hash |
| `findByTimeframe(timeframe, options)` | Finds insights for a specific timeframe (e.g., "2023-Q2") |
| `getTrendsByTimeframe(timeframe)` | Gets narrative trends for a specific timeframe |
| `deleteOlderThan(cutoffDate)` | Deletes insights older than the specified date |

## Schema Information

The MongoDB implementation uses two collections:

### narrativeinsights

Stores individual narrative insights with the following schema:

- `id`: Unique identifier
- `contentHash`: Hash of the original content
- `sourceHash`: Hash of the source
- `platform`: Platform the content was posted on
- `timestamp`: When the content was posted
- `themes`: Array of extracted themes
- `entities`: Array of entities mentioned in the content
- `sentiment`: Sentiment analysis results
- `engagement`: Engagement metrics
- `narrativeScore`: Score indicating contribution to narratives
- `processedAt`: When the insight was created
- `expiresAt`: When the insight should be automatically deleted

### narrativetrends

Stores aggregated narrative trends with the following schema:

- `id`: Unique identifier
- `timeframe`: Time period representation (e.g., "2023-Q2")
- `primaryTheme`: Main theme of the narrative trend
- `relatedThemes`: Array of related themes
- `insightCount`: Number of insights contributing to the trend
- `uniqueSourcesCount`: Number of unique sources
- `sentimentTrend`: Average sentiment score
- `platformDistribution`: Distribution across platforms
- `narrativeScore`: Overall significance score
- `detectedAt`: When the trend was detected

## Example Application

See the direct MongoDB example script at `examples/narrative-repository/mongo-direct-example.sh` for a demonstration of MongoDB functionality.

## Troubleshooting

### MongoDB Connection Issues

If you encounter issues connecting to MongoDB:

1. Check if the containers are running:
   ```bash
   docker ps | grep veritas
   ```

2. Check the container logs:
   ```bash
   docker logs veritas-mongodb
   ```

3. Verify MongoDB is accessible:
   ```bash
   docker exec veritas-mongodb mongosh --quiet -u admin -p password --authenticationDatabase admin --eval "db.runCommand({ping:1})"
   ```

### Disk Space Issues

If MongoDB fails to start due to disk space issues:

1. Check available disk space:
   ```bash
   df -h
   ```

2. Clean up Docker resources:
   ```bash
   docker system prune -af
   ```

3. Update the volume configuration in `docker-compose.mongodb.yml` to use a path with more available space. 