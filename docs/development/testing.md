# Testing Guide for Veritas

This guide provides instructions for testing the Veritas system during development.

## Types of Tests

The Veritas system includes several types of tests:

1. **Unit Tests**: Test individual components in isolation
2. **Integration Tests**: Test interactions between components
3. **End-to-End Tests**: Test the entire system workflow
4. **Performance Tests**: Test system performance under load

## Running Tests

### Unit Tests

Unit tests are located in the `__tests__` directories within each component.

```bash
# Run all unit tests
npm test

# Run tests for a specific component
npm test -- --projects=api
npm test -- --projects=visualization

# Run a specific test file
npm test -- path/to/test-file.spec.ts

# Run tests with coverage
npm test -- --coverage
```

### Integration Tests

Integration tests verify that different components work together correctly.

```bash
# Start the test environment
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
npm run test:integration

# Run a specific integration test
npm run test:integration -- --testPathPattern=narrative-flow
```

### End-to-End Tests

End-to-end tests verify complete user workflows.

```bash
# Start the full environment
docker-compose up -d

# Run E2E tests
npm run test:e2e

# Run a specific E2E test
npm run test:e2e -- --spec=narrative-tracking
```

### Performance Tests

Performance tests measure system performance under load.

```bash
# Install k6 load testing tool
docker pull grafana/k6

# Run a load test
docker run --rm -i grafana/k6 run - <scripts/load-tests/api-load-test.js

# Run a specific performance test scenario
docker run --rm -i grafana/k6 run - <scripts/load-tests/narrative-analysis-load.js
```

## Writing Tests

### Unit Tests

Unit tests use Jest as the testing framework.

```typescript
// Example unit test for a utility function
import { calculateNarrativeStrength } from '../utils/narrative-utils';

describe('calculateNarrativeStrength', () => {
  it('should return 0 for empty input', () => {
    expect(calculateNarrativeStrength([])).toBe(0);
  });
  
  it('should calculate strength correctly', () => {
    const mockContents = [
      { engagementMetrics: { likes: 10, shares: 5 } },
      { engagementMetrics: { likes: 20, shares: 10 } }
    ];
    expect(calculateNarrativeStrength(mockContents)).toBeCloseTo(0.45);
  });
});
```

### Integration Tests

Integration tests verify component interactions.

```typescript
// Example integration test for content ingestion
import { ContentStorageService } from '../services/content-storage.service';
import { AnalysisService } from '../services/analysis.service';

describe('Content Ingestion Flow', () => {
  let contentStorage: ContentStorageService;
  let analysisService: AnalysisService;
  
  beforeAll(async () => {
    // Set up services with test configuration
    contentStorage = new ContentStorageService(testConfig);
    analysisService = new AnalysisService(testConfig);
  });
  
  it('should process content through the pipeline', async () => {
    // Create test content
    const content = {
      id: 'test-content-1',
      text: 'This is a test post about climate change',
      sourceId: 'test-source-1'
    };
    
    // Ingest content
    await contentStorage.ingestContent(content);
    
    // Wait for analysis to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify analysis results
    const analysisResult = await analysisService.getContentAnalysis(content.id);
    expect(analysisResult).toBeDefined();
    expect(analysisResult.topics).toContain('climate');
  });
});
```

### End-to-End Tests

End-to-end tests use Cypress to test the full application.

```javascript
// Example E2E test for narrative visualization
describe('Narrative Visualization', () => {
  beforeEach(() => {
    cy.visit('/narratives');
  });
  
  it('should display narrative flow visualization', () => {
    cy.get('[data-testid="narrative-list"]').should('be.visible');
    cy.get('[data-testid="narrative-item"]').first().click();
    cy.get('[data-testid="narrative-flow-visualization"]').should('be.visible');
    cy.get('[data-testid="consensus-band"]').should('exist');
    cy.get('[data-testid="narrative-branch"]').should('have.length.at.least', 1);
  });
  
  it('should allow interaction with narrative branches', () => {
    cy.get('[data-testid="narrative-item"]').first().click();
    cy.get('[data-testid="narrative-branch"]').first().click();
    cy.get('[data-testid="branch-details"]').should('be.visible');
    cy.get('[data-testid="branch-content-list"]').should('exist');
  });
});
```

## Test Data

### Mock Data

Mock data is used for testing and development. You can generate mock data using:

```bash
node scripts/generate-mock-data.js
```

This creates mock data in the `data/mock` directory, including:
- Sources (social media accounts, news sites)
- Content (posts, articles)
- Narratives and branches
- Relationships between entities

### Test Fixtures

Test fixtures are located in the `test/fixtures` directory and include:
- Sample API responses
- Test database snapshots
- Configuration files for testing

## Continuous Integration

The project uses GitHub Actions for continuous integration:

1. **Pull Request Checks**: Run unit and integration tests for each PR
2. **Main Branch Checks**: Run all tests, including E2E and performance tests
3. **Nightly Builds**: Run extended test suites and performance benchmarks

## Debugging Tests

### Debugging Unit Tests

```bash
# Run tests in debug mode
node --inspect-brk node_modules/.bin/jest --runInBand path/to/test-file.spec.ts
```

Then connect to the debugger using Chrome DevTools or your IDE.

### Debugging E2E Tests

```bash
# Open Cypress UI for interactive debugging
npx cypress open
```

## Performance Testing Guidelines

When writing performance tests:

1. Define clear performance metrics (response time, throughput, etc.)
2. Create realistic test scenarios based on expected usage
3. Establish baseline performance expectations
4. Test with various load levels (normal, peak, stress)
5. Monitor resource usage during tests (CPU, memory, network)

Example performance test script:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },  // Ramp up to 50 users
    { duration: '3m', target: 50 },  // Stay at 50 users
    { duration: '1m', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
  },
};

export default function() {
  const res = http.get('http://localhost:4000/api/narratives');
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });
  
  sleep(1);
}
```

## Test Coverage

The project aims for:
- 80%+ unit test coverage
- Key workflows covered by integration tests
- Critical user journeys covered by E2E tests

To view test coverage:

```bash
npm test -- --coverage
```

Coverage reports are generated in the `coverage` directory. 