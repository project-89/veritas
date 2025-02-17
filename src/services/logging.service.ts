import { Injectable, LogLevel, Scope, LoggerService } from "@nestjs/common";

@Injectable({ scope: Scope.TRANSIENT })
export class LoggingService implements LoggerService {
  private context?: string;

  setContext(context: string) {
    this.context = context;
    return this;
  }

  log(message: string, context?: string) {
    console.log(`[Log] ${this.getContext(context)} ${message}`);
  }

  error(message: string, trace?: string, context?: string) {
    console.error(
      `[Error] ${this.getContext(context)} ${message}`,
      trace || ""
    );
  }

  warn(message: string, context?: string) {
    console.warn(`[Warn] ${this.getContext(context)} ${message}`);
  }

  info(message: string, context?: string) {
    console.info(`[Info] ${this.getContext(context)} ${message}`);
  }

  debug(message: string, context?: string) {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[Debug] ${this.getContext(context)} ${message}`);
    }
  }

  verbose(message: string, context?: string) {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[Verbose] ${this.getContext(context)} ${message}`);
    }
  }

  private getContext(context?: string): string {
    return `[${context || this.context || "Global"}]`;
  }
}
