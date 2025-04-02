import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IngestionController } from './controllers/ingestion.controller';
// Local implementation to avoid external dependency
// import { DatabaseModule } from '@veritas/database';
import { IngestionResolver } from './resolvers/ingestion.resolver';
import { TransformOnIngestService } from './services/transform/transform-on-ingest.service';
import { RedditConnector } from './services/reddit.connector';
import { FacebookConnector } from './services/facebook.connector';
import { RSSConnector } from './services/rss.connector';
import { WebScraperConnector } from './services/web-scraper.connector';
import { YouTubeConnector } from './services/youtube.connector';
import { IngestionService } from './services/ingestion.service';
// import { ContentClassificationModule } from '@veritas/content-classification';

// Local mock of DatabaseModule
const DatabaseModule = {
  forRoot: () => ({
    module: class DatabaseModuleClass {},
    global: true,
  }),
};

// Local mock of ContentClassificationModule
const ContentClassificationModule = {
  module: class ContentClassificationModuleClass {},
  global: true,
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule.forRoot(),
    ContentClassificationModule,
  ],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    IngestionResolver,
    TransformOnIngestService,
    // Data connectors implementing the transform-on-ingest pattern
    RedditConnector,
    FacebookConnector,
    RSSConnector,
    WebScraperConnector,
    YouTubeConnector,
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
