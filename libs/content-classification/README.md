# Content Classification Library

## Overview

The `@veritas/content-classification` library provides robust content analysis, classification, and management capabilities for the Veritas platform. It offers both traditional content classification (categories, sentiment, entities) and advanced semantic understanding through text embeddings and vector search.

## Features

- **Content Classification**: Multi-dimensional content analysis including:
  - Sentiment analysis
  - Toxicity detection
  - Category classification
  - Entity extraction
  - Topic identification
  - Language detection

- **Text Embeddings**: Vector representation of content enabling:
  - Semantic similarity search
  - Content recommendation
  - Concept clustering
  - Narrative linkage detection

- **Content Management**: Comprehensive CRUD operations with:
  - Content storage and retrieval
  - Engagement metrics tracking
  - Metadata management
  - Content filtering

- **Flexible Database Support**:
  - MongoDB integration for document storage
  - Memgraph/Neo4j for graph relationships
  - Redis for high-performance caching

- **API Interfaces**:
  - RESTful API endpoints
  - GraphQL queries and mutations
  - TypeScript interfaces for direct integration

## Installation

```bash
npm install @veritas/content-classification
```

Note: This library has peer dependencies on `@nestjs/common`, `@nestjs/config`, and `@veritas/database`.

## Configuration

The library can be configured through the module's `forRoot()` method:

```typescript
import { ContentClassificationModule } from '@veritas/content-classification';

@Module({
  imports: [
    ContentClassificationModule.forRoot({
      // Database configuration
      providerType: 'mongodb',
      providerOptions: {
        uri: 'mongodb://localhost:27017',
        databaseName: 'veritas',
      },
      
      // Enable embeddings service (optional)
      enableEmbeddings: true,
      embeddingsOptions: {
        endpointUrl: 'https://api.openai.com/v1/embeddings',
        apiKey: 'your-api-key',
        embeddingDim: 1536, // OpenAI's ada-002 dimension
      },
      
      // Set as global module (optional)
      isGlobal: true,
    }),
  ],
})
export class AppModule {}
```

### Configuration Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `providerType` | string | Type of database provider ('mongodb', 'memgraph', 'redis') | 'mongodb' |
| `providerOptions` | object | Database connection options | {} |
| `providerFactories` | object | Custom provider factories | {} |
| `enableEmbeddings` | boolean | Enable text embeddings functionality | false |
| `embeddingsOptions` | object | Configuration for embeddings service | {} |
| `isGlobal` | boolean | Register module as global | false |

### Environment Variables

Alternatively, you can configure the library using environment variables:

```env
# Database
DATABASE_URI=mongodb://localhost:27017
DATABASE_NAME=veritas

# Content Classification
NLP_SERVICE_ENDPOINT=https://api.nlp-service.com
NLP_SERVICE_API_KEY=your-nlp-api-key

# Embeddings
EMBEDDING_SERVICE_ENDPOINT=https://api.openai.com/v1/embeddings
EMBEDDING_SERVICE_API_KEY=your-openai-api-key
EMBEDDING_DIMENSION=1536
```

## Usage Examples

### Basic Content Classification

```typescript
import { Injectable } from '@nestjs/common';
import { ContentService, ContentClassificationService } from '@veritas/content-classification';

@Injectable()
export class AppService {
  constructor(
    private readonly contentService: ContentService,
    private readonly classificationService: ContentClassificationService,
  ) {}

  async classifyAndStoreContent(text: string) {
    // Classify content
    const classification = await this.classificationService.classifyContent(text);
    
    // Create content with classification
    const content = await this.contentService.createContent({
      text,
      timestamp: new Date(),
      platform: 'web',
      engagementMetrics: {
        likes: 0,
        shares: 0, 
        comments: 0,
        reach: 0
      },
      metadata: { source: 'api' }
    });
    
    return content;
  }
}
```

### Semantic Search

```typescript
import { Injectable } from '@nestjs/common';
import { ContentService } from '@veritas/content-classification';

@Injectable()
export class SearchService {
  constructor(private readonly contentService: ContentService) {}

  async semanticSearch(query: string) {
    // Search for content semantically similar to the query
    const results = await this.contentService.semanticSearchContent({
      semanticQuery: query,
      minScore: 0.7,  // Minimum similarity threshold (0-1)
      limit: 10,      // Max results to return
    });
    
    return results;
  }
  
  async findSimilarContent(contentId: string) {
    // Find content similar to a specific item
    const results = await this.contentService.findSimilarContent(
      contentId,
      { 
        limit: 5,
        minScore: 0.8,
        useExistingEmbedding: true // Use the existing embedding if available
      }
    );
    
    return results;
  }
}
```

### Generating Embeddings

```typescript
import { Injectable } from '@nestjs/common';
import { ContentService, EmbeddingsService } from '@veritas/content-classification';

@Injectable()
export class EmbeddingsExample {
  constructor(
    private readonly contentService: ContentService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  async generateEmbedding(text: string) {
    // Generate embedding directly
    const embedding = await this.embeddingsService.generateEmbedding(text);
    return embedding;
  }
  
  async generateContentEmbedding(contentId: string) {
    // Generate and store embedding for existing content
    const content = await this.contentService.generateEmbedding(contentId);
    return content;
  }
  
  async generateAllEmbeddings() {
    // Generate embeddings for all content without embeddings
    const processedCount = await this.contentService.generateAllEmbeddings();
    return `Processed ${processedCount} items`;
  }
}
```

## API Documentation

### ContentService

The primary service for content management operations:

- `createContent(input: ContentCreateInput): Promise<ExtendedContentNode>`
- `getContentById(id: string): Promise<ExtendedContentNode | null>`
- `searchContent(params: ContentSearchParams): Promise<ExtendedContentNode[]>`
- `updateContent(id: string, input: ContentUpdateInput): Promise<ExtendedContentNode | null>`
- `deleteContent(id: string): Promise<boolean>`
- `getRelatedContent(id: string, limit?: number): Promise<ExtendedContentNode[]>`
- `semanticSearchContent(params: ContentSearchParams): Promise<ExtendedContentNode[]>`
- `findSimilarContent(contentId: string, options?: object): Promise<Array<{ content: ExtendedContentNode; score: number }>>`
- `generateEmbedding(contentId: string): Promise<ExtendedContentNode | null>`
- `generateAllEmbeddings(batchSize?: number): Promise<number>`

### ContentClassificationService

Service for content classification operations:

- `classifyContent(text: string): Promise<ContentClassification>`
- `batchClassify(texts: string[]): Promise<ContentClassification[]>`
- `updateClassification(existingClassification: ContentClassification, newText: string): Promise<ContentClassification>`

### EmbeddingsService

Service for text embedding operations:

- `generateEmbedding(text: string): Promise<EmbeddingVector>`
- `batchGenerateEmbeddings(texts: string[]): Promise<EmbeddingVector[]>`
- `searchSimilarContent<T>(textOrVector: string | EmbeddingVector, options?: VectorSearchOptions): Promise<VectorSearchResult<T>[]>`
- `calculateSimilarity(vecA: EmbeddingVector, vecB: EmbeddingVector): number`

## Database Schema

The library uses a MongoDB schema for content with the following structure:

```typescript
class ContentSchema extends Document {
  // Content text
  @Prop({ required: true })
  text: string;

  // Content timestamp
  @Prop({ required: true, type: Date, index: true })
  timestamp: Date;

  // Content platform (twitter, facebook, web, etc.)
  @Prop({ required: true, index: true })
  platform: string;

  // Engagement metrics
  @Prop({ type: EngagementMetrics, required: true })
  engagementMetrics: EngagementMetrics;

  // Classification data
  @Prop({ type: ClassificationData, required: true })
  classification: ClassificationData;

  // Additional metadata
  @Prop({ type: Object })
  metadata?: Record<string, any>;

  // Text embedding vector
  @Prop({ type: [Number] })
  embedding?: number[];
}
```

## Contributing

Contributions are welcome! Please check the `CONTRIBUTING.md` file for guidelines.

## License

This library is part of the Veritas platform and is subject to the same license terms. 