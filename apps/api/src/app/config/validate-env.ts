import { Logger } from '@nestjs/common';

/**
 * Validate environment configuration at bootstrap.
 *
 * Fails fast (throws) on configuration that would be unsafe or broken at
 * runtime, and logs capability warnings for optional services so degraded
 * modes are visible in the startup log instead of surfacing as mystery
 * empty results later.
 */
export function validateEnv(): void {
  const logger = new Logger('EnvValidation');
  const isProduction = process.env['NODE_ENV'] === 'production';
  const errors: string[] = [];

  // --- Hard requirements -----------------------------------------------------
  const mongoUri = process.env['MONGODB_URI'];
  if (mongoUri && !/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
    errors.push(`MONGODB_URI is malformed: "${mongoUri}" (must start with mongodb:// or mongodb+srv://)`);
  }
  if (isProduction && !mongoUri) {
    errors.push('MONGODB_URI must be set in production');
  }

  if (isProduction) {
    const corsOrigins = parseCorsOrigins();
    if (corsOrigins.length === 0) {
      errors.push(
        'CORS_ORIGIN must be an explicit comma-separated origin list in production (wildcard is not allowed)',
      );
    }
    if (!process.env['VERITAS_API_KEY']) {
      errors.push(
        'VERITAS_API_KEY must be set in production — without it the API accepts unauthenticated requests that can trigger paid LLM analysis',
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Refusing to start with unsafe configuration:\n- ${errors.join('\n- ')}`);
  }

  // --- Capability warnings ---------------------------------------------------
  if (!process.env['GEMINI_API_KEY']) {
    logger.warn(
      'GEMINI_API_KEY not set — propaganda analysis, claim verification, and other LLM features will report themselves as unavailable/heuristic',
    );
  }
  if (!process.env['VERITAS_API_KEY']) {
    logger.warn('VERITAS_API_KEY not set — API authentication is DISABLED (dev mode only)');
  }
  if (!process.env['REDIS_HOST']) {
    logger.warn('REDIS_HOST not set — using localhost for the BullMQ job queues');
  }
}

/** CORS origins from the CORS_ORIGIN env var (comma-separated). */
export function parseCorsOrigins(): string[] {
  return (process.env['CORS_ORIGIN'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== '*');
}
