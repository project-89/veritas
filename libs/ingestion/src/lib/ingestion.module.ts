import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IngestionController } from './controllers/ingestion.controller';
import { DatabaseModule } from '@veritas/database';
import { IngestionResolver } from './resolvers/ingestion.resolver';
import { TransformOnIngestService } from './services/transform/transform-on-ingest.service';
import { RedditConnector } from './services/reddit.connector';
import { FacebookConnector } from './services/facebook.connector';
import { RSSConnector } from './services/rss.connector';
import { WebScraperConnector } from './services/web-scraper.connector';
import { YouTubeConnector } from './services/youtube.connector';
import { IngestionService } from './services/ingestion.service';

// Create a stub for ContentClassificationService
class ContentClassificationServiceStub {
  classifyContent() {
    return { sentiment: 'neutral', categories: [], toxicity: 0 };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule.forRoot(),
  ],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    {
      provide: 'ContentClassificationService',
      useClass: ContentClassificationServiceStub,
    },
    IngestionResolver,
    TransformOnIngestService,
    RedditConnector,
    FacebookConnector,
    RSSConnector,
    WebScraperConnector,
    YouTubeConnector,
  ],
  exports: [IngestionService, 'ContentClassificationService'],
})
export class IngestionModule {}
