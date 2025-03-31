import { Module, DynamicModule } from '@nestjs/common';
import { ContentService } from './services/content.service';
import { SourceService } from './services/source.service';

@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [ContentService, SourceService],
      exports: [ContentService, SourceService],
    };
  }
}
