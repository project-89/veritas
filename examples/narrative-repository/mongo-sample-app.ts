import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Import from direct relative paths to avoid module resolution issues
import { NarrativeModule } from '@veritas/ingestion';
import { NarrativeRepository } from '@veritas/ingestion';
import { NarrativeInsight } from '../../libs/ingestion/src/lib/interfaces/narrative-insight.interface';
import { TransformOnIngestService } from '@veritas/ingestion';
import { SocialMediaPost } from '../../libs/ingestion/src/lib/interfaces/social-media-connector.interface';

/**
 * Sample application that demonstrates how to use the MongoDB repository
 * This example shows how to configure the application to use MongoDB for storage
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
 * Example service that uses the NarrativeRepository
 */
class NarrativeAnalyticsService {
  constructor(
    private readonly narrativeRepository: NarrativeRepository,
    private readonly transformService: TransformOnIngestService
  ) {}

  /**
   * Track a new social media post with anonymized storage
   */
  async trackPost(post: any): Promise<NarrativeInsight> {
    console.log(`Tracking post with text: ${post.text.substring(0, 50)}...`);

    // Transform the post into an anonymized insight
    const insight = this.transformService.transform(post);

    // Store the insight in MongoDB
    await this.narrativeRepository.save(insight);

    return insight;
  }

  /**
   * Find insights for a specific time period
   */
  async getInsightsForQuarter(
    year: number,
    quarter: number
  ): Promise<NarrativeInsight[]> {
    const timeframe = `${year}-Q${quarter}`;
    console.log(`Fetching insights for timeframe: ${timeframe}`);

    const insights = await this.narrativeRepository.findByTimeframe(timeframe);
    console.log(`Found ${insights.length} insights`);

    return insights;
  }

  /**
   * Get narrative trends for a specific time period
   */
  async getTrendsForQuarter(year: number, quarter: number): Promise<any[]> {
    const timeframe = `${year}-Q${quarter}`;
    console.log(`Analyzing trends for timeframe: ${timeframe}`);

    const trends = await this.narrativeRepository.getTrendsByTimeframe(
      timeframe
    );
    console.log(`Found ${trends.length} trends`);

    // Print the top 3 trends
    if (trends.length > 0) {
      console.log('\nTop Trends:');
      trends
        .sort((a, b) => b.narrativeScore - a.narrativeScore)
        .slice(0, 3)
        .forEach((trend, index) => {
          console.log(
            `${index + 1}. ${
              trend.primaryTheme
            } (score: ${trend.narrativeScore.toFixed(2)})`
          );
          console.log(`   Related themes: ${trend.relatedThemes.join(', ')}`);
          console.log(
            `   Sentiment: ${
              trend.sentimentTrend > 0
                ? 'Positive'
                : trend.sentimentTrend < 0
                ? 'Negative'
                : 'Neutral'
            }`
          );
          console.log(`   From ${trend.uniqueSourcesCount} unique sources`);
          console.log('');
        });
    }

    return trends;
  }

  /**
   * Clean up old data for compliance
   */
  async cleanupOldData(daysToRetain: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToRetain);

    console.log(`Deleting insights older than ${cutoffDate.toISOString()}`);
    const deletedCount = await this.narrativeRepository.deleteOlderThan(
      cutoffDate
    );
    console.log(`Deleted ${deletedCount} old insights`);

    return deletedCount;
  }
}

/**
 * Run the example application
 */
async function bootstrap() {
  console.log('Starting MongoDB Narrative Repository Demo...');
  console.log('-------------------------------------');

  // Create a NestJS application
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    // Get services from the DI container
    const repository = app.get(NarrativeRepository);
    const transformService = app.get(TransformOnIngestService);

    // Create sample insights
    const sampleInsights: NarrativeInsight[] = [
      {
        id: `demo-insight-1-${Date.now()}`,
        contentHash: `content-hash-politics-${Date.now()}`,
        sourceHash: `source-hash-${Date.now()}`,
        platform: 'twitter',
        timestamp: new Date(),
        themes: ['politics', 'elections'],
        entities: [
          { name: 'Elections', type: 'event', relevance: 0.9 },
          { name: 'Democracy', type: 'concept', relevance: 0.8 },
        ],
        sentiment: { score: 0.5, label: 'positive', confidence: 0.8 },
        engagement: {
          total: 250,
          breakdown: { likes: 150, shares: 70, comments: 30 },
        },
        narrativeScore: 0.75,
        processedAt: new Date(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      },
      {
        id: `demo-insight-2-${Date.now()}`,
        contentHash: `content-hash-climate-${Date.now()}`,
        sourceHash: `source-hash-${Date.now()}`,
        platform: 'facebook',
        timestamp: new Date(),
        themes: ['climate', 'environment'],
        entities: [
          { name: 'Climate Change', type: 'topic', relevance: 0.95 },
          { name: 'Environmental Policy', type: 'concept', relevance: 0.85 },
        ],
        sentiment: { score: -0.2, label: 'negative', confidence: 0.7 },
        engagement: {
          total: 500,
          breakdown: { likes: 300, shares: 150, comments: 50 },
        },
        narrativeScore: 0.85,
        processedAt: new Date(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      },
      {
        id: `demo-insight-3-${Date.now()}`,
        contentHash: `content-hash-economy-${Date.now()}`,
        sourceHash: `source-hash-${Date.now()}`,
        platform: 'reddit',
        timestamp: new Date(),
        themes: ['economy', 'inflation'],
        entities: [
          { name: 'Inflation', type: 'topic', relevance: 0.9 },
          { name: 'Economic Policy', type: 'concept', relevance: 0.8 },
        ],
        sentiment: { score: -0.5, label: 'negative', confidence: 0.9 },
        engagement: {
          total: 1000,
          breakdown: { likes: 600, shares: 200, comments: 200 },
        },
        narrativeScore: 0.9,
        processedAt: new Date(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      },
    ];

    console.log('Saving multiple insights...');
    await repository.saveMany(sampleInsights);

    // Wait a moment for the operation to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Demonstrate finding an insight by content hash
    const firstInsight = sampleInsights[0];
    console.log(
      `\nFinding insight by content hash: ${firstInsight.contentHash}`
    );
    const foundInsight = await repository.findByContentHash(
      firstInsight.contentHash
    );
    console.log('Found insight:', JSON.stringify(foundInsight, null, 2));

    // Demonstrate finding insights by timeframe (current quarter)
    const currentQuarter = `${new Date().getFullYear()}-Q${
      Math.floor(new Date().getMonth() / 3) + 1
    }`;
    console.log(`\nFinding insights for current timeframe: ${currentQuarter}`);
    const timeframeInsights = await repository.findByTimeframe(currentQuarter);
    console.log(
      `Found ${timeframeInsights.length} insights in the current timeframe`
    );

    // Generate trends for the current timeframe
    console.log('\nGenerating trends for the current timeframe...');
    const trends = await repository.getTrendsByTimeframe(currentQuarter);
    console.log(`Generated ${trends.length} trends:`);
    trends.forEach((trend) => {
      console.log(
        `- ${trend.primaryTheme}: Score ${trend.narrativeScore.toFixed(2)}, ${
          trend.insightCount
        } insights`
      );
    });

    // Demonstrate the transform service
    console.log('\nDemonstrating TransformOnIngestService...');
    const sampleContent =
      'This is sample content about politics and elections that needs to be transformed.';
    const sampleAuthor = 'Sample source from Twitter user @user12345';

    // Create a sample post to transform
    const samplePost = {
      id: `sample-post-${Date.now()}`,
      text: sampleContent,
      timestamp: new Date(),
      platform: 'twitter',
      authorId: 'user12345',
      authorName: 'Sample User',
      engagementMetrics: {
        likes: 45,
        shares: 12,
        comments: 8,
        reach: 500,
        viralityScore: 0.65,
      },
    };

    // Transform the post using the public transform method
    const transformedInsight = transformService.transform(samplePost);

    console.log('Transformed insight:');
    console.log(`- Content Hash: ${transformedInsight.contentHash}`);
    console.log(`- Source Hash: ${transformedInsight.sourceHash}`);
    console.log(`- Themes: ${transformedInsight.themes.join(', ')}`);
    console.log(
      `- Narrative Score: ${transformedInsight.narrativeScore.toFixed(2)}`
    );

    console.log('\nDemo completed successfully!');
  } catch (error) {
    console.error('Error in demo:', error);
  } finally {
    // Close the application
    await app.close();
  }
}

// Run the example
bootstrap().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
