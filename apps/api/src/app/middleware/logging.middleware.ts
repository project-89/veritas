import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req;
    const startTime = Date.now();

    res.on('finish', () => {
      const elapsed = Date.now() - startTime;
      const { statusCode } = res;
      this.logger.log(`${method} ${originalUrl} ${statusCode} - ${elapsed}ms`);
    });

    next();
  }
}
