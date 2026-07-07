import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Global API-key guard.
 *
 * When VERITAS_API_KEY is set, every request must present it via the
 * `x-api-key` header (or `Authorization: Bearer <key>`). When unset, the
 * guard allows everything — dev mode; `validateEnv()` refuses to start
 * production without a key.
 *
 * /health stays open so orchestrators can probe liveness without secrets.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env['VERITAS_API_KEY'];
    if (!expected) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (request.path === '/health') {
      return true;
    }

    const headerKey = request.headers['x-api-key'];
    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    // EventSource (SSE) cannot set request headers — allow ?apiKey= for streams
    const queryKey = request.query['apiKey'];
    const provided =
      typeof headerKey === 'string'
        ? headerKey
        : (bearer ?? (typeof queryKey === 'string' ? queryKey : undefined));

    if (provided !== expected) {
      throw new UnauthorizedException('Missing or invalid API key');
    }
    return true;
  }
}
