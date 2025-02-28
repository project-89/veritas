import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class LoggingService {
  private context: string;

  constructor(@Optional() context?: string) {
    this.context = context || 'Global';
  }

  setContext(context: string): void {
    this.context = context || 'Global';
  }

  log(message: string, context?: string): void {
    const contextToUse = context || this.context;
    console.log(`[Log] [${contextToUse}] ${message}`);
  }

  error(message: string, trace?: string, context?: string): void {
    const contextToUse = context || this.context;
    console.error(`[Error] [${contextToUse}] ${message}`, trace || '');
  }

  warn(message: string, context?: string): void {
    const contextToUse = context || this.context;
    console.warn(`[Warn] [${contextToUse}] ${message}`);
  }

  info(message: string, context?: string): void {
    const contextToUse = context || this.context;
    console.info(`[Info] [${contextToUse}] ${message}`);
  }

  debug(message: string, context?: string): void {
    const contextToUse = context || this.context;
    console.debug(`[Debug] [${contextToUse}] ${message}`);
  }

  verbose(message: string, context?: string): void {
    const contextToUse = context || this.context;
    console.debug(`[Verbose] [${contextToUse}] ${message}`);
  }
}
