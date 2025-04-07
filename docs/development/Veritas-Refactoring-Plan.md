# Veritas System Refactoring Plan

## Overview

This document outlines a comprehensive plan for refactoring the Veritas codebase to align with the transform-on-ingest architecture, consolidate duplicated code, clarify library responsibilities, and implement proper database connectivity.

## Background & Current State

The Veritas system is designed to track and analyze narratives across digital platforms. The system has evolved from storing raw data to a privacy-focused architecture that anonymizes data at ingestion time (transform-on-ingest pattern).

**Current Issues:**
- Multiple mock database implementations
- Confusion between Memgraph and MongoDB usage
- Type definition duplication across modules
- Unclear service boundaries
- Local mocks instead of proper dependency injection
- Placeholder libraries with minimal implementation

## Database Architecture

### Multi-Database Strategy

The Veritas system will use a multi-database architecture with clear role separation:

1. **MongoDB**: Primary storage for anonymized data
   - Stores `NarrativeInsight` documents representing anonymized content
   - Stores `NarrativeTrend` documents representing aggregated trends
   - Handles time-series data and aggregation
   - Provides efficient document retrieval and flexible schema

2. **Memgraph**: Relationship analysis engine
   - Stores graph representation of narratives, sources, and content
   - Enables path finding and network analysis
   - Facilitates pattern recognition in information flow
   - Supports complex relationship queries

3. **Redis**: Caching and performance optimization
   - Caches frequent query results
   - Stores temporary processing data
   - Handles rate limiting and distributed locking
   - Manages session data and authentication tokens

### Database Rationale

This multi-database approach provides several advantages:

- **Complementary Strengths**: Each database is used for what it does best
- **Performance Optimization**: Queries can be directed to the appropriate database
- **Data Volume Management**: Document storage for bulk data, graph storage for relationships
- **Separation of Concerns**: Storage vs. analysis separation
- **Query Flexibility**: Different analysis needs served by specialized databases

## Refactoring Roadmap

### Phase 1: Database Library Refactoring

#### 1.1 Create Modular Database Architecture
- Define provider interfaces for each database type
- Implement adapter pattern for database operations
- Create repository interfaces for each entity type

#### 1.2 Implement MongoDB Adapter
- Create MongoDB connection management
- Implement Mongoose schemas for core entities
- Build repository implementations for MongoDB
- Add transaction support and error handling

#### 1.3 Implement Memgraph Adapter
- Create Memgraph connection management
- Define Cypher query templates for common operations
- Implement graph data mapping
- Build repository implementations for Memgraph

#### 1.4 Implement Redis Adapter
- Create Redis connection management
- Define caching strategies and TTL policies
- Implement key generation and serialization
- Build cache repository implementations

#### 1.5 Create Database Module
- Build dynamic module configuration
- Implement factory providers for repositories
- Add health checks and connection monitoring
- Create comprehensive testing suite

### Phase 2: Type Definition Consolidation

#### 2.1 Audit Existing Types
- Identify all type definitions across codebase
- Document duplications and inconsistencies
- Map type relationships and dependencies

#### 2.2 Consolidate Core Types
- Move all core entity interfaces to shared/types
- Ensure consistent naming and structure
- Add proper documentation for all types
- Create test cases for type validation

#### 2.3 Consolidate Schema Definitions
- Move MongoDB schema definitions to shared/types
- Align schemas with core interfaces
- Remove duplicate definitions from other libraries
- Add schema validation utilities

#### 2.4 Create GraphQL Type Definitions
- Generate GraphQL types from core interfaces
- Ensure type compatibility across layers
- Add InputType variants for mutations
- Create field resolver utilities

### Phase 3: Service Integration Clarification

#### 3.1 Define Service Boundaries
- Document clear responsibilities for each library
- Define service interfaces with proper typing
- Create dependency graphs for services
- Identify integration points and contracts

#### 3.2 Implement Proper Dependency Injection
- Replace local mocks with proper DI
- Use NestJS providers consistently
- Create factory functions for configurable services
- Add optional dependency handling

#### 3.3 Standardize Error Handling
- Create custom error hierarchy
- Implement consistent error propagation
- Add error transformation for API responses
- Create error logging and monitoring

#### 3.4 Improve Service Integration Testing
- Add integration tests for service interactions
- Create test utilities for service mocking
- Implement end-to-end testing for critical flows
- Add performance benchmarking

### Phase 4: Library-Specific Improvements

#### 4.1 Content Classification Library
- Remove local database implementations
- Focus on classification algorithms
- Implement proper DI for database services
- Add comprehensive unit testing

#### 4.2 Ingestion Library
- Strengthen transform-on-ingest implementation
- Remove deprecated code paths
- Ensure compliance with anonymized data model
- Improve error handling and retry mechanisms

#### 4.3 API Application
- Remove database-specific code
- Implement proper authentication and authorization
- Add robust error handling
- Focus on orchestration rather than implementation

#### 4.4 Shared Utils Library
- Identify commonly needed utilities
- Implement organized utility categories
- Add comprehensive testing
- Extract existing utilities from other libraries

## Implementation Priorities

1. **Database Architecture** (Highest)
   - Define clear database roles and responsibilities
   - Implement real database connections
   - Replace mock implementations

2. **Type System Consolidation** (High)
   - Create single source of truth for types
   - Ensure consistency across the codebase
   - Remove duplication

3. **Service Integration** (Medium)
   - Define clear service boundaries
   - Implement proper dependency injection
   - Standardize error handling

4. **Library-Specific Improvements** (Variable)
   - Focus on critical path libraries first
   - Address highest-impact issues
   - Improve testing coverage

## Detailed Tasks

### Database Library

```typescript
// Example provider interface
export interface DatabaseProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getRepository<T>(entityName: string): Repository<T>;
}

// Example repository interface
export interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findMany(query: Record<string, any>, options?: FindOptions): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

// MongoDB implementation
export class MongoDBProvider implements DatabaseProvider {
  // Implementation
}

// Memgraph implementation
export class MemgraphProvider implements DatabaseProvider {
  // Implementation
}
```

### Content Classification Library

```typescript
// Example service with proper DI
@Injectable()
export class ContentClassificationService {
  constructor(
    @Inject('DATABASE_PROVIDER')
    private readonly databaseProvider: DatabaseProvider,
    private readonly configService: ConfigService,
  ) {}

  // Service methods
}
```

### Shared Types Library

```typescript
// Example type organization
// Entity interfaces
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NarrativeInsight extends BaseEntity {
  // Properties
}

// MongoDB schemas
export const NarrativeInsightSchema = new Schema<NarrativeInsight>({
  // Schema definition
});

// GraphQL types
@ObjectType('NarrativeInsight')
export class NarrativeInsightType implements Partial<NarrativeInsight> {
  // GraphQL fields
}
```

## Testing Strategy

1. **Unit Testing**
   - Test individual components in isolation
   - Mock dependencies appropriately
   - Focus on business logic and error cases

2. **Integration Testing**
   - Test integration between services
   - Use test containers for database testing
   - Verify data flow and transformations

3. **End-to-End Testing**
   - Test critical system flows
   - Verify API contracts
   - Test authentication and authorization

## Documentation Requirements

1. **Code Documentation**
   - JSDoc comments for all public APIs
   - Interface and type documentation
   - Example usage in comments

2. **Architecture Documentation**
   - Service interaction diagrams
   - Data flow documentation
   - Database schema documentation

3. **README Updates**
   - Clear library purpose statements
   - Usage examples
   - Configuration options

## Monitoring & Quality Metrics

1. **Code Quality**
   - Maintain consistent code style
   - Enforce lint rules
   - Track test coverage

2. **Performance Metrics**
   - Database query performance
   - API response times
   - Resource utilization

3. **Error Monitoring**
   - Track error rates
   - Monitor exception patterns
   - Set up alerting for critical issues

## Timeline and Milestones

### Milestone 1: Database Architecture (2 weeks)
- Database provider interfaces defined
- MongoDB implementation complete
- Basic repository pattern implemented

### Milestone 2: Type Consolidation (1 week)
- Core types moved to shared/types
- MongoDB schemas aligned with interfaces
- Duplication removed from other libraries

### Milestone 3: Service Integration (2 weeks)
- Clear service boundaries defined
- Proper DI implemented across libraries
- Error handling standardized

### Milestone 4: Library Improvements (3 weeks)
- Content classification library refactored
- Ingestion library strengthened
- API application improved
- Utilities library developed

## Conclusion

This refactoring plan provides a structured approach to improving the Veritas codebase, focusing on clarifying architecture, removing duplication, implementing proper database connections, and improving overall code quality. By following this plan, the team can create a more maintainable, robust, and performant system that aligns with the transform-on-ingest architecture and privacy-focused design principles. 