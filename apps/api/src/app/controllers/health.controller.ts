import { Controller, Get, Optional } from '@nestjs/common';
import { DatabaseService } from '@veritas/database';

interface HealthReport {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  mongo: 'connected' | 'disconnected' | 'unknown';
}

/**
 * Liveness/readiness probe. Deliberately unauthenticated (exempted in
 * ApiKeyGuard) and dependency-tolerant so orchestrators get an answer even
 * when backing services are down.
 */
@Controller('health')
export class HealthController {
  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  @Get()
  getHealth(): HealthReport {
    let mongo: HealthReport['mongo'] = 'unknown';
    try {
      if (this.databaseService) {
        mongo = this.databaseService.isConnected() ? 'connected' : 'disconnected';
      }
    } catch {
      mongo = 'disconnected';
    }

    return {
      status: mongo === 'disconnected' ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      mongo,
    };
  }
}
