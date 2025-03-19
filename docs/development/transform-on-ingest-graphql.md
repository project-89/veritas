# GraphQL Integration with Transform-on-Ingest Architecture

This document describes how GraphQL has been integrated with the transform-on-ingest architecture in the Veritas system to maintain security and compliance.

## Overview

The GraphQL API has been refactored to align with our transform-on-ingest security architecture. This ensures that:

1. No raw social media data is stored in our system
2. All data is properly anonymized before storage
3. GraphQL queries and mutations operate on transformed data only

## GraphQL Schema Changes

We've implemented the following changes to the GraphQL schema:

### New Types

- `NarrativeInsight`: Represents anonymized insights derived from social media data
- `NarrativeTrend`: Represents aggregated trends based on multiple narrative insights
- Supporting types for entities, sentiment analysis, and engagement metrics

### New Queries

```graphql
type Query {
  # Fetch narrative insights for a specific timeframe
  getNarrativeInsights(
    timeframe: String!, 
    limit: Int, 
    skip: Int
  ): [NarrativeInsight!]!
  
  # Fetch narrative trends for a specific timeframe
  getNarrativeTrends(
    timeframe: String!
  ): [NarrativeTrend!]!
}
```

### New Mutations

```graphql
type Mutation {
  # Ingest and transform social media content in one step
  ingestSocialContent(
    content: ContentIngestionInput!, 
    source: SourceIngestionInput!
  ): NarrativeInsight!
  
  # Legacy mutation (deprecated)
  ingestContent(
    content: ContentIngestionInput!, 
    source: SourceIngestionInput!
  ): ContentType!
  
  # Source verification
  verifySource(
    sourceId: String!, 
    status: VerificationStatus!
  ): SourceType!
}
```

## Security Implementation

### Transform-on-Ingest Flow

The new `ingestSocialContent` mutation implements the transform-on-ingest pattern:

1. Receives content and source information via GraphQL
2. Immediately converts it to a `SocialMediaPost` object
3. Passes it to the `TransformOnIngestService` for transformation
4. Returns the anonymized `NarrativeInsight` to the client
5. Stores only the transformed data in the repository

```typescript
@Mutation(() => NarrativeInsightType)
async ingestSocialContent(
  @Args('content') content: ContentIngestionInput,
  @Args('source') source: SourceIngestionInput
): Promise<NarrativeInsight> {
  // Convert to SocialMediaPost format
  const socialMediaPost: SocialMediaPost = {
    id: crypto.randomUUID(),
    text: content.text,
    timestamp: new Date(),
    platform: content.platform,
    authorId: source.name,
    authorName: source.name,
    engagementMetrics: content.engagementMetrics || {
      likes: 0,
      shares: 0,
      comments: 0,
      reach: 0,
      viralityScore: 0
    }
  };

  // Transform immediately - no raw data storage
  const narrativeInsight = this.transformService.transform(socialMediaPost);
  
  return narrativeInsight;
}
```

### Handling Legacy Code

The original `ingestContent` mutation is maintained for backward compatibility but is clearly marked as deprecated:

```typescript
/**
 * Legacy mutation for content ingestion
 * @deprecated Use ingestSocialContent instead which implements transform-on-ingest
 */
@Mutation(() => ContentType)
async ingestContent(/* ... */)
```

It also logs a warning message to alert developers about the use of this less secure method:

```typescript
console.warn(
  'WARNING: Using deprecated ingestContent which does not implement transform-on-ingest security'
);
```

## Repository Integration

Both the REST and GraphQL APIs now use the same `NarrativeRepository` abstraction:

```typescript
@Query(() => [NarrativeInsightType])
async getNarrativeInsights(
  @Args('timeframe') timeframe: string,
  @Args('limit', { nullable: true }) limit?: number,
  @Args('skip', { nullable: true }) skip?: number
): Promise<NarrativeInsight[]> {
  return this.narrativeRepository.findByTimeframe(timeframe, {
    limit,
    skip
  });
}
```

This ensures consistent data access patterns and security enforcement across both APIs.

## Migration Considerations

### For Frontend Developers

If you're currently using the `ingestContent` mutation, you should migrate to the new `ingestSocialContent` mutation:

**Old approach (not secure)**:
```graphql
mutation {
  ingestContent(
    content: { text: "...", platform: "twitter" },
    source: { name: "...", platform: "twitter", credibilityScore: 0.8, verificationStatus: VERIFIED }
  ) {
    id
    text
  }
}
```

**New approach (transform-on-ingest compliant)**:
```graphql
mutation {
  ingestSocialContent(
    content: { text: "...", platform: "twitter" },
    source: { name: "...", platform: "twitter", credibilityScore: 0.8, verificationStatus: VERIFIED }
  ) {
    id
    contentHash
    sourceHash
    themes
  }
}
```

### For Backend Developers

When adding new GraphQL functionality:

1. Always use the `NarrativeRepository` for data access
2. Never expose raw social media data through GraphQL
3. Ensure all new mutations follow the transform-on-ingest pattern

## Testing GraphQL Security

You can verify the security of our GraphQL implementation using:

```bash
# Test that raw data is not available
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query { getNarrativeInsights(timeframe: \"2023-Q3\") { sourceHash contentHash } }"}'

# Verify that hashed data cannot be reverse-engineered
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query { getNarrativeTrends(timeframe: \"2023-Q3\") { primaryTheme uniqueSourcesCount } }"}'
```

## Conclusion

By refactoring our GraphQL API to use the transform-on-ingest architecture, we've ensured that all data access paths in Veritas follow the same secure patterns, meeting our compliance and privacy requirements while maintaining full functionality. 