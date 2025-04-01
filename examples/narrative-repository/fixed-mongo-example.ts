import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { v4 as uuidv4 } from 'uuid';

// Note: Make sure to build the ingestion module first with: nx build ingestion
// Import from the @veritas/ingestion package
import {
  NarrativeModule,
  NarrativeRepository,
  NarrativeInsight,
  SocialMediaPost,
  TransformOnIngestService,
} from '@veritas/ingestion';

/**
 * Main application module that uses MongoDB for storage
 */
@Module({
  imports: [
    // Configure environment variables
    ConfigModule.forRoot(),
    // Use the MongoDB implementation for the repository
    NarrativeModule.forRoot({
      repositoryType: 'mongodb',
    }),
  ],
})
class AppModule {}

/**
 * Service class for working with narrative insights
 */
class NarrativeAnalyticsService {
  constructor(
    private readonly narrativeRepository: NarrativeRepository,
    private readonly transformService: TransformOnIngestService
  ) {}

  /**
   * Transform a social media post into an insight and store it
   */
  async trackPost(post: SocialMediaPost): Promise<NarrativeInsight> {
    console.log(`Tracking post: ${post.id}`);

    // Transform the post into an insight
    const insight = this.transformService.transform(post);

    // Save to repository
    await this.narrativeRepository.save(insight);

    return insight;
  }

  /**
   * Get insights for a specific quarter
   */
  async getInsightsForQuarter(
    year: number,
    quarter: number
  ): Promise<NarrativeInsight[]> {
    const timeframe = `${year}-Q${quarter}`;
    console.log(`Getting insights for timeframe: ${timeframe}`);

    return this.narrativeRepository.findByTimeframe(timeframe);
  }

  /**
   * Get trends for a specific quarter
   */
  async getTrendsForQuarter(year: number, quarter: number): Promise<any[]> {
    const timeframe = `${year}-Q${quarter}`;
    console.log(`Getting trends for timeframe: ${timeframe}`);

    return this.narrativeRepository.getTrendsByTimeframe(timeframe);
  }

  /**
   * Create a sample social media post
   */
  createSamplePost(): SocialMediaPost {
    return {
      id: uuidv4(),
      text: `Sample post about trends in technology and AI. #tech #AI #trending ${Date.now()}`,
      timestamp: new Date(),
      platform: 'twitter',
      authorId: `user_${Math.floor(Math.random() * 1000)}`,
      authorName: 'Example User',
      authorHandle: '@example_user',
      url: 'https://twitter.com/example_user/status/123456789',
      engagementMetrics: {
        likes: Math.floor(Math.random() * 100),
        shares: Math.floor(Math.random() * 50),
        comments: Math.floor(Math.random() * 20),
        reach: Math.floor(Math.random() * 1000),
        viralityScore: Math.random(),
      },
    };
  }

  /**
   * Clean up old data
   */
  async cleanupOldData(daysToRetain: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToRetain);

    console.log(`Cleaning up data older than: ${cutoffDate.toISOString()}`);

    return this.narrativeRepository.deleteOlderThan(cutoffDate);
  }
}

/**
 * Bootstrap the application
 */
async function bootstrap() {
  try {
    // Create NestJS application
    const app = await NestFactory.create(AppModule);
    const narrativeRepository = app.get(NarrativeRepository);
    const transformService = app.get(TransformOnIngestService);

    // Create the analytics service
    const analyticsService = new NarrativeAnalyticsService(
      narrativeRepository,
      transformService
    );

    console.log('Connected to MongoDB repository.');

    // Create and track a sample post
    const samplePost = analyticsService.createSamplePost();
    const insight = await analyticsService.trackPost(samplePost);

    console.log('Created and stored a sample insight:');
    console.log(`- ID: ${insight.id}`);
    console.log(`- Content Hash: ${insight.contentHash}`);
    console.log(`- Platform: ${insight.platform}`);
    console.log(`- Themes: ${insight.themes.join(', ')}`);

    // Find the insight by content hash
    const foundInsight = await narrativeRepository.findByContentHash(
      insight.contentHash
    );

    if (foundInsight) {
      console.log('Successfully retrieved the insight by content hash!');
    }

    // Get insights for the current quarter
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentQuarter = Math.floor(currentDate.getMonth() / 3) + 1;

    const timeframeInsights = await analyticsService.getInsightsForQuarter(
      currentYear,
      currentQuarter
    );

    console.log(
      `Found ${timeframeInsights.length} insights for Q${currentQuarter} ${currentYear}`
    );

    // Generate trends
    // This would typically happen with more data, but we'll demonstrate the API
    const trends = await analyticsService.getTrendsForQuarter(
      currentYear,
      currentQuarter
    );

    console.log(`Generated ${trends.length} trends for the timeframe`);

    await app.close();

    console.log('Example completed successfully!');
  } catch (error) {
    console.error('Error running example:', error);
  }
}

// Run the example
bootstrap();
