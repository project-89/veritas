# Migration Plan: Consolidating Content and Content-Classification Modules

## Background
The repository currently contains two similar modules:
- `libs/content`: Older module with content classification and additional services
- `libs/content-classification`: Newer module focused solely on content classification

The two modules have duplicate functionality, particularly the `ContentClassificationService`. The goal is to consolidate these modules to reduce duplication and improve maintainability.

## Plan

### 1. Migrate Additional Services to Content-Classification (if needed)
- Move unique services from `libs/content` to `libs/content-classification`:
  - `ContentService`
  - `ContentValidationService`
  - Any other unique services/utilities

### 2. Update Content-Classification Module
- Ensure the `content-classification.module.ts` exposes all required services
- Update the index.ts to export all services
- Add tests for the newly migrated services

### 3. Create Compatibility Layer in Content Module
- Update `libs/content/src/index.ts` to re-export everything from `@veritas/content-classification`
- Add deprecated annotations to indicate the module will be removed in the future
- Update the readme to explain the migration

### 4. Update References Throughout Codebase
- Search for all imports of `@veritas/content-classification` and update them to use `@veritas/content-classification`
- Prioritize updates to the ingestion module which needs content classification

### 5. Update Build Scripts
- Update the build-ingestion.sh script to only build the content-classification module
- Remove any references to the content module in build scripts

### 6. Testing
- Test the ingestion module with the updated content-classification module
- Verify that all services work as expected
- Ensure the transform-on-ingest service works properly with the content-classification service

### 7. Future Deprecation (Later Phase)
- Once all references have been updated, mark the content module as deprecated
- Plan for removal in a future release
- Document the deprecation in CHANGELOG.md

## Implementation Timeline
1. Migrate services: 1-2 days
2. Create compatibility layer: 1 day
3. Update references: 1-2 days
4. Testing: 1-2 days

Total time estimate: 4-7 days

## Risks and Mitigations
- Risk: Breaking existing code that depends on the content module
  - Mitigation: Use the compatibility layer to ensure backward compatibility
  
- Risk: Missing some references to the content module
  - Mitigation: Comprehensive testing of all features that might use content classification

- Risk: Different behavior between the modules
  - Mitigation: Verify through unit and integration tests that behavior is consistent

## Success Criteria
- No duplicate code between the modules
- All functionality preserved
- Build process simplified
- Clear documentation for future developers 