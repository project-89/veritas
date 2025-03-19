# Transform-on-Ingest Architecture

## Core Components

### Narrative Repository Layer

A key component of the transform-on-ingest architecture is the Narrative Repository, which provides a uniform interface for storing and retrieving transformed narrative insights:

```
┌─────────────────────────┐
│                         │
│  Social Media Connector │
│                         │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│                         │
│ Transform-on-Ingest     │
│ Service                 │
│                         │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│                         │
│  Narrative Repository   │──────┐
│                         │      │
└─────────────────────────┘      │
                                 ▼
                         ┌───────────────┐
                         │               │
                         │  Database     │
                         │               │
                         └───────────────┘
```

The Narrative Repository:

1. Provides methods for storing and retrieving transformed insights
2. Implements compliance requirements like data retention policies
3. Supports trend analysis through aggregation methods
4. Abstracts the underlying storage implementation

For more information, see [Narrative Repository Pattern](./narrative-repository-pattern.md). 