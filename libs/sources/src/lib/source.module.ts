import { Module } from '@nestjs/common';
import { DatabaseModule } from '@veritas/database';
import { SourceResolver } from './resolvers/source.resolver';
import { SourceService } from './services/source.service';
import { SourceValidationService } from './services/source-validation.service';
import { SourceController } from './source.controller';

@Module({
  imports: [DatabaseModule],
  providers: [SourceService, SourceResolver, SourceValidationService],
  controllers: [SourceController],
  exports: [SourceService],
})
export class SourceModule {}
