import { Logger } from '@nestjs/common';

export async function fetchWithRetry(
  url: string,
  options: {
    headers?: Record<string, string>;
    timeout?: number;
    maxRetries?: number;
    logger?: Logger;
    label?: string;
  },
): Promise<Response | null> {
  const { headers, timeout = 15000, maxRetries = 2, logger, label = 'fetch' } = options;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) {
        logger?.warn(`${label} returned HTTP ${response.status}`);
        return null;
      }
      return response;
    } catch (err) {
      if (attempt < maxRetries - 1) {
        logger?.debug(`${label} attempt ${attempt + 1} failed, retrying: ${err}`);
        continue;
      }
      logger?.warn(`${label} failed after ${maxRetries} attempts: ${err}`);
      return null;
    }
  }
  return null;
}
