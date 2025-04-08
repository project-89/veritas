# Ingestion Library Improvements Plan

## Current State Analysis

The Ingestion Library follows a well-designed connector pattern for multiple data sources and implements a transform-on-ingest pattern for data privacy, which is excellent for handling sensitive information. However, there are several issues that need to be addressed:

1. **Mock Implementations**: The library currently uses local mocks instead of proper dependency injection for database access and content classification services.

2. **Disconnected Architecture**: The library operates in isolation, with commented out imports for `@veritas/database` and `@veritas/content-classification`.

3. **Inconsistent Implementations**: There are two social media services (`SocialMediaService` and `AnonymizedSocialMediaService`) with overlapping functionality.

4. **Limited Testing**: No comprehensive tests for the connector implementations or the transform-on-ingest functionality.

5. **Missing Documentation**: While code documentation is good, there's no README or comprehensive explanation of the transform-on-ingest pattern's implementation.

## Improvement Goals

1. Replace local mocks with proper dependency injection
2. Integrate with our new database architecture
3. Streamline the social media connector implementations
4. Improve the module configuration options
5. Add proper tests for connectors and transformation logic
6. Create comprehensive documentation

## Proposed Changes

### 1. Replace Mocked Database Implementation

The current implementation uses local mocks for database services:

```typescript
// Local stubs for database services
class ContentService {}
class SourceService {}
```

We'll replace these with proper dependency injection using our new database architecture.

### 2. Improve Module Configuration

Update the `IngestionModule` to provide a proper `forRoot()` method that accepts configuration options:

```typescript
export interface IngestionModuleOptions {
  databaseProvider?: DatabaseProvider;
  contentClassificationProvider?: any;
  connectors?: {
    twitter?: boolean;
    facebook?: boolean;
    reddit?: boolean;
    rss?: boolean;
    webScraper?: boolean;
    youtube?: boolean;
  };
}
```

### 3. Consolidate Social Media Services

Currently, there are two services with overlapping functionality:
- `SocialMediaService` - Raw data handling
- `AnonymizedSocialMediaService` - Transformed data handling

We'll consolidate these into a cleaner architecture with a single service that properly implements the transform-on-ingest pattern.

### 4. Improve Repository Pattern Implementation

The `NarrativeRepository` now needs to leverage our database library instead of using its own MongoDB integration:

```typescript
export class MongoNarrativeRepository implements NarrativeRepository {
  constructor(
    private readonly databaseService: DatabaseService,
  ) {
    // Use the database service to get the appropriate repositories
  }
}
```

### 5. Enhance Transform-On-Ingest Integration

Improve the TransformOnIngestService to better integrate with:
- Content classification service
- Database repositories 
- Maintain data privacy at the edge

### 6. Implement Proper Testing

Add comprehensive tests for:
- Each connector implementation
- Transformation logic
- Repository implementations
- Integration between components

### 7. Add Documentation

Create detailed documentation explaining:
- The transform-on-ingest pattern
- How data privacy is maintained
- Connector usage and configuration
- Repository pattern
- Integration with other libraries

## Implementation Plan

1. **Phase 1: Core Architecture Updates**
   - Update the module configuration
   - Replace mocks with proper dependency injection
   - Integrate with database library

2. **Phase 2: Connector Improvements**
   - Standardize connector implementations
   - Improve error handling
   - Add proper validation

3. **Phase 3: Testing and Documentation**
   - Add unit tests for all components
   - Add integration tests
   - Create comprehensive documentation

## Expected Benefits

1. **Better Integration**: The ingestion library will properly integrate with other components of the system.
2. **Improved Maintainability**: Standardized implementations and proper dependency injection will make the codebase easier to maintain.
3. **Enhanced Reliability**: Comprehensive testing will ensure the library works as expected.
4. **Better Developer Experience**: Detailed documentation will make it easier for developers to understand and use the library.
5. **Streamlined Architecture**: Consolidating overlapping functionality will result in a cleaner, more coherent codebase. 