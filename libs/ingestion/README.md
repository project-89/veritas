# Veritas Ingestion Library

The Ingestion Library is a core component of the Veritas system responsible for collecting, transforming, and storing data from various sources while ensuring data privacy and compliance through a transform-on-ingest pattern.

## Features

- **Transform-on-ingest** pattern ensuring data privacy at the edge
- Multiple data connectors for different platforms:
  - Social media (Twitter, Facebook, Reddit)
  - RSS feeds
  - Web scraping
  - YouTube
- Content classification and entity recognition
- Secure one-way hashing of personally identifiable information (PII)
- Automatic data lifecycle management with configurable retention periods
- Streaming and batch processing capabilities
- Narrative trend detection and analysis

## Architecture Overview

The Ingestion Library follows a modular architecture centered around the transform-on-ingest pattern. This pattern ensures that any sensitive or personally identifiable information is anonymized at the very beginning of the data pipeline, before storage.

### Key Components

1. **Data Connectors**: Connect to various data sources and retrieve raw data
2. **TransformOnIngestService**: Transforms raw data into anonymized insights
3. **NarrativeRepository**: Stores and retrieves transformed insights
4. **ContentClassificationService**: Analyzes and classifies content

### Transform-on-Ingest Pattern

The transform-on-ingest pattern is a privacy-first approach that follows these steps:

1. Raw data is collected from the source
2. Sensitive information is immediately transformed:
   - Content is classified and key features extracted
   - One-way hashing is applied to identifiable information
   - Data is normalized and standardized
3. Only transformed, anonymized data is stored
4. Raw data is discarded

This approach ensures compliance with privacy regulations and reduces risk by ensuring that sensitive information never reaches persistent storage.

## Getting Started

### Installation

```bash
# Install dependencies
npm install

# Build the library
npx nx build ingestion
```

### Usage

#### Basic Module Registration

```typescript
// In your app module
import { Module } from '@nestjs/common';
import { IngestionModule } from '@veritas/ingestion';

@Module({
  imports: [
    IngestionModule.register(), // Use default configuration
  ],
})
export class AppModule {}
```

#### Advanced Configuration

```typescript
// In your app module
import { Module } from '@nestjs/common';
import { IngestionModule } from '@veritas/ingestion';
import { DatabaseModule, DatabaseService } from '@veritas/database';

@Module({
  imports: [
    DatabaseModule.register({
      providerType: 'mongodb',
      providerOptions: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
        databaseName: 'veritas',
      },
    }),
    IngestionModule.forRoot({
      repositoryType: 'mongodb', // Use MongoDB for storage
      connectors: {
        twitter: true,
        facebook: true,
        reddit: true,
        rss: false, // Disable RSS connector
        webScraper: false, // Disable web scraper
        youtube: true,
      },
      isGlobal: true, // Register as global module
    }),
  ],
})
export class AppModule {}
```

### Using the Ingestion Service

```typescript
import { Injectable } from '@nestjs/common';
import { IngestionService, NarrativeInsight } from '@veritas/ingestion';

@Injectable()
export class YourService {
  constructor(private readonly ingestionService: IngestionService) {}

  async searchForContent(query: string): Promise<NarrativeInsight[]> {
    // Search across all platforms and transform the results
    return this.ingestionService.searchAndTransformAll(query, {
      platforms: ['twitter', 'facebook'],
      limit: 100,
    });
  }
  
  // Get a specific connector if needed
  async getTwitterTrends() {
    const connector = this.ingestionService.getConnector('twitter');
    if (connector) {
      // Use connector directly
    }
  }
}
```

## API Reference

### IngestionModule

- `register()`: Register with default configuration
- `forRoot(options)`: Register with custom configuration

### IngestionService

- `getConnector(platform)`: Get a specific connector by platform
- `getAllConnectors()`: Get all registered connectors
- `searchAndTransformAll(query, options)`: Search and transform data from all registered connectors

### TransformOnIngestService

- `transform(post)`: Transform a social media post into an anonymized insight
- `transformBatch(posts)`: Transform multiple posts in a batch operation

### Data Connectors

All connectors implement the `DataConnector` interface with these methods:

- `connect()`: Connect to the data source
- `disconnect()`: Disconnect from the data source
- `searchAndTransform(query, options)`: Search for content and transform results
- `streamAndTransform(keywords)`: Stream content matching keywords and transform in real-time
- `getAuthorDetails(authorId)`: Get anonymized details about a content author

## Configuration

Configure the library through environment variables:

```
# Data Source API Keys
TWITTER_BEARER_TOKEN=your_twitter_token
FACEBOOK_ACCESS_TOKEN=your_facebook_token
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
YOUTUBE_API_KEY=your_youtube_key

# Transformation Configuration
HASH_SALT=random_secure_salt_string
RETENTION_PERIOD_DAYS=90

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/veritas
```

## Best Practices

1. **Privacy First**: Always use the transform-on-ingest pattern for external data
2. **Batch Operations**: Use batch transformation when processing multiple items
3. **Error Handling**: Implement proper error handling for connector failures
4. **Monitoring**: Monitor connector health and authentication status
5. **Rate Limiting**: Be aware of API rate limits for different platforms

## Contributing

1. Ensure all new connectors implement the `DataConnector` interface
2. Follow the transform-on-ingest pattern for all data sources
3. Add tests for all new functionality
4. Document new features and connectors

## License

MIT 