# Transform-on-Ingest Architecture and Implementation

**Status: Current**  
**Last Updated: [Current Date]**

## Overview

The transform-on-ingest architecture is a core component of the Veritas system that ensures privacy, compliance, and data protection by design. This architecture transforms social media data during ingestion, storing only anonymized narrative insights rather than raw platform data.

Since Veritas is built from the ground up with this architecture, we maintain privacy and compliance by design rather than as an afterthought.

## Core Principles

1. **No Raw Data Storage** - Raw data from platforms never persists in our system
2. **True Anonymization** - Cryptographic techniques make it mathematically impossible to reverse-engineer identities
3. **Focus on Patterns** - The system stores narrative patterns and trends, not individual content
4. **Generalized Attribution** - Source consistency is maintained without identifiability
5. **No Cross-Platform Linkage** - Different cryptographic salts for different platforms prevent cross-referencing identities

## Architecture Overview

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

## Core Components

### 1. Secure Hashing Service

**Location**: `libs/shared/src/services/secure-hash.service.ts`

**Purpose**: Provides cryptographically secure, irreversible hashing with salt management.

**Key Features**:
- Double-blind hashing mechanism
- Content fingerprinting
- Automatic salt rotation
- Salt storage and retrieval

### 2. Transform-on-Ingest Service

**Location**: `libs/ingestion/src/lib/services/transform/transform-on-ingest.service.ts`

**Purpose**: Transforms raw platform data into anonymized insights during ingestion.

**Key Features**:
- Secure one-way hashing of content and source identifiers
- Built-in salt rotation for enhanced security
- Platform-specific data extraction logic
- Text analysis for extracting themes and sentiment
- Engagement scoring normalization

**Example Usage**:
```typescript
// Inside a connector
const rawData = await this.fetchRawData();
const insights = await this.transformService.transform(rawData, 'facebook');
// Only insights are stored, raw data remains in memory only
```

### 3. Salt Repository

**Location**: `libs/shared/src/repositories/salt.repository.ts`

**Purpose**: Manages storage and rotation of cryptographic salts.

**Key Features**:
- Salt storage schema
- Salt rotation mechanism
- Historical salt management
- Platform-specific salt segregation

### 4. Narrative Repository

**Location**: `libs/ingestion/src/lib/repositories/narrative-insight.repository.ts`

**Purpose**: Provides a uniform interface for storing and retrieving transformed narrative insights.

**Key Features**:
- Methods for storing and retrieving transformed insights
- Implementation of compliance requirements like data retention policies
- Support for trend analysis through aggregation methods
- Abstraction of the underlying storage implementation

### 5. Enhanced Platform Connectors

The platform connectors implement both the original interface (for backward compatibility) and the enhanced transform-on-ingest interface:

#### 5.1 Facebook Connector

**Location**: `libs/ingestion/src/lib/services/facebook.connector.ts`

**Key Features**:
- Dual interface implementation (both original and transform-on-ingest)
- In-memory data handling only
- Enhanced methods that return anonymized insights
- Streaming support with real-time transformation

#### 5.2 Twitter Connector

**Location**: `libs/ingestion/src/lib/services/twitter.connector.ts`

**Key Features**:
- Uses Twitter API v2 for data retrieval
- Enriches tweet data with user information
- Implements streaming through polling with immediate transformation
- Handles retweets, quotes, and replies consistently

#### 5.3 Reddit Connector

**Location**: `libs/ingestion/src/lib/services/reddit.connector.ts`

**Key Features**:
- Uses Snoowrap for Reddit API integration
- Handles both submissions and comments
- Calculates engagement scores based on upvote ratio and comment counts
- Enriches Reddit submissions with subreddit information

### 6. TransformOnIngestConnector Interface

**Location**: `libs/ingestion/src/lib/interfaces/transform-on-ingest-connector.interface.ts`

**Purpose**: Defines the enhanced connector interface that extends the original while adding transform-on-ingest methods.

**Key Features**:
- Extends the original `SocialMediaConnector` interface
- Adds `searchAndTransform` and `streamAndTransform` methods
- Ensures backward compatibility

### 7. NarrativeInsight Data Model

**Location**: `libs/ingestion/src/types/narrative-insight.interface.ts`

**Purpose**: Defines the structure for anonymized insights derived from social media content.

**Key Features**:
- Content and source hashes for anonymized tracking
- Sentiment and theme analysis
- Engagement and narrative impact scoring
- No personally identifiable information

## Implementation Details

### Hashing Strategy

The implementation uses a double-blind hashing approach:

1. **Content Hashing**:
   ```typescript
   // First hash with content-specific salt
   const contentSalt = crypto.createHash('sha256')
     .update(content.substring(0, 10))
     .digest('hex');
   
   // Double hash with service salt
   return crypto.createHash('sha256')
     .update(content + contentSalt + this.salt)
     .digest('hex');
   ```

2. **Source Hashing**:
   ```typescript
   // Hash with service salt to prevent identification
   return crypto.createHash('sha256')
     .update(sourceId + platform + this.salt)
     .digest('hex');
   ```

### Automatic Salt Rotation

To enhance security, the implementation includes automatic salt rotation:

```typescript
constructor(private configService: ConfigService) {
  // Initialize salt
  this.refreshSalt();
  
  // Set up automatic salt rotation
  setInterval(() => this.refreshSalt(), this.saltRefreshInterval);
}

private refreshSalt(): void {
  this.salt = crypto.randomBytes(16).toString('hex');
  this.logger.log('Salt refreshed for transform-on-ingest service');
}
```

### Platform-Specific Transformations

The implementation accounts for platform-specific data structures:

#### Facebook
```typescript
private extractContent(data: any, platform: string): string {
  if (platform === 'facebook') {
    return data.message || '';
  }
  // ...
}
```

#### Twitter
```typescript
private enrichTweetsWithUserData(tweets: TweetV2[], includes: { users?: UserV2[] }): any[] {
  // Map Twitter data to a format suitable for transformation
  return tweets.map(tweet => ({
    ...tweet,
    user: user ? {
      id_str: user.id,
      name: user.name,
      screen_name: user.username,
      verified: user.verified
    } : undefined
  }));
}
```

#### Reddit
```typescript
private async enrichSubmissions(submissions: Submission[]): Promise<any[]> {
  // Map Reddit submissions to a format suitable for transformation
  return submissions.map(post => ({
    id: post.id,
    title: post.title,
    selftext: post.selftext,
    author: post.author.name,
    // ...additional fields
  }));
}
```

### Module Integration

The transform-on-ingest implementation is organized in a dedicated module:

```typescript
@Module({
  imports: [
    ConfigModule.forRoot(),
  ],
  providers: [
    TransformOnIngestService,
    FacebookConnector,
    TwitterConnector,
    RedditConnector,
  ],
  exports: [
    TransformOnIngestService,
    FacebookConnector,
    TwitterConnector,
    RedditConnector,
  ],
})
export class TransformOnIngestModule {}
```

This module is then imported into the main `IngestionModule`.

## Benefits for Narrative Analysis

This architecture provides significant benefits for narrative analysis:

1. **Narrative Integrity** - Anonymized model preserves narrative patterns even when platform data is deleted
2. **Pattern Focus** - System is optimized for detecting trends rather than storing individual content
3. **Compliance by Design** - System inherently meets platform terms rather than requiring ongoing modifications
4. **Enhanced Privacy** - Analysis can proceed without compromising individual privacy

## Testing Strategy

The transform-on-ingest architecture requires comprehensive testing to ensure its effectiveness:

### Unit Testing

- Test hashing functions with known inputs
- Verify salt rotation mechanism
- Test transformation rules with various content types
- Validate anonymization is irreversible

### Integration Testing

- Test full pipeline from connector to storage
- Verify no raw data is persisted anywhere
- Test API endpoints with realistic data
- Validate aggregation functions for trends

### Performance Testing

- Measure transformation overhead
- Test ingestion throughput with transformation
- Benchmark aggregation queries
- Load test with simulated high volume

### Security Testing

- Attempt re-identification attacks on anonymized data
- Test salt rotation security
- Verify secure handling of in-memory data
- Review for potential side-channel attacks

## Monitoring

Key metrics to monitor:

- Transformation processing time
- Anonymization success rate
- Salt rotation events
- Trend detection accuracy
- Memory usage during ingestion
- Aggregation query performance

## Future Enhancements

Planned enhancements to the transform-on-ingest architecture include:

1. Enhanced text analysis capabilities for better theme extraction
2. More sophisticated sentiment analysis
3. Improved entity recognition while maintaining anonymization
4. Additional platform connectors with transform-on-ingest support
5. Performance optimizations for high-volume data processing

## Related Documentation

- [Narrative Repository Pattern](./narrative-repository-pattern.md)
- [Data Deletion Strategy](./data-deletion-strategy.md)
- [GraphQL Integration](./transform-on-ingest-graphql.md)
- [Anonymized Data Model](./anonymized-data-model.md) 