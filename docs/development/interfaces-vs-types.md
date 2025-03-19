# Interfaces vs Types in the Veritas Codebase

## Overview

The Veritas codebase maintains a distinction between `interfaces/` and `types/` directories. This document explains the reasoning behind this separation and provides guidelines for when to use each.

## Key Differences

| Feature | Interfaces | Types |
|---------|------------|-------|
| **Purpose** | Define contracts for system components | Define data structures and GraphQL schemas |
| **Usage** | Classes implement interfaces | Data conforms to types |
| **Extension** | Can be extended and merged | Can use unions, intersections, utility types |
| **Framework Integration** | More common in OOP patterns | Used extensively with GraphQL/NestJS decorators |

## When to Use Interfaces

Place code in the `interfaces/` directory when:

- Defining contracts that classes will implement
- Creating abstractions for system components (repositories, services, connectors)
- Establishing patterns that multiple implementations will follow
- Working with dependency injection and inversion of control

Examples in the codebase:
- `SocialMediaConnector` interface
- `TransformOnIngestConnector` interface
- `NarrativeRepository` abstract class
- `NarrativeInsight` and `NarrativeTrend` data structures

## When to Use Types

Place code in the `types/` directory when:

- Working with GraphQL schemas and decorators
- Defining input/output DTOs for API operations
- Creating utility types and type transformations
- Defining enum values and constants

Examples in the codebase:
- `VerificationStatus` enum
- `ContentIngestionInput` and `SourceIngestionInput` classes
- GraphQL type definitions (`NarrativeInsightType`, etc.)
- Mock type implementations for testing

## Type and Interface Relationships

In many cases, types and interfaces work together:

1. An interface defines the core data structure (`NarrativeInsight`)
2. A type defines how it's exposed in GraphQL (`NarrativeInsightType`)
3. Input types define how data enters the system (`ContentIngestionInput`)

## Best Practices

- Keep interfaces focused on contracts/behaviors
- Use types for data structures and schema definitions
- Maintain consistent exports in index.ts files
- Document the purpose of each interface and type
- Consider whether a class should implement an interface or extend a type

By following these guidelines, we maintain a clear separation of concerns in our codebase and improve developer understanding of the system architecture. 