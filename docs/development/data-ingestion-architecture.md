# Transform-on-Ingest Data Architecture

This document outlines the transform-on-ingest architecture for Veritas, specifically designed to ensure compliance with platform terms of service while enabling robust narrative analysis.

## Overview

The transform-on-ingest architecture is built on the principle that raw identifiable data from social media platforms should never be persisted in our system. Instead, all data is immediately transformed into anonymized, non-identifiable insights during the ingestion process, eliminating concerns about deletion requests and enhancing privacy protection.

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

## Core Principles

1. **No Raw Data Storage**: Raw data from platforms never persists in our system
2. **True Anonymization**: Cryptographic techniques make it mathematically impossible to reverse-engineer identities
3. **Focus on Patterns**: The system stores narrative patterns and trends, not individual content
4. **Generalized Attribution**: Source consistency is maintained without identifiability
5. **No Cross-Platform Linkage**: Different cryptographic salts for different platforms prevent cross-referencing identities

## Key Components

### 1. Enhanced Platform Connectors

The connectors interface with social media APIs and immediately process the data without storing it. They implement:

- In-memory buffering only (no disk storage)
- Immediate transformation pipeline integration
- Streaming capabilities with direct transformation

Example connector implementation:

```typescript
@Injectable()
export class EnhancedPlatformConnector {
  constructor(
    private readonly configService: ConfigService,
    private readonly transformService: TransformOnIngestService
  ) {}
  
  /**
   * Fetch and immediately process data with no storage
   */
  async fetchAndProcessTrends(query: string): Promise<void> {
    // Fetch data (kept in memory only)
    const posts = await this.fetchPosts(query);
    
    // Transform immediately - no raw storage
    await this.transformService.processPlatformData(posts);
    
    // Data is now available only in anonymized form
  }
  
  /**
   * Set up streaming with immediate transformation
   */
  setupTrendStream(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    
    // Set up polling that never stores raw data
    const interval = setInterval(async () => {
      try {
        // Get fresh data
        const posts = await this.fetchPostsByKeywords(keywords);
        
        // Process immediately
        const insights = await this.transformService.processAndEmit(posts);
        
        // Emit only anonymized insights
        for (const insight of insights) {
          emitter.emit('insight', insight);
        }
      } catch (error) {
        emitter.emit('error', error);
      }
    }, 60000); // One minute polling
    
    // Provide cleanup method
    emitter.on('end', () => clearInterval(interval));
    
    return emitter;
  }
}
```

### 2. Transform-on-Ingest Service

The central component that processes raw data and produces anonymized insights. Features include:

- One-way hashing with salts
- Content fingerprinting
- Narrative feature extraction
- Temporal generalization
- Engagement level categorization

```typescript
@Injectable()
export class TransformOnIngestService {
  constructor(
    private readonly hasher: SecureHashService,
    private readonly narrativeExtractor: NarrativeExtractorService,
    private readonly sentimentAnalyzer: SentimentAnalyzerService,
    private readonly topicClassifier: TopicClassifierService,
    private readonly insightRepository: InsightRepository
  ) {}

  /**
   * Process incoming Platform data with immediate transformation
   * No raw data is ever stored
   */
  async processPlatformData(rawPosts: any[]): Promise<void> {
    // Process each post individually with no batch storage
    for (const post of rawPosts) {
      // 1. Extract all useful attributes for narrative analysis
      const narrativeFeatures = {
        sentiment: this.sentimentAnalyzer.analyze(post.message),
        topics: this.topicClassifier.classify(post.message),
        narrativeFingerprint: this.narrativeExtractor.extractFingerprint(post.message),
        timeframe: this.generalizeTimeframe(new Date(post.created_time)),
        engagementLevel: this.calculateEngagementLevel(post),
        platform: post.platform
      };
      
      // 2. Create fully anonymized source identifier
      const sourceIdentifier = this.hasher.doubleHash(
        post.from?.id || 'unknown',
        this.hasher.getSourceSalt(),
        this.hasher.getCorrelationSalt()
      );
      
      // 3. Create content fingerprint
      const contentFingerprint = this.hasher.fingerprintContent(
        post.message,
        this.hasher.getContentSalt()
      );
      
      // 4. Store only the transformed, anonymized data
      await this.insightRepository.saveNarrativeInsight({
        sourceIdentifier,
        contentFingerprint,
        ...narrativeFeatures,
        metadata: {
          checksum: this.calculateChecksum(post.message),
          hasMedia: !!post.attachments,
          wordCount: this.countWords(post.message),
        },
        processedAt: new Date()
      });
    }
  }
  
  /**
   * Generalize a timestamp to reduce temporal identifiability
   */
  private generalizeTimeframe(timestamp: Date): string {
    const year = timestamp.getFullYear();
    const quarter = Math.floor(timestamp.getMonth() / 3) + 1;
    const week = Math.floor(timestamp.getDate() / 7) + 1;
    const dayPart = this.getDayPart(timestamp.getHours());
    
    return `${year}-Q${quarter}-W${week}-${dayPart}`;
  }
  
  private getDayPart(hour: number): string {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }
  
  /**
   * Calculate engagement level without storing raw numbers
   * Uses buckets instead of exact metrics
   */
  private calculateEngagementLevel(post: any): string {
    const total = (post.reactions?.summary?.total_count || 0) +
                  (post.shares?.count || 0) +
                  (post.comments?.summary?.total_count || 0);
    
    if (total >= 1000) return 'viral';
    if (total >= 100) return 'high';
    if (total >= 10) return 'medium';
    return 'low';
  }
}
```

### 3. Secure Hashing Service

Provides cryptographically secure, irreversible hashing with automatic salt rotation:

```typescript
@Injectable()
export class SecureHashService {
  private readonly SALT_ROTATION_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 days
  
  constructor(
    private readonly configService: ConfigService,
    private readonly saltRepository: SaltRepository
  ) {
    this.scheduleSaltRotation();
  }
  
  /**
   * Double-hash an identifier for maximum anonymization
   * This prevents correlation across systems while maintaining 
   * consistent identification within the system
   */
  doubleHash(value: string, primarySalt: string, secondarySalt: string): string {
    const primaryHash = this.hashWithSalt(value, primarySalt);
    return this.hashWithSalt(primaryHash, secondarySalt);
  }
  
  /**
   * Create a content fingerprint that's consistent for similar content
   * but cannot be reversed to the original
   */
  fingerprintContent(content: string, salt: string): string {
    const normalized = this.normalizeText(content);
    const keyPhrases = this.extractKeyPhrases(normalized);
    keyPhrases.sort();
    return this.hashWithSalt(keyPhrases.join('|'), salt);
  }
  
  private hashWithSalt(value: string, salt: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(value + salt);
    return hash.digest('hex');
  }
  
  /**
   * Schedule periodic salt rotation for enhanced security
   */
  private scheduleSaltRotation() {
    setInterval(() => {
      this.saltRepository.rotateSalts();
    }, this.SALT_ROTATION_INTERVAL);
  }
}
```

### 4. Narrative-Focused Repository

Stores anonymized insights and provides aggregation capabilities:

```typescript
@Injectable()
export class NarrativeRepository {
  constructor(
    private readonly database: Database,
    private readonly cache: CacheService
  ) {}
  
  /**
   * Save a new narrative insight
   */
  async saveInsight(insight: NarrativeInsight): Promise<void> {
    await this.database.collection('narrative_insights').insertOne(insight);
    await this.updateAggregates(insight);
  }
  
  /**
   * Get narrative trends without exposing individual posts
   */
  async getNarrativeTrends(
    timeframe: string,
    topics?: string[]
  ): Promise<NarrativeTrend[]> {
    // Cache key based on parameters
    const cacheKey = `trends:${timeframe}:${topics?.join(',') || 'all'}`;
    
    // Try cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Build aggregation pipeline for trend analysis
    const pipeline = [
      // Match timeframe
      { $match: { timeframe: timeframe } },
      
      // If topics provided, filter to those
      ...(topics ? [{ $match: { topics: { $in: topics } } }] : []),
      
      // Group by narrativeFingerprint
      { $group: {
        _id: "$narrativeFingerprint",
        sourceCount: { $addToSet: "$sourceIdentifier" },
        postCount: { $sum: 1 },
        averageSentiment: { $avg: "$sentiment" },
        topicFrequency: { $push: "$topics" },
        timeframes: { $addToSet: "$timeframe" }
      }},
      
      // Project into trend format
      { $project: {
        trendId: "$_id",
        uniqueSourcesCount: { $size: "$sourceCount" },
        postVolume: "$postCount",
        sentimentTrend: "$averageSentiment",
        topicDistribution: { $function: {
          body: this.flattenAndCountTopics.toString(),
          args: ["$topicFrequency"],
          lang: "js"
        }},
        timeframeSpread: "$timeframes"
      }}
    ];
    
    const trends = await this.database
      .collection('narrative_insights')
      .aggregate(pipeline)
      .toArray();
    
    // Cache for 15 minutes
    await this.cache.set(cacheKey, JSON.stringify(trends), 900);
    
    return trends;
  }
}
```

## Narrative Data Flow

1. **API Fetching**: Platform connectors fetch data from social media APIs
2. **In-Memory Processing**: Data is held in memory only, never persisted to disk
3. **Immediate Transformation**: The transform service converts raw data to anonymized insights
4. **Anonymized Storage**: Only fully anonymized data is stored in the database
5. **Aggregation**: Insights are aggregated into trends for analysis
6. **Visualization**: Trends and patterns are presented through the UI

## Compliance Benefits

This architecture provides several key benefits for compliance:

1. **Elimination of Deletion Concerns**: No raw Platform Data is stored, eliminating deletion requirements
2. **Enhanced Privacy**: User identities are fully protected through cryptographic techniques
3. **Clear Data Boundaries**: Explicit separation between raw data (never stored) and derived insights
4. **Reduced Liability**: Lower regulatory and compliance risk through proper design
5. **Simplified Operations**: No complex deletion mechanisms needed

## Implementation Requirements

### Technology Stack Extensions

- **Cryptographic Libraries**: For secure hashing and salt management
- **In-Memory Processing**: For handling data without disk persistence
- **Stream Processing**: For real-time transformation of incoming data
- **Aggregation Framework**: For deriving insights without raw data

### Integration Points

1. **Platform Connectors**: Must be updated to implement transform-on-ingest
2. **Database Schema**: Updated to store anonymized insights instead of raw content
3. **API Layer**: Modified to work with anonymized data model
4. **Visualization Layer**: Adapted to present trends without individual identities

## Migration Plan

1. **Phase 1**: Implement the Secure Hashing Service
2. **Phase 2**: Develop the Transform-on-Ingest Service
3. **Phase 3**: Update Platform Connectors one by one
4. **Phase 4**: Migrate Database Schema to new anonymized model
5. **Phase 5**: Update APIs and Front-end components

## Testing and Validation

1. **Anonymization Testing**: Verify that stored data cannot be reversed to original identities
2. **Performance Testing**: Ensure transformation doesn't impact ingestion speed
3. **Compliance Validation**: Confirm the approach meets platform terms of service
4. **Trend Analysis Verification**: Validate that narrative analysis remains accurate with anonymized data

## Conclusion

The transform-on-ingest architecture represents a fundamental shift in how Veritas handles social media data, prioritizing privacy and compliance while maintaining robust narrative analysis capabilities. By eliminating raw data storage, we remove deletion concerns while enhancing the system's privacy protection. 