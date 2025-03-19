import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  FacebookConnector,
  TwitterConnector,
  RedditConnector,
} from '../services';
import { TransformOnIngestService } from '../services/transform';

/**
 * Module for the transform-on-ingest architecture
 * Provides the enhanced platform connectors and transformation services
 */
@Module({
  imports: [ConfigModule.forRoot()],
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
