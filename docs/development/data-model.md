# Veritas Data Model

**Status: Current**  
**Last Updated: [Current Date]**

This document describes the data model used in the Veritas system for storing and analyzing narrative data.

> **Note**: This document describes the current implementation of the data model. For information on the anonymized data model used with the transform-on-ingest architecture, please refer to the [Anonymized Data Model](./anonymized-data-model.md) document.

## Overview

The Veritas system uses a graph database (Memgraph) to store and analyze relationships between content, sources, and narratives. The graph model allows for efficient traversal of relationships and pattern detection.

With the implementation of the transform-on-ingest architecture, all data is anonymized during ingestion, ensuring that no identifiable information is stored in its raw form.

## Core Entities

### Node Types

#### Source Node

Represents an anonymized source of content, such as a social media account, news site, or blog.

```typescript
interface SourceNode {
  id: string;  // Anonymized identifier
  type: 'source';
  sourceHash: string;  // Secure hash of the original source identifier
  platform: string;  // 'twitter', 'reddit', 'facebook', 'news', etc.
  verified: boolean;
  credibilityScore: number;  // 0.0 to 1.0
  followerCategory?: string;  // Categorized as 'small', 'medium', 'large', 'massive'
  verificationStatus: 'verified' | 'unverified' | 'suspicious';
  metadata?: Record<string, any>;  // Non-identifying metadata
}
```

#### Content Node

Represents anonymized content, such as a social media post, article, or comment.

```typescript
interface ContentNode {
  id: string;  // Anonymized identifier
  type: 'content';
  contentType: string;  // 'post', 'article', 'comment', 'reply', etc.
  contentFingerprint: string;  // Secure hash of the content
  sourceId: string;  // Reference to the anonymized source
  publishedTimeframe: string;  // Generalized timeframe (e.g., '2023-Q2-W3-evening')
  engagementCategory?: string;  // Categorized as 'low', 'medium', 'high', 'viral'
  text: string;
  url?: string;
  publishedAt: string;  // ISO date string
  engagementMetrics?: {
    likes?: number;
    shares?: number;
    comments?: number;
    views?: number;
  };
  sentiment?: number;  // -1.0 to 1.0
  entities?: Array<{
    name: string;
    type: string;  // 'person', 'organization', 'location', 'event', etc.
    sentiment?: number;
  }>;
  topics?: string[];
  metadata?: Record<string, any>;
}
```

#### Narrative Node

Represents a narrative or story that emerges from content.

```typescript
interface NarrativeNode {
  id: string;
  type: 'narrative';
  title: string;
  description: string;
  createdAt: string;  // ISO date string
  updatedAt: string;  // ISO date string
  strength: number;  // 0.0 to 1.0
  topics: string[];
  sentiment?: number;  // -1.0 to 1.0
  contentCount: number;
  sourceCount: number;
  metadata?: Record<string, any>;
}
```

#### Branch Node

Represents a branch or divergence from a main narrative.

```typescript
interface BranchNode {
  id: string;
  type: 'branch';
  narrativeId: string;  // Reference to the parent narrative
  parentId?: string;  // Reference to parent branch (if a sub-branch)
  title: string;
  description: string;
  createdAt: string;  // ISO date string
  divergencePoint: string;  // ISO date string when the branch diverged
  strength: number;  // 0.0 to 1.0
  topics: string[];
  sentiment?: number;  // -1.0 to 1.0
  contentCount: number;
  sourceCount: number;
  metadata?: Record<string, any>;
}
```

### Edge Types

#### PUBLISHED

Connects a source to the content it published.

```typescript
interface PublishedEdge {
  from: string;  // Source ID
  to: string;    // Content ID
  type: 'PUBLISHED';
  timestamp: string;  // ISO date string
}
```

#### CONTRIBUTES_TO

Connects content to a narrative it contributes to.

```typescript
interface ContributesToEdge {
  from: string;  // Content ID
  to: string;    // Narrative ID
  type: 'CONTRIBUTES_TO';
  strength: number;  // 0.0 to 1.0
  timestamp: string;  // ISO date string
}
```

#### BRANCHES_FROM

Connects a branch to its parent narrative or branch.

```typescript
interface BranchesFromEdge {
  from: string;  // Branch ID
  to: string;    // Narrative ID or parent Branch ID
  type: 'BRANCHES_FROM';
  divergenceStrength: number;  // 0.0 to 1.0
  timestamp: string;  // ISO date string
}
```

#### REFERENCES

Connects content to other content it references.

```typescript
interface ReferencesEdge {
  from: string;  // Content ID
  to: string;    // Content ID
  type: 'REFERENCES';
  referenceType: 'quote' | 'reply' | 'retweet' | 'link';
  timestamp: string;  // ISO date string
}
```

## Data Storage

### Graph Database (Memgraph)

The primary storage for the graph data model is Memgraph, which stores nodes and edges with their properties.

Example Cypher query to create a source node:

```cypher
CREATE (s:Source {
  id: 'source-123',
  type: 'source',
  name: 'Example News',
  platform: 'news',
  url: 'https://example.com',
  verified: true,
  credibilityScore: 0.85,
  createdAt: '2023-01-15T12:00:00Z',
  verificationStatus: 'verified'
})
```

Example Cypher query to create a content node and connect it to its source:

```cypher
MATCH (s:Source {id: 'source-123'})
CREATE (c:Content {
  id: 'content-456',
  type: 'content',
  contentType: 'article',
  text: 'This is an example article about climate change.',
  sourceId: 'source-123',
  url: 'https://example.com/article-1',
  publishedAt: '2023-06-10T15:30:00Z',
  sentiment: 0.2
}),
(s)-[:PUBLISHED {timestamp: '2023-06-10T15:30:00Z'}]->(c)
```

### Cache (Redis)

Redis is used for caching frequently accessed data and for temporary storage during processing.

Example Redis data structure for a cached content node:

```
Key: content:content-456
Value: {JSON representation of the content node}
```

Example Redis data structure for a narrative's content list:

```
Key: narrative:narrative-789:contents
Value: [content-456, content-457, content-458, ...]
```

## Data Flow

1. **Ingestion**: Content is ingested from various sources and stored as content nodes
2. **Analysis**: Content is analyzed to extract entities, sentiment, and topics
3. **Narrative Detection**: Narratives are detected based on content similarities and relationships
4. **Branch Detection**: Branches are identified when narratives diverge
5. **Visualization**: The graph data is transformed for visualization in the frontend

## Schema Evolution

The schema is designed to be flexible and extensible:

1. **Node Properties**: Additional properties can be added to nodes without affecting existing queries
2. **Edge Types**: New edge types can be introduced to represent new types of relationships
3. **Metadata**: The `metadata` field allows for storing additional data without schema changes

## Data Retention

Data retention policies are implemented at different levels:

1. **Raw Content**: Stored for 90 days by default
2. **Aggregated Data**: Stored for 1 year
3. **Narrative Structures**: Stored indefinitely
4. **Historical Snapshots**: Created for long-term analysis

## Example Queries

### Find all content from a specific source

```cypher
MATCH (s:Source {id: 'source-123'})-[:PUBLISHED]->(c:Content)
RETURN c
ORDER BY c.publishedAt DESC
LIMIT 100
```

### Find narratives related to a specific topic

```cypher
MATCH (n:Narrative)
WHERE 'climate' IN n.topics
RETURN n
ORDER BY n.strength DESC
```

### Find content contributing to a narrative

```cypher
MATCH (c:Content)-[r:CONTRIBUTES_TO]->(n:Narrative {id: 'narrative-789'})
RETURN c, r.strength
ORDER BY r.strength DESC
LIMIT 50
```

### Find branches of a narrative

```cypher
MATCH (b:Branch)-[:BRANCHES_FROM]->(n:Narrative {id: 'narrative-789'})
RETURN b
ORDER BY b.divergencePoint
```

## Visualization Data Structures

For visualization purposes, the graph data is transformed into specialized structures:

### Narrative Flow Data

```typescript
interface NarrativeFlowData {
  id: string;
  title: string;
  description: string;
  timeRange: [string, string];  // [startDate, endDate]
  consensusBand: ConsensusBand;
  branches: NarrativeBranch[];
  connections: NarrativeConnection[];
  events: NarrativeEvent[];
}
```

### Consensus Band

```typescript
interface ConsensusBand {
  points: NarrativePoint[];
  upperBound: NarrativePoint[];
  lowerBound: NarrativePoint[];
  strength: number;
}
```

### Narrative Branch

```typescript
interface NarrativeBranch {
  id: string;
  parentId?: string;
  title: string;
  divergencePoint: string;  // ISO date string
  points: NarrativePoint[];
  strength: number;
  sentiment: number;
}
```

### Narrative Point

```typescript
interface NarrativePoint {
  date: string;  // ISO date string
  value: number;  // Position on the y-axis
  strength: number;  // 0.0 to 1.0
  contentCount: number;
}
```

## Data Security

1. **Access Control**: Role-based access control for different parts of the data model
2. **Encryption**: Sensitive data is encrypted at rest and in transit
3. **Anonymization**: Personal identifiers can be anonymized for certain analysis tasks
4. **Audit Logging**: All data modifications are logged for audit purposes 