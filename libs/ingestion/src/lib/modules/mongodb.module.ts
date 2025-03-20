import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NarrativeInsightModel } from '../schemas/narrative-insight.schema';
import { NarrativeTrendModel } from '../schemas/narrative-trend.schema';

/**
 * MongoDB Module for managing database connections and schema registrations
 * This module uses Mongoose as the MongoDB ORM
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        // Get MongoDB URI from environment or use default with authentication
        const uri =
          configService.get<string>('MONGODB_URI') ||
          'mongodb://admin:password@localhost:27017/veritas';

        return {
          uri,
          useNewUrlParser: true,
          useUnifiedTopology: true,
        };
      },
    }),
    MongooseModule.forFeature([
      { name: 'NarrativeInsight', schema: NarrativeInsightModel },
      { name: 'NarrativeTrend', schema: NarrativeTrendModel },
    ]),
  ],
  exports: [MongooseModule],
})
export class MongoDBModule {}
