import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface JinaReaderOptions {
  format?: 'markdown' | 'text' | 'html';
  timeout?: number;
}

export interface JinaReaderResult {
  content: string;
  title?: string;
  url: string;
  description?: string;
}

@Injectable()
export class JinaReaderService {
  private readonly logger = new Logger(JinaReaderService.name);
  private readonly client: AxiosInstance;
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 1000;

  constructor(private readonly configService: ConfigService) {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    const apiKey = this.configService.get<string>('JINA_API_KEY');
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    this.client = axios.create({
      baseURL: 'https://r.jina.ai/',
      headers,
      timeout: 30000,
    });
  }

  /**
   * Read a URL and return clean content via Jina Reader
   */
  async readUrl(
    url: string,
    options?: JinaReaderOptions
  ): Promise<JinaReaderResult> {
    const format = options?.format ?? 'markdown';
    const timeout = options?.timeout ?? 30000;

    const headers: Record<string, string> = {
      'X-Return-Format': format,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.client.get(encodeURIComponent(url), {
          headers,
          timeout,
        });

        const data = response.data;

        // Jina Reader returns JSON with data field when Accept: application/json
        if (data && typeof data === 'object' && data.data) {
          return {
            content: data.data.content || '',
            title: data.data.title,
            url: data.data.url || url,
            description: data.data.description,
          };
        }

        // Fallback: response is raw text
        return {
          content: typeof data === 'string' ? data : JSON.stringify(data),
          url,
        };
      } catch (error: any) {
        lastError = error;

        if (attempt < this.maxRetries - 1) {
          const delay = this.baseDelayMs * Math.pow(2, attempt);
          this.logger.warn(
            `Jina Reader request failed (attempt ${attempt + 1}/${this.maxRetries}), retrying in ${delay}ms: ${error.message}`
          );
          await this.sleep(delay);
        }
      }
    }

    this.logger.error(`Jina Reader failed after ${this.maxRetries} attempts for URL: ${url}`);
    throw lastError || new Error(`Failed to read URL: ${url}`);
  }

  /**
   * Check if the Jina Reader service is accessible
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.readUrl('https://example.com', { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
