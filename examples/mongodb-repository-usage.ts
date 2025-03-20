// Example showing how to use the MongoDB NarrativeRepository

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  NarrativeModule,
  NarrativeRepository,
  NarrativeInsight,
} from '@veritas/ingestion';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Example application module that uses the MongoDB repository
@Module({
  imports: [
    ConfigModule.forRoot(),
    NarrativeModule.forRoot({
      // Use MongoDB implementation for production
      repositoryType: 'mongodb',
    }),
  ],
})
class AppModule {}

// Example service that uses the repository
class NarrativeService {
  constructor(private readonly narrativeRepository: NarrativeRepository) {}

  // Store a new narrative insight
  async storeInsight(insight: NarrativeInsight): Promise<void> {
    await this.narrativeRepository.save(insight);
    console.log(`Insight ${insight.id} stored successfully`);
  }

  // Store multiple narrative insights in batch
  async storeBatchInsights(insights: NarrativeInsight[]): Promise<void> {
    await this.narrativeRepository.saveMany(insights);
    console.log(`${insights.length} insights stored in batch`);
  }

  // Find an insight by content hash
  async findByHash(contentHash: string): Promise<NarrativeInsight | null> {
    const insight = await this.narrativeRepository.findByContentHash(
      contentHash
    );
    if (insight) {
      console.log(`Found insight for content hash: ${contentHash}`);
    } else {
      console.log(`No insight found for content hash: ${contentHash}`);
    }
    return insight;
  }

  // Find insights from a specific time period
  async findByTimeframe(
    timeframe: string,
    limit?: number,
    skip?: number
  ): Promise<NarrativeInsight[]> {
    const insights = await this.narrativeRepository.findByTimeframe(timeframe, {
      limit,
      skip,
    });
    console.log(
      `Found ${insights.length} insights for timeframe: ${timeframe}`
    );
    return insights;
  }

  // Get narrative trends for a time period
  async getTrends(timeframe: string): Promise<any[]> {
    const trends = await this.narrativeRepository.getTrendsByTimeframe(
      timeframe
    );
    console.log(`Found ${trends.length} trends for timeframe: ${timeframe}`);
    return trends;
  }

  // Delete old data for compliance/retention
  async cleanupOldData(cutoffDate: Date): Promise<number> {
    const deletedCount = await this.narrativeRepository.deleteOlderThan(
      cutoffDate
    );
    console.log(`Deleted ${deletedCount} insights older than ${cutoffDate}`);
    return deletedCount;
  }
}

// Example usage in a NestJS application
async function bootstrap() {
  // Create NestJS application
  const app = await NestFactory.create(AppModule);

  // Get repository from the dependency injection container
  const narrativeService = app.get(NarrativeService);

  // Example insight
  const insight: NarrativeInsight = {
    id: `insight-${Date.now()}`,
    contentHash: `hash-${Math.random().toString(36).substring(7)}`,
    sourceHash: `source-${Math.random().toString(36).substring(7)}`,
    platform: 'twitter',
    timestamp: new Date(),
    themes: ['politics', 'economy'],
    entities: [
      { name: 'Economy', type: 'topic', relevance: 0.8 },
      { name: 'Politics', type: 'topic', relevance: 0.7 },
    ],
    sentiment: {
      score: 0.2,
      label: 'positive',
      confidence: 0.8,
    },
    engagement: {
      total: 150,
      breakdown: {
        likes: 100,
        shares: 30,
        comments: 20,
      },
    },
    narrativeScore: 0.75,
    processedAt: new Date(),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days retention
  };

  // Store the insight
  await narrativeService.storeInsight(insight);

  // Find by content hash
  await narrativeService.findByHash(insight.contentHash);

  // Find by timeframe
  const currentYear = new Date().getFullYear();
  const currentQuarter = Math.floor(new Date().getMonth() / 3) + 1;
  const timeframe = `${currentYear}-Q${currentQuarter}`;
  await narrativeService.findByTimeframe(timeframe, 10, 0);

  // Get trends
  await narrativeService.getTrends(timeframe);

  // Cleanup old data (30 days ago)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  await narrativeService.cleanupOldData(cutoffDate);

  // Close the application
  await app.close();
}

// Run the example
bootstrap().catch((error) => console.error('Error in example:', error));
