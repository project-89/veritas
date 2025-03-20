/**
 * This file helps resolve module imports and provides proper NestJS dependency injection
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NarrativeModule } from './narrative.module';

/**
 * Root module that imports and re-exports all necessary modules
 * This helps resolve circular dependencies and ensures proper injection
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    NarrativeModule.register(),
  ],
  exports: [NarrativeModule],
})
export class AppModule {}
