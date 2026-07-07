import { ConfigService } from '@nestjs/config';
import { TransformOnIngestService } from '../../src/lib/services/transform/transform-on-ingest.service';
import { TruthSocialFreeConnector } from '../../src/lib/services/truthsocial-free.connector';
import { SubprocessUtil } from '../../src/lib/services/utils/subprocess.util';

function noop(): void {
  // Intentional no-op for logger spies in negative-path tests.
}

describe('TruthSocialFreeConnector', () => {
  let connector: TruthSocialFreeConnector;
  let configService: Partial<ConfigService>;
  let transformService: Partial<TransformOnIngestService>;
  let subprocessUtil: Partial<SubprocessUtil>;

  function markAvailable(): void {
    (connector as unknown as { available: boolean }).available = true;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    transformService = {
      transformBatch: jest.fn().mockResolvedValue([{ id: 'insight-1', contentHash: 'h1' }]),
    };

    subprocessUtil = {
      exec: jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
    };

    connector = new TruthSocialFreeConnector(
      configService as ConfigService,
      transformService as TransformOnIngestService,
      subprocessUtil as SubprocessUtil,
    );

    const logger = (
      connector as unknown as {
        logger: {
          warn: (...args: unknown[]) => void;
          error: (...args: unknown[]) => void;
        };
      }
    ).logger;
    jest.spyOn(logger, 'warn').mockImplementation(noop);
    jest.spyOn(logger, 'error').mockImplementation(noop);
  });

  describe('searchWithRawData', () => {
    it('throws when the connector is unavailable instead of returning []', async () => {
      await expect(connector.searchWithRawData('project89')).rejects.toThrow(
        'Truth Social search failed: connector unavailable',
      );
      expect(subprocessUtil.exec).not.toHaveBeenCalled();
    });

    it('throws when truthbrush exits non-zero', async () => {
      markAvailable();
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: '',
        stderr: 'login failed',
        exitCode: 1,
      });

      await expect(connector.searchWithRawData('project89')).rejects.toThrow(
        'Truth Social search failed: truthbrush search exited with code 1: login failed',
      );
    });

    it('returns empty results when the search succeeds but finds nothing', async () => {
      markAvailable();
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: '\n',
        stderr: '',
        exitCode: 0,
      });

      const result = await connector.searchWithRawData('no matches');

      expect(result).toEqual({ posts: [], insights: [] });
      expect(transformService.transformBatch).not.toHaveBeenCalled();
    });
  });
});
