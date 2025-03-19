# Transform-on-Ingest Implementation

This document outlines the specific implementation details for the transform-on-ingest architecture in the Veritas system.

## Core Components Implemented

### 1. TransformOnIngestService

**Location**: `libs/ingestion/src/lib/services/transform/transform-on-ingest.service.ts`

**Purpose**: Transforms raw social media data into anonymized narrative insights during ingestion, ensuring no raw identifiable data is stored.

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

### 2. Enhanced Platform Connectors

#### 2.1 Facebook Connector

**Location**: `libs/ingestion/src/lib/services/facebook.connector.ts`

**Purpose**: Implements the transform-on-ingest pattern while maintaining backward compatibility with the original connector interface.

**Key Features**:
- Dual interface implementation (both original and transform-on-ingest)
- In-memory data handling only
- Enhanced methods that return anonymized insights
- Streaming support with real-time transformation

**Example Usage**:
```typescript
// Original way (still supported for backward compatibility)
const posts = await facebookConnector.searchContent('climate change');

// New transform-on-ingest way
const insights = await facebookConnector.searchAndTransform('climate change');
```

#### 2.2 Twitter Connector

**Location**: `libs/ingestion/src/lib/services/twitter.connector.ts`

**Purpose**: Implements the transform-on-ingest pattern for Twitter data.

**Key Features**:
- Uses Twitter API v2 for data retrieval
- Enriches tweet data with user information
- Implements streaming through polling with immediate transformation
- Handles retweets, quotes, and replies consistently

**Example Usage**:
```typescript
// Stream anonymized Twitter insights in real-time
const emitter = twitterConnector.streamAndTransform(['climate', 'carbon']);
emitter.on('data', (insight) => {
  // Process anonymized insight
});
```

#### 2.3 Reddit Connector

**Location**: `libs/ingestion/src/lib/services/reddit.connector.ts`

**Purpose**: Implements the transform-on-ingest pattern for Reddit data.

**Key Features**:
- Uses Snoowrap for Reddit API integration
- Handles both submissions and comments
- Calculates engagement scores based on upvote ratio and comment counts
- Enriches Reddit submissions with subreddit information

**Example Usage**:
```typescript
// Search for content and transform immediately
const insights = await redditConnector.searchAndTransform('climate action');
// Insights are anonymized and safe to store
```

### 3. TransformOnIngestConnector Interface

**Location**: `libs/ingestion/src/lib/interfaces/transform-on-ingest-connector.interface.ts`

**Purpose**: Defines the enhanced connector interface that extends the original while adding transform-on-ingest methods.

**Key Features**:
- Extends the original `SocialMediaConnector` interface
- Adds `searchAndTransform` and `streamAndTransform` methods
- Ensures backward compatibility

### 4. NarrativeInsight Data Model

**Location**: `libs/ingestion/src/types/narrative-insight.interface.ts`

**Purpose**: Defines the structure for anonymized insights derived from social media content.

**Key Features**:
- Content and source hashes for anonymized tracking
- Sentiment and theme analysis
- Engagement and narrative impact scoring
- No personally identifiable information

## Architecture Flow

1. **Data Retrieval**: Platform connectors fetch data from social media APIs
2. **In-Memory Processing**: Raw data is kept in memory only, never persisted
3. **Immediate Transformation**: The `TransformOnIngestService` transforms raw data into anonymized insights
4. **Anonymized Storage**: Only the anonymized insights are stored in the database
5. **Analysis & Visualization**: Insights are used for trend analysis and visualization

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

### Backward Compatibility

To ensure a smooth transition, the implementation maintains backward compatibility:

```typescript
// Implementation of both interfaces
export class FacebookConnector implements TransformOnIngestConnector, OnModuleInit, OnModuleDestroy {
  // Original method (returns SocialMediaPost[])
  async searchContent(query: string, options?: SearchOptions): Promise<SocialMediaPost[]> {
    // ...
  }
  
  // Enhanced method (returns NarrativeInsight[])
  async searchAndTransform(query: string, options?: SearchOptions): Promise<NarrativeInsight[]> {
    // ...
  }
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

## Module Integration

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

This module is then imported into the main `IngestionModule`:

```typescript
@Module({
  imports: [
    // ...
    TransformOnIngestModule,
    // ...
  ],
  // ...
})
export class IngestionModule {}
```

## Next Steps

1. **Create Narrative Repository**: Implement the repository for storing and retrieving narrative insights
2. **Enhance Text Analysis**: Improve theme extraction and sentiment analysis
3. **Aggregation Framework**: Develop capabilities for trend analysis based on anonymized data
4. **Visualization Integration**: Update the front-end to work with the new data model
5. **Implement APIs**: Create endpoints for retrieving anonymized insights 