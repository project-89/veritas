# Veritas Ingestion Library

## Overview

The Ingestion library is responsible for data ingestion from various social media platforms and implementing the transform-on-ingest architecture for privacy-focused data processing.

## Key Components

### Modules

- **IngestionModule**: The main module that coordinates ingestion activities
- **TransformOnIngestModule**: Implements the transform-on-ingest pattern
- **NarrativeModule**: Manages narrative insights derived from ingested data

### Connectors

The library includes connectors for various social media platforms:

- **FacebookConnector**: Facebook data ingestion
- **TwitterConnector**: Twitter data ingestion
- **RedditConnector**: Reddit data ingestion

Each connector implements both raw data retrieval and immediate transformation methods.

### Repository Layer

- **NarrativeRepository**: An abstract repository for narrative insights
- **InMemoryNarrativeRepository**: A reference implementation for development

### Transform Services

- **TransformOnIngestService**: Core service for transforming raw social media data into anonymized narrative insights

## Architecture

This library follows the "transform-on-ingest" architecture, which ensures:

1. No raw identifiable data is stored in the system
2. All data is anonymized at the edge
3. Only transformed insights are persisted

## Usage

Import the modules in your NestJS application:

```typescript
import { IngestionModule, TransformOnIngestModule, NarrativeModule } from '@veritas/ingestion';

@Module({
  imports: [
    IngestionModule,
    TransformOnIngestModule,
    NarrativeModule,
  ],
})
export class AppModule {}
```

## Directory Structure

The library follows a clean, modular organization:

- `src/lib/modules/`: Module definitions for the library
  - `ingestion.module.ts`: Main module for content ingestion
  - `narrative.module.ts`: Module for narrative processing
  - `transform-on-ingest.module.ts`: Module for transformation during ingestion
  - `module-resolver.ts`: Utilities for dynamic module resolution

- `src/lib/controllers/`: API controllers
  - `ingestion.controller.ts`: Handles content ingestion endpoints
  - `narrative.controller.ts`: Handles narrative insight endpoints

- `src/lib/services/`: Service implementations
  - `facebook.connector.ts`, `twitter.connector.ts`, `reddit.connector.ts`: Platform-specific connectors
  - `social-media.service.ts`: Common service for social media operations
  - `transform/transform-on-ingest.service.ts`: Service for transforming content during ingestion

- `src/lib/repositories/`: Data access layer
  - `narrative-insight.repository.ts`: Repository for narrative insights

- `src/lib/resolvers/`: GraphQL resolvers
  - `ingestion.resolver.ts`: GraphQL resolver for ingestion operations

- `src/lib/interfaces/`: Interface definitions
  - `narrative-insight.interface.ts`: Defines narrative insight structures
  - `transform-on-ingest-connector.interface.ts`: Interface for transformation connectors
  - `social-media-connector.interface.ts`: Interface for social media platform connectors

- `src/lib/types/`: Type definitions
  - `ingestion.types.ts`: Types for ingestion operations
  - `graphql.types.ts`: GraphQL type definitions

- `src/lib/schemas/`: Schema definitions

- `src/lib/__mocks__/`: Mock implementations for testing

## Configuration

The modules in this library require various configurations:

- Kafka service for event messaging
- Social media API credentials (configured via environment variables)
- Database connections (Memgraph)

## Testing

Mock implementations are provided for testing in the `__mocks__` directory.

## Development

This library is part of the Veritas NX monorepo. See the main README for development instructions. 