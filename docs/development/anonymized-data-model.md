# Anonymized Data Model for Veritas

This document describes the new anonymized data model for Veritas, designed to support the transform-on-ingest architecture while maintaining robust narrative analysis capabilities.

## Overview

The anonymized data model shifts the focus from storing raw social media content to storing anonymized narrative insights. This approach ensures compliance with platform terms of service while still enabling effective trend analysis and pattern detection.

## Core Entities

### NarrativeInsight

The central entity representing an anonymized insight derived from a piece of social media content.

```typescript
interface NarrativeInsight {
  // System identifiers
  id: string;                   // Unique identifier for the insight
  
  // Anonymized identifiers
  sourceIdentifier: string;      // Double-hashed source ID
  contentFingerprint: string;    // Content fingerprint
  
  // Narrative analysis
  sentiment: number;             // Sentiment score (-1 to 1)
  topics: string[];              // Extracted topics
  narrativeFingerprint: string;  // Narrative pattern signature
  
  // Generalized attributes
  timeframe: string;             // Generalized time period (e.g., "2023-Q2-W3-evening")
  engagementLevel: string;       // Categorized engagement level ("low", "medium", "high", "viral")
  platform: string;              // Platform source ("facebook", "twitter", etc.)
  
  // Non-identifying metadata
  metadata: {
    checksum: string;            // For deduplication
    hasMedia: boolean;           // If post contained media
    wordCount: number;           // Word count
    language: string;            // Detected language
    contentType: string;         // Type of content ("post", "comment", "article")
  };
  
  // System timestamps
  processedAt: Date;             // When this insight was generated
  updatedAt?: Date;              // When this insight was last updated
}
```

### NarrativeTrend

Represents an aggregated trend derived from multiple narrative insights.

```typescript
interface NarrativeTrend {
  // Trend identifiers
  id: string;                   // Unique identifier for the trend
  trendFingerprint: string;     // Hash representing the trend pattern
  timeframe: string;            // Time period (day, week, month)
  
  // Trend metrics
  topicDistribution: Record<string, number>;  // Topic frequency
  sentimentTrend: number;                     // Average sentiment
  momentumScore: number;                      // Change velocity
  
  // Volume metrics
  insightCount: number;                       // Number of insights in trend
  uniqueSourcesCount: number;                 // Number of unique sources
  
  // Source diversity
  sourceEntropy: number;                      // Measure of source diversity
  platformDistribution: Record<string, number>; // Platform frequency
  
  // System timestamps
  detectedAt: Date;                           // When this trend was first detected
  lastUpdated: Date;                          // When this trend was last updated
}
```

### CryptographicSalt

Manages the salts used for anonymization.

```typescript
interface CryptographicSalt {
  // Salt identifiers
  id: string;                 // Unique identifier for the salt
  purpose: string;            // Purpose of the salt ("source", "correlation", "content")
  platform: string;           // Platform the salt is used for
  
  // Salt value
  value: string;              // The actual salt value (stored securely)
  
  // Lifecycle management
  effectiveFrom: Date;        // When this salt became active
  expiresAt: Date;            // When this salt will expire
  status: 'active' | 'expired' | 'deprecated'; // Current status
  
  // System timestamps
  createdAt: Date;            // When this salt was created
  updatedAt: Date;            // When this salt was last updated
}
```

### EntityMention

Represents an anonymized mention of a named entity in content.

```typescript
interface EntityMention {
  // Entity identifiers
  id: string;                 // Unique identifier for the entity mention
  entityFingerprint: string;  // Fingerprint of the entity name
  
  // Entity attributes
  type: string;               // Type of entity ("person", "organization", "location", "event")
  sentiment: number;          // Sentiment associated with the entity (-1 to 1)
  
  // Relational data
  insightId: string;          // ID of the parent narrative insight
  
  // System timestamps
  processedAt: Date;          // When this entity mention was processed
}
```

### TopicRelationship

Represents the relationship between topics found in the narrative insights.

```typescript
interface TopicRelationship {
  // Relationship identifiers
  id: string;                  // Unique identifier for the relationship
  
  // Topics in relationship
  topicA: string;              // First topic
  topicB: string;              // Second topic
  
  // Relationship metrics
  cooccurrenceCount: number;   // Number of times topics appear together
  correlationStrength: number; // Statistical correlation (-1 to 1)
  
  // Temporal data
  timeframe: string;           // Time period for the relationship
  
  // System timestamps
  calculatedAt: Date;          // When this relationship was calculated
  updatedAt: Date;             // When this relationship was last updated
}
```

## Schema Relationships

The relationships between these entities are based on references rather than direct graph relationships:

1. **NarrativeInsights** contain topics and a narrativeFingerprint
2. **NarrativeTrends** are calculated by aggregating insights with similar narrativeFingerprints
3. **EntityMentions** reference their parent NarrativeInsight
4. **TopicRelationships** are calculated by analyzing co-occurrence patterns in NarrativeInsights

## Data Storage

### Main Database (MongoDB or PostgreSQL)

The primary storage for the anonymized data model uses collections/tables for each entity type.

Example MongoDB collection for NarrativeInsights:

```javascript
db.narrative_insights.createIndex({ sourceIdentifier: 1, contentFingerprint: 1 }, { unique: true });
db.narrative_insights.createIndex({ narrativeFingerprint: 1 });
db.narrative_insights.createIndex({ timeframe: 1 });
db.narrative_insights.createIndex({ topics: 1 });
```

Example MongoDB collection for NarrativeTrends:

```javascript
db.narrative_trends.createIndex({ trendFingerprint: 1 }, { unique: true });
db.narrative_trends.createIndex({ timeframe: 1 });
db.narrative_trends.createIndex({ momentumScore: -1 });
```

### Cache (Redis)

Redis is used for caching aggregated data and frequently accessed trends.

Example Redis data structure for a cached NarrativeTrend:

```
Key: trend:2023-Q2:politics-inflation
Value: {JSON representation of the narrative trend}
Expiry: 1 hour
```

Example Redis data structure for topic co-occurrence counts:

```
Key: topic-cooccurrence:politics:economy
Value: 387
Expiry: 1 day
```

## Data Flow

1. **Ingestion**: Raw content is fetched from social media APIs
2. **Transformation**: Content is immediately transformed into anonymized NarrativeInsights
3. **Storage**: Only the anonymized insights are stored in the database
4. **Aggregation**: Insights are aggregated into NarrativeTrends
5. **Analysis**: Trends and relationships are analyzed for patterns
6. **Visualization**: Anonymized trends and patterns are presented to users

## Anonymization Techniques

### Double-Blind Hashing

Sources are anonymized using a double-blind hashing technique:

```typescript
// First hash with system-specific salt
const firstHash = crypto.createHash('sha256')
  .update(sourceId + systemSalt)
  .digest('hex');

// Second hash with rotating salt
const sourceIdentifier = crypto.createHash('sha256')
  .update(firstHash + rotatingSalt)
  .digest('hex');
```

### Content Fingerprinting

Content is fingerprinted to identify similar content without storing the original text:

```typescript
// Normalize text
const normalized = text.toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

// Extract key n-grams
const ngrams = extractNgrams(normalized, 3);

// Sort for consistency
ngrams.sort();

// Hash with salt
const contentFingerprint = crypto.createHash('sha256')
  .update(ngrams.join('|') + contentSalt)
  .digest('hex');
```

### Temporal Generalization

Timestamps are generalized to reduce identifiability:

```typescript
function generalizeTimeframe(date) {
  const year = date.getFullYear();
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  const week = Math.floor(date.getDate() / 7) + 1;
  const dayPart = getDayPart(date.getHours());
  
  return `${year}-Q${quarter}-W${week}-${dayPart}`;
}

function getDayPart(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}
```

### Engagement Categorization

Exact engagement metrics are converted to categories:

```typescript
function categorizeEngagement(likes, shares, comments) {
  const total = likes + shares + comments;
  
  if (total >= 1000) return 'viral';
  if (total >= 100) return 'high';
  if (total >= 10) return 'medium';
  return 'low';
}
```

## Example Queries

### Find emerging trends in the last week

```javascript
db.narrative_trends.find({
  timeframe: /^2023-Q2-W3/,
  momentumScore: { $gt: 0.7 }
}).sort({ momentumScore: -1 }).limit(10);
```

### Find insights related to a specific topic

```javascript
db.narrative_insights.find({
  topics: "climate_change",
  timeframe: /^2023/
}).sort({ processedAt: -1 }).limit(100);
```

### Calculate topic relationships

```javascript
db.narrative_insights.aggregate([
  { $match: { timeframe: /^2023-Q2/ } },
  { $unwind: "$topics" },
  { $group: {
    _id: "$topics",
    count: { $sum: 1 },
    insights: { $addToSet: "$_id" }
  }},
  { $match: { count: { $gt: 10 } } }
]);
```

## Data Retention

The anonymized data model supports flexible retention policies:

1. **NarrativeInsights**: Can be retained longer than raw data (typically 6-12 months)
2. **NarrativeTrends**: Long-term storage (1-3 years) for historical analysis
3. **EntityMentions**: Same retention as parent insights
4. **TopicRelationships**: Long-term storage for trend analysis

## Advantages of the Anonymized Model

1. **Compliance**: Eliminates concerns about deletion requests
2. **Privacy**: Protects user identities through strong anonymization
3. **Focus**: Emphasizes narrative patterns over individual content
4. **Efficiency**: Optimized for trend analysis and pattern detection
5. **Scalability**: Reduces storage requirements by eliminating raw content

## Migration Considerations

When migrating from the existing data model to the anonymized model:

1. **One-Way Process**: Migration to anonymized data is a one-way process
2. **Historical Data**: Consider whether to anonymize historical data or start fresh
3. **API Changes**: APIs will need to be updated to work with the new data model
4. **Visualization Updates**: Visualizations must be adapted to the anonymized model

## Conclusion

The anonymized data model provides a robust foundation for narrative analysis while ensuring compliance with platform terms of service. By focusing on patterns and trends rather than individual content, Veritas can deliver valuable insights without the privacy and compliance concerns associated with storing raw social media data. 