# Veritas Development Documentation

This directory contains technical documentation for developers working on the Veritas system.

**Last Updated: [Current Date]**

## Documentation Structure

### Core Concepts

- [Project Structure](./project-structure.md) - Overview of the project's file and directory organization
- [Development Environment](./development-environment.md) - Comprehensive guide for setting up and running the project locally
- [Testing](./testing.md) - Testing strategies and frameworks used in the project

### API and Data

- [API Documentation](./api-docs.md) - Detailed API endpoint documentation
- [Data Model](./data-model.md) - Current data model documentation
- [Anonymized Data Model](./anonymized-data-model.md) - The anonymized data model for the transform-on-ingest architecture
- [Data Ingestion Architecture](./data-ingestion-architecture.md) - Overview of the data ingestion process

### Architecture and Design

- [Transform-on-Ingest Architecture](./transform-on-ingest-consolidated.md) - Comprehensive documentation of the transform-on-ingest architecture
- [Narrative Repository Pattern](./narrative-repository-pattern.md) - Explains the repository pattern used for narrative insights
- [Data Deletion Strategy](./data-deletion-strategy.md) - Data retention and deletion strategy
- [GraphQL Integration](./transform-on-ingest-graphql.md) - Details how GraphQL integrates with the transform-on-ingest architecture

## Transform-on-Ingest Architecture

Veritas is built with a transform-on-ingest architecture for social media data to ensure compliance with platform terms of service while enabling robust narrative analysis capabilities.

### Key Documents

1. **[Transform-on-Ingest Architecture](./transform-on-ingest-consolidated.md)** - Provides a comprehensive overview of the transform-on-ingest architecture, including principles, components, implementation details, and code examples.

2. **[Anonymized Data Model](./anonymized-data-model.md)** - Describes the data model that focuses on anonymized narrative insights rather than raw social media content.

3. **[Data Deletion Strategy](./data-deletion-strategy.md)** - Explains how the transform-on-ingest architecture handles data deletion requests and minimizes deletion obligations.

4. **[Narrative Repository Pattern](./narrative-repository-pattern.md)** - Explains the repository pattern used for narrative insights and its advantages over direct database access.

5. **[GraphQL Integration](./transform-on-ingest-graphql.md)** - Details how the GraphQL API has been integrated with the transform-on-ingest architecture to maintain security.

### Core Principles

The transform-on-ingest architecture is built on the following principles:

1. **No Raw Data Storage** - Raw data from platforms never persists in our system
2. **True Anonymization** - Cryptographic techniques make it mathematically impossible to reverse-engineer identities
3. **Focus on Patterns** - The system stores narrative patterns and trends, not individual content
4. **Generalized Attribution** - Source consistency is maintained without identifiability
5. **No Cross-Platform Linkage** - Different cryptographic salts for different platforms prevent cross-referencing identities

### Key Benefits for Narrative Analysis

This architecture provides significant benefits for narrative analysis:

1. **Narrative Integrity** - Anonymized model preserves narrative patterns even when platform data is deleted
2. **Pattern Focus** - System is optimized for detecting trends rather than storing individual content
3. **Compliance by Design** - System inherently meets platform terms rather than requiring ongoing modifications
4. **Enhanced Privacy** - Analysis can proceed without compromising individual privacy

## Quick Start

For a quick start with local development, follow these steps:

1. **Set up the local environment**:
   ```bash
   # Clone the repository
   git clone https://github.com/your-org/veritas.git
   cd veritas
   
   # Install dependencies
   npm install
   
   # Start the development environment with Docker Compose
   docker-compose -f docker-compose.dev.yml up
   ```

2. **Generate mock data**:
   ```bash
   # Generate mock data
   npm run generate-mock-data
   ```

3. **Access the services**:
   - Frontend: http://localhost:3000
   - API: http://localhost:4000
   - Memgraph UI: http://localhost:7687
   - Redis Commander: http://localhost:8081
   - Kafka UI: http://localhost:8080

For more detailed setup instructions, see the [Development Environment](./development-environment.md) guide.

## Development Workflow

1. Make changes to the code
2. Test your changes locally
3. Write tests for your changes
4. Submit a pull request

## Documentation Status

For information about the status of documentation files, including which documents have been consolidated or need updates, see the [Documentation Audit](../documentation-audit.md).

## Contributing

Please see the [Contributing Guide](../contributing.md) for information on how to contribute to the Veritas project. 