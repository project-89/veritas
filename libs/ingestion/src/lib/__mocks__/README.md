# Mock Implementations for Testing

This directory contains mock implementations of various components used for testing purposes. The mocks are organized to mirror the structure of the actual implementation, making it easy to find and use the appropriate mock for a specific test.

## Directory Structure

```
__mocks__/
  ├── services/         # Mock service implementations
  ├── resolvers/        # Mock resolver implementations
  ├── repositories/     # Mock repository implementations
  ├── types/            # Mock type implementations
  ├── dependencies/     # Mock external dependencies
  └── index.ts          # Main entry point for all mocks
```

## Usage

The mock implementations can be imported in test files using:

```typescript
import { MockContentStorageService } from '@veritas/ingestion/lib/__mocks__/services';
```

Or, alternatively, you can import all mocks at once:

```typescript
import { Mocks } from '@veritas/ingestion';
// Then use: Mocks.services.MockContentStorageService
```

## Testing Strategy

Our testing strategy emphasizes:

1. **Isolation**: Mock implementations avoid external dependencies, making tests faster and more reliable.
2. **Consistency**: Mock implementations follow the same interfaces as their real counterparts.
3. **Simplicity**: Mocks provide only the functionality necessary for testing, without complex logic.

## Available Mocks

### Services
- `MockContentStorageService`: A simplified version of ContentStorageService for testing
- `MockSocialMediaService`: A simplified version of SocialMediaService for testing

### Repositories
- `MockNarrativeRepository`: A simplified in-memory implementation of NarrativeRepository

### Resolvers
- `MockIngestionResolver`: A simplified version of IngestionResolver for testing

### Types
- `mock-class-validator`: Simplified implementation of class-validator
- `mock-class-transformer`: Simplified implementation of class-transformer
- `mock-nestjs-graphql`: Simplified implementation of NestJS GraphQL decorators
- `mock-graphql.types`: Mock GraphQL type definitions
- `mock-ingestion.types`: Mock ingestion type definitions

## Best Practices

When writing tests with these mocks:

1. **Use the closest mock to your needs**: Choose the mock that most closely matches your test requirements.
2. **Don't test implementation details**: Focus on testing the public API and behavior, not internal implementation.
3. **Keep tests focused**: Each test should verify a single aspect of behavior.
4. **Use consistent patterns**: Follow the patterns established in the existing tests.

## Contributing

When adding new mock implementations:

1. Follow the same directory structure as the actual implementation
2. Create comprehensive tests for your mock implementation
3. Update the relevant index.ts files to export your new mock
4. Document your mock in this README.md file 