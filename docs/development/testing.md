# Testing Guide

## Overview

Veritas uses Jest for testing with 740+ tests across 41 test suites. Tests are colocated with each lib in `__tests__/` directories that mirror the `src/` structure.

## Running Tests

```bash
# Run all tests
npm test

# Run tests for a specific lib
npx nx test ingestion
npx nx test database
npx nx test content-classification
npx nx test sources
npx nx test utils
npx nx test types

# Run a specific test file
npx nx test ingestion -- --testPathPattern="reddit-free"

# Run with coverage
npm run test:coverage
```

## Test Structure

Tests live in `__tests__/` directories at each lib root, mirroring the `src/lib/` structure:

```
libs/ingestion/
  src/lib/
    services/
      reddit-free.connector.ts
      ingestion.service.ts
    repositories/
      mongo-narrative.repository.ts
  __tests__/
    services/
      reddit-free.connector.spec.ts
      ingestion.service.spec.ts
    repositories/
      mongo-narrative.repository.spec.ts
```

## Test Coverage by Library

| Library | Test Suites | Tests | Key Areas Covered |
|---------|-------------|-------|-------------------|
| ingestion | 19 | 252 | All connectors (free + API), transform pipeline, repositories, controllers |
| database | 6 | 132 | All providers (MongoDB, Memgraph, Redis), repositories, service lifecycle |
| content-classification | 6 | 80 | Classification, embeddings, content CRUD, vector search |
| shared/utils | 4 | 201 | Object utils, string utils, validation utils |
| sources | 2 | 32 | Source service, validation |
| shared/types | 1 | 2 | Type definitions |
| visualization | 1 | 1 | Component rendering |
| apps/api | 2 | varies | Controller, service |

## Writing Tests

### Patterns

**Service tests** use NestJS `Test.createTestingModule` or direct instantiation with mocked dependencies:

```typescript
const mockConfigService = { get: jest.fn((key) => config[key]) };
const connector = new RedditFreeConnector(
  mockConfigService as ConfigService,
  mockTransformService as unknown as TransformOnIngestService,
);
```

**Repository tests** mock the underlying database model/client:

```typescript
const mockModel = {
  find: jest.fn().mockReturnValue({ skip: jest.fn().mockReturnValue({ limit: jest.fn() }) }),
  findById: jest.fn(),
  // ...
};
```

**Connector tests** mock external dependencies (axios, subprocess, scraper libraries):

```typescript
jest.mock('@the-convocation/twitter-scraper', () => ({
  Scraper: jest.fn().mockImplementation(() => ({
    searchTweets: mockSearchTweets,
    isLoggedIn: mockIsLoggedIn,
  })),
}));
```

### Configuration

Each lib has:
- `jest.config.ts` with `roots: ['<rootDir>/src', '<rootDir>/__tests__']`
- `tsconfig.spec.json` with `__tests__/**/*.spec.ts` in `include`

The ingestion lib has a `moduleNameMapper` for `franc-min` (ESM module that needs mocking in Jest's CJS environment).

## CI

Tests run in GitHub Actions on push/PR to main:
1. Lint (`npm run lint`)
2. Test (`npm test`)
3. Build (`npm run build`)

Coverage reports are uploaded to Codecov.
