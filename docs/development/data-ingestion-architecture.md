# Data Ingestion Architecture

**Status: Current**  
**Last Updated: [Current Date]**

> **Note**: This document provides a high-level overview of the data ingestion architecture. For detailed information about the transform-on-ingest architecture, please refer to the [Transform-on-Ingest Architecture and Implementation](./transform-on-ingest-consolidated.md) document.

## Overview

Veritas implements a transform-on-ingest architecture for data ingestion. This approach ensures that raw identifiable data from social media platforms is never persisted in our system. Instead, all data is immediately transformed into anonymized, non-identifiable insights during the ingestion process.

## Core Components

1. **Platform Connectors**: Interface with social media APIs and stream data to the transformation pipeline
2. **Transform-on-Ingest Service**: Processes raw data and produces anonymized insights
3. **Secure Hashing Service**: Provides cryptographically secure, irreversible hashing
4. **Narrative Repository**: Stores anonymized insights and provides aggregation capabilities

## Data Flow

```
┌──────────────────┐     ┌───────────────────┐     ┌──────────────────┐
│                  │     │                   │     │                  │
│  Platform API    │────▶│ Connector         │────▶│ In-Memory Buffer │
│  (Meta, Twitter) │     │ (No Storage)      │     │ (Temporary)      │
└──────────────────┘     └───────────────────┘     └────────┬─────────┘
                                                            │
                                                            ▼
┌──────────────────┐     ┌───────────────────┐     ┌──────────────────┐
│                  │     │                   │     │                  │
│  Database        │◀────│ Anonymized        │◀────│ Transformation   │
│  (No Raw Data)   │     │ Narrative Insights│     │ Pipeline         │
└──────────────────┘     └───────────────────┘     └──────────────────┘
        │
        ▼
┌──────────────────┐     ┌───────────────────┐     ┌──────────────────┐
│                  │     │                   │     │                  │
│  Aggregation     │────▶│ Trend Analysis    │────▶│ Visualization    │
│  Engine          │     │ Models            │     │ Layer            │
└──────────────────┘     └───────────────────┘     └──────────────────┘
```

1. Platform connectors fetch data from social media APIs
2. Data is held in memory only, never persisted to disk
3. The transform service converts raw data to anonymized insights
4. Only fully anonymized data is stored in the database
5. Insights are aggregated into trends for analysis
6. Trends and patterns are presented through the UI

## Related Documentation

For more detailed information, please refer to the following documents:

1. [Transform-on-Ingest Architecture and Implementation](./transform-on-ingest-consolidated.md) - Comprehensive documentation of the transform-on-ingest architecture
2. [Anonymized Data Model](./anonymized-data-model.md) - Details of the anonymized data model
3. [Data Deletion Strategy](./data-deletion-strategy.md) - How data deletion is handled in this architecture
4. [Narrative Repository Pattern](./narrative-repository-pattern.md) - The repository pattern used for narrative insights 