# Migration Guide for Ingestion Library

## Latest Changes (March 2023)

### Directory Structure Reorganization

The ingestion library directory structure has been reorganized for better maintainability:

1. Created a dedicated `modules/` directory:
   - Moved all module files (`*.module.ts`) to this directory
   - Added an index.ts file for proper exports
   - Moved `module-resolver.ts` to this directory

2. Improved controller organization:
   - Moved `ingestion.controller.ts` to the `controllers/` directory
   - Updated the `controllers/index.ts` file to export both controllers

3. Documentation improvements:
   - Added a document explaining the distinction between interfaces and types
   - Updated the README.md with the new directory structure

### ContentStorageService Deprecation

The `ContentStorageService` has been deprecated in favor of the newer `NarrativeRepository`:

```typescript
// Old approach (deprecated)
import { ContentStorageService } from '@veritas/ingestion';

@Injectable()
export class YourService {
  constructor(private contentStorage: ContentStorageService) {}

  async storeContent(content: any) {
    return this.contentStorage.store(content);
  }
}

// New approach
import { NarrativeRepository } from '@veritas/ingestion';

@Injectable()
export class YourService {
  constructor(private narrativeRepository: NarrativeRepository) {}

  async storeContent(insight: NarrativeInsight) {
    return this.narrativeRepository.save(insight);
  }
}
```

Benefits of the new approach:
- Fully supports the transform-on-ingest architecture
- Provides better type safety and validation
- Includes privacy-enhancing features by default
- Has built-in data retention and compliance features

## Previous Changes

### Transform-on-Ingest Architecture

The ingestion library has adopted a transform-on-ingest architecture, which means:

1. Raw identifiable data is never stored
2. All incoming data is anonymized at the edge
3. Only transformed insights are persisted

To migrate to this architecture:

```typescript
// Old approach
const posts = await socialMediaService.searchContent('query');
await contentStorageService.store(posts);

// New approach
const insights = await transformOnIngestService.searchAllAndTransform('query');
```

### Enhanced Platform Connectors

Platform connectors now implement the `TransformOnIngestConnector` interface, providing:

- `searchAndTransform`: Get anonymized insights directly
- `streamAndTransform`: Stream anonymized insights directly

```typescript
// Old approach
const posts = await twitterConnector.searchContent('query');
const transformed = posts.map(post => transformService.transform(post));

// New approach
const insights = await twitterConnector.searchAndTransform('query');
```

Contact the Veritas team with any questions about these migrations.

# Migration Guide

This document outlines the changes made to the organization of the ingestion library and how to migrate your code if you were working with the previous structure.

## Directory Structure Changes

### Module Organization

- **CHANGE**: Moved all module files to a dedicated `modules` directory
  - `ingestion.module.ts` → `modules/ingestion.module.ts`
  - `narrative.module.ts` → `modules/narrative.module.ts`
  - `transform-on-ingest.module.ts` → `modules/transform-on-ingest.module.ts`
  - Added `modules/module-resolver.ts` for dynamic module resolution

### Controller Organization

- **CHANGE**: Moved all controller files to a dedicated `controllers` directory
  - `ingestion.controller.ts` → `controllers/ingestion.controller.ts`

### Import Changes

If you previously imported directly from the files, update your imports to use the barrel exports:

```typescript
// OLD
import { IngestionModule } from './lib/ingestion.module';
import { NarrativeModule } from './lib/narrative.module';
import { IngestionController } from './lib/ingestion.controller';

// NEW
import { IngestionModule, NarrativeModule } from './lib/modules';
import { IngestionController } from './lib/controllers';
```

## API Changes

No functional API changes were made during this reorganization. All modules, controllers, services, repositories, and other components maintain the same functionality and interfaces.

## Testing

If you have tests that directly imported files from specific locations, update the import paths to match the new structure:

```typescript
// OLD
import { IngestionModule } from '../../src/lib/ingestion.module';

// NEW
import { IngestionModule } from '../../src/lib/modules';
```

## Redis Module Notice

The RedisModule import from @veritas/shared is currently commented out in the narrative.module.ts file. If your application depends on Redis functionality, you'll need to:

1. Ensure that the RedisModule is properly implemented in the shared library
2. Uncomment the import and module reference in narrative.module.ts

## Service Naming Updates (March 2023)

### AnonymizedSocialMediaService

The `SimplifiedSocialMediaService` has been renamed to `AnonymizedSocialMediaService` to better reflect its purpose:

```typescript
// Old
import { SimplifiedSocialMediaService } from '@veritas/ingestion';

// New
import { AnonymizedSocialMediaService } from '@veritas/ingestion';
```

The new name more clearly communicates that this service:
- Ensures all data is anonymized during ingestion
- Implements the transform-on-ingest pattern
- Provides privacy-safe access to social media data
- Is the preferred service for production use where privacy regulations apply

No functional changes were made to the service - only the name was updated for clarity.

## Questions?

If you have any questions about the reorganization or need help migrating your code, please contact the maintainers. 