import { ConfigService } from '@nestjs/config';
import { JinaReaderService } from './jina-reader.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('JinaReaderService', () => {
  let service: JinaReaderService;
  let configService: Partial<ConfigService>;
  let mockAxiosInstance: {
    get: jest.Mock;
    defaults: { headers: Record<string, unknown> };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockAxiosInstance = {
      get: jest.fn(),
      defaults: { headers: {} },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    configService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    service = new JinaReaderService(configService as ConfigService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create axios client without auth header when no API key', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://r.jina.ai/',
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
        })
      );

      const createCall = mockedAxios.create.mock.calls[0]![0];
      expect(createCall?.headers).not.toHaveProperty('Authorization');
    });

    it('should include Authorization header when API key is configured', () => {
      (configService.get as jest.Mock).mockReturnValue('test-api-key');

      new JinaReaderService(configService as ConfigService);

      const createCall = mockedAxios.create.mock.calls[1]![0];
      expect(createCall?.headers).toHaveProperty(
        'Authorization',
        'Bearer test-api-key'
      );
    });
  });

  describe('readUrl', () => {
    it('should return structured result from Jina JSON response', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: {
            content: 'Page content here',
            title: 'Page Title',
            url: 'https://example.com',
            description: 'A description',
          },
        },
      });

      const result = await service.readUrl('https://example.com');

      expect(result).toEqual({
        content: 'Page content here',
        title: 'Page Title',
        url: 'https://example.com',
        description: 'A description',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        encodeURIComponent('https://example.com'),
        expect.objectContaining({
          headers: { 'X-Return-Format': 'markdown' },
          timeout: 30000,
        })
      );
    });

    it('should use custom format and timeout options', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { data: { content: 'text', url: 'https://example.com' } },
      });

      await service.readUrl('https://example.com', {
        format: 'text',
        timeout: 5000,
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { 'X-Return-Format': 'text' },
          timeout: 5000,
        })
      );
    });

    it('should fallback to raw text when response has no data.data', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: 'Raw text content',
      });

      const result = await service.readUrl('https://example.com');

      expect(result).toEqual({
        content: 'Raw text content',
        url: 'https://example.com',
      });
    });

    it('should JSON-stringify non-string fallback data', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { unexpected: 'format' },
      });

      const result = await service.readUrl('https://example.com');

      expect(result.content).toBe('{"unexpected":"format"}');
    });

    it('should retry on failure with exponential backoff', async () => {
      mockAxiosInstance.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          data: { data: { content: 'success', url: 'https://example.com' } },
        });

      const resultPromise = service.readUrl('https://example.com');

      // Advance past first retry delay (1000ms)
      await jest.advanceTimersByTimeAsync(1000);
      // Advance past second retry delay (2000ms)
      await jest.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;

      expect(result.content).toBe('success');
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3);
    });

    it('should throw after exhausting all retries', async () => {
      jest.useRealTimers();

      // Create a new service for this test since we need real timers
      const fastService = new JinaReaderService(configService as ConfigService);
      const fastClient = mockedAxios.create.mock.results[mockedAxios.create.mock.results.length - 1]!.value;

      const error = new Error('Persistent failure');
      fastClient.get.mockRejectedValue(error);

      // Override the sleep to be instant
      (fastService as any).baseDelayMs = 0;

      await expect(fastService.readUrl('https://example.com')).rejects.toThrow(
        'Persistent failure'
      );
      expect(fastClient.get).toHaveBeenCalledTimes(3);

      jest.useFakeTimers();
    });

    it('should handle empty content in data.data', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: {
            content: '',
            title: undefined,
            url: undefined,
          },
        },
      });

      const result = await service.readUrl('https://example.com');

      expect(result.content).toBe('');
      expect(result.url).toBe('https://example.com');
    });
  });

  describe('isAvailable', () => {
    it('should return true when readUrl succeeds', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { data: { content: 'ok', url: 'https://example.com' } },
      });

      const result = await service.isAvailable();
      expect(result).toBe(true);
    });

    it('should return false when readUrl fails after all retries', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('not available'));

      const resultPromise = service.isAvailable();

      // Advance through all retry timers
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;
      expect(result).toBe(false);
    });
  });
});
