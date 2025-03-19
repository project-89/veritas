# Veritas Development Documentation

This directory contains technical documentation for developers working on the Veritas system.

## Documentation Structure

### Core Concepts

- [Project Structure](./project-structure.md) - Overview of the project's file and directory organization
- [Local Development](./local-development.md) - Guide for setting up and running the project locally
- [Local Environment](./local-environment.md) - Environment configuration for development
- [Testing](./testing.md) - Testing strategies and frameworks used in the project

### API and Data

- [API Documentation](./api-docs.md) - Detailed API endpoint documentation
- [Data Model](./data-model.md) - Current data model documentation
- [Anonymized Data Model](./anonymized-data-model.md) - The anonymized data model for the transform-on-ingest architecture

### Architecture and Design

- [Data Ingestion Architecture](./data-ingestion-architecture.md) - Overview of the transform-on-ingest architecture
- [Transform-on-Ingest Implementation Plan](./transform-on-ingest-implementation-plan.md) - Detailed plan for implementing the new architecture

## Transform-on-Ingest Architecture

Veritas is being built with a transform-on-ingest architecture for social media data to ensure compliance with platform terms of service while enabling robust narrative analysis capabilities.

### Key Documents

1. **[Data Ingestion Architecture](./data-ingestion-architecture.md)** - Provides a comprehensive overview of the transform-on-ingest architecture, including principles, components, and implementation details.

2. **[Anonymized Data Model](./anonymized-data-model.md)** - Describes the data model that focuses on anonymized narrative insights rather than raw social media content.

3. **[Transform-on-Ingest Implementation Plan](./transform-on-ingest-implementation-plan.md)** - Outlines the components to be implemented and the implementation roadmap.

4. **[Transform-on-Ingest Implementation](./transform-on-ingest-implementation.md)** - Details the actual implementation of the transform-on-ingest architecture, including code samples and component documentation.

5. **[Data Deletion Strategy](./data-deletion-strategy.md)** - Explains how the transform-on-ingest architecture handles data deletion requests and minimizes deletion obligations.

6. **[Narrative Repository Pattern](./narrative-repository-pattern.md)** - Explains the repository pattern used for narrative insights and its advantages over direct database access.

7. **[GraphQL Integration](./transform-on-ingest-graphql.md)** - Details how the GraphQL API has been integrated with the transform-on-ingest architecture to maintain security.

### Core Principles

The transform-on-ingest architecture is built on the following principles:

1. **No Raw Data Storage** - Raw data from platforms never persists in our system
2. **True Anonymization** - Cryptographic techniques make it mathematically impossible to reverse-engineer identities
3. **Focus on Patterns** - The system stores narrative patterns and trends, not individual content
4. **Generalized Attribution** - Source consistency is maintained without identifiability
5. **No Cross-Platform Linkage** - Different cryptographic salts for different platforms prevent cross-referencing identities

### Building From The Start

Since Veritas is in pre-production, we're implementing this architecture from the beginning rather than migrating an existing system. This gives us several advantages:

1. **Clean Design** - No legacy constraints or backward compatibility concerns
2. **Optimized Performance** - Architecture designed for anonymization from day one
3. **Simplified Implementation** - No migration complexity or dual-system operation
4. **Cohesive Codebase** - All components built with the same architectural principles

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
   # Install required packages
   npm install @faker-js/faker
   
   # Generate mock data
   node scripts/generate-mock-data.js
   ```

3. **Access the services**:
   - Frontend: http://localhost:3000
   - API: http://localhost:4000
   - Memgraph UI: http://localhost:7687
   - Redis Commander: http://localhost:8081
   - Kafka UI: http://localhost:8080

## Development Workflow

1. Make changes to the code
2. Test your changes locally
3. Write tests for your changes
4. Submit a pull request

## Testing with Kubernetes

For testing with Kubernetes locally:

```bash
# Make the script executable
chmod +x scripts/local-k8s-deploy.sh

# Run the deployment script
./scripts/local-k8s-deploy.sh
```

## Next Steps

After setting up your local environment, you might want to:

1. Explore the [API Documentation](./api-docs.md) to understand the available endpoints
2. Review the [Anonymized Data Model](./anonymized-data-model.md) to understand the system's data structure
3. Follow the [Testing Guide](./testing.md) to learn how to test your changes

## Contributing

Please see the [Contributing Guide](../contributing.md) for information on how to contribute to the Veritas project. 