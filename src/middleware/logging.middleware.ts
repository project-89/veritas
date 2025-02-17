import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { LoggingService } from "../services/logging.service";

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  constructor(private readonly logger: LoggingService) {
    this.logger.setContext("HTTP");
  }

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get("user-agent") || "";
    const startTime = Date.now();

    this.logger.info(
      `Incoming ${method} ${originalUrl} from ${ip} using ${userAgent}`
    );

    res.on("finish", () => {
      const { statusCode } = res;
      const contentLength = res.get("content-length");
      const duration = Date.now() - startTime;

      const message = `${method} ${originalUrl} ${statusCode} ${contentLength}b - ${duration}ms`;

      if (statusCode >= 500) {
        this.logger.error(message);
      } else if (statusCode >= 400) {
        this.logger.warn(message);
      } else {
        this.logger.info(message);
      }
    });

    next();
  }
}
