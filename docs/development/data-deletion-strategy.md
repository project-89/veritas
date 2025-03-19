# Data Deletion Strategy

This document outlines the data deletion strategy for the Veritas system based on the transform-on-ingest architecture, focusing on compliance with platform terms of service while maintaining system functionality.

## Overview

The transform-on-ingest architecture fundamentally changes how Veritas handles deletion requests. By transforming data at the point of ingestion and never storing raw platform data, we minimize deletion obligations while maintaining narrative analysis capabilities.

## Deletion Strategy by Data Tier

The system organizes data into tiers with different deletion requirements:

### Tier 1: Raw Platform Data (No Storage)

**Storage Duration**: None (in-memory only)  
**Deletion Requirement**: N/A - Never persisted  
**Implementation**: All platform connectors process data in memory only

```typescript
// Example: Facebook connector fetching raw posts (in memory only)
private async fetchRawPosts(query: string, options?: SearchOptions): Promise<FacebookPost[]> {
  try {
    const pageId = this.configService.getOrThrow('FACEBOOK_PAGE_ID');
    const page = new Page(pageId);
    
    // Fetch raw posts (kept in memory)
    const response = await page.getPosts({ q: query, fields: [...], limit: 100 });
    
    // Return for immediate transformation, never stored
    return response.data as FacebookPost[];
  } catch (error) {
    this.logger.error('Error fetching raw Facebook posts:', error);
    throw error;
  }
}
```

### Tier 2: Anonymized Narrative Insights

**Storage Duration**: 90-day rolling window (configurable)  
**Deletion Requirement**: Not tied to source data and can be safely retained longer  
**Implementation**: Stored with hashed source and content identifiers

```typescript
// Structure of stored narrative insights
interface NarrativeInsight {
  contentHash: string;       // One-way hash of content
  sourceHash: string;        // One-way hash of source
  platform: string;          // Platform identifier
  timestamp: Date;           // Publication timestamp
  themes: string[];          // Extracted themes
  sentiment: {
    score: number;           // Sentiment score (-1 to 1)
    magnitude: number;       // Sentiment magnitude (0 to 1)
  };
  engagementScore: number;   // Normalized engagement score
  narrativeScore: number;    // Combined narrative impact score
}
```

### Tier 3: Aggregated Trend Data

**Storage Duration**: Long-term (1-3 years)  
**Deletion Requirement**: No identifiable content, exempt from deletion requests  
**Implementation**: Statistical aggregates with no reverse traceability

```typescript
// Example aggregated trend structure
interface NarrativeTrend {
  trendId: string;                    // Generated identifier
  platform: string;                   // Platform source
  timeframe: string;                  // Time period (e.g., '2023-Q2')
  topicDistribution: Record<string, number>;  // Topic frequencies
  sentimentTrend: number;             // Average sentiment
  uniqueSourcesCount: number;         // Count of unique sources
  sourceDistribution: {               // Distribution by source type
    verified: number;
    unverified: number;
  };
  engagementDistribution: {           // Engagement level breakdown
    high: number;
    medium: number;
    low: number;
  };
}
```

## Handling Platform Deletion Requests

Despite the architecture minimizing deletion obligations, the system still implements mechanisms to handle platform deletion requests:

### 1. Webhook Controller for Deletion Requests

```typescript
@Controller('api/webhooks')
export class PlatformWebhooksController {
  constructor(
    private readonly deletionService: DataDeletionService,
    private readonly logger: Logger
  ) {}

  @Post('facebook/deletion')
  async handleFacebookDeletion(@Body() request: FacebookDeletionRequest): Promise<void> {
    try {
      // Validate the request
      if (!this.validateFacebookRequest(request)) {
        throw new UnauthorizedException('Invalid deletion request');
      }
      
      // Process deletion
      const deletionId = request.deletion_id || uuid();
      
      // Since we don't store raw data, we just need to log the request
      this.logger.log(`Received Facebook deletion request: ${deletionId}`);
      
      // For audit purposes, record that we received the request
      await this.deletionService.recordDeletionRequest({
        platform: 'facebook',
        requestId: deletionId,
        timestamp: new Date(),
        status: 'completed',
        details: 'No raw data to delete - transform-on-ingest architecture'
      });
      
      return {
        confirmation_code: deletionId,
        status: 'completed'
      };
    } catch (error) {
      this.logger.error('Error handling Facebook deletion request:', error);
      throw new InternalServerErrorException('Failed to process deletion request');
    }
  }
}
```

### 2. Salt Rotation for Enhanced Security

The system automatically rotates cryptographic salts used in hashing, which provides an additional layer of security by breaking the ability to correlate identifiers over time:

```typescript
// Salt rotation in the transform service
private readonly saltRefreshInterval = 1000 * 60 * 60 * 24; // 24 hours

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

### 3. Automatic Tiered Data Expiration

```typescript
@Injectable()
export class DataRetentionService {
  constructor(
    @InjectRepository(NarrativeInsightRepository)
    private readonly insightRepo: NarrativeInsightRepository,
    private readonly configService: ConfigService
  ) {}

  @Cron('0 0 * * *') // Daily at midnight
  async applyRetentionPolicies(): Promise<void> {
    // Get retention periods from configuration
    const insightRetentionDays = this.configService.get<number>('INSIGHT_RETENTION_DAYS', 90);
    
    // Calculate cutoff dates
    const insightCutoff = new Date();
    insightCutoff.setDate(insightCutoff.getDate() - insightRetentionDays);
    
    // Apply retention policy to narrative insights
    const insightsDeleted = await this.insightRepo.deleteOlderThan(insightCutoff);
    
    this.logger.log(`Data retention policy applied: Deleted ${insightsDeleted} expired narrative insights`);
  }
}
```

## Compliance Documentation

The system maintains comprehensive documentation of its deletion policies and practices:

1. **Data Flow Diagrams**: Visual representations of how data moves through the system
2. **Deletion Audit Logs**: Records of all deletion requests and actions
3. **Data Retention Configuration**: Central configuration for retention periods
4. **Compliance Reports**: Regular reports on data handling practices

## Platform-Specific Considerations

### Facebook/Meta

- No storage of raw content from Meta APIs
- Immediate transformation of content into anonymized insights
- Responds to deletion callbacks via webhook

### Twitter

- Streaming API data never persisted in raw form
- Implements compliance with Twitter Enterprise API terms

### Reddit

- Public content is transformed with source anonymization
- Author information is one-way hashed

## Advantages of This Approach

1. **Minimal Deletion Overhead**: By not storing raw data, the system has minimal deletion requirements
2. **Enhanced Privacy**: User identities are cryptographically protected
3. **Simplified Compliance**: Clear separation between tiers of data
4. **Maintained Functionality**: Narrative analysis remains effective despite anonymization
5. **Future-Proof**: Architecture anticipates potential regulatory changes

## Conclusion

Veritas's data deletion strategy is fundamentally built into its architecture rather than added as an afterthought. The transform-on-ingest approach ensures that raw platform data is never stored, which drastically reduces deletion obligations while maintaining the system's ability to provide valuable narrative analysis. 