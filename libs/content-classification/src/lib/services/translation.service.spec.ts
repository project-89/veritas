import { ConfigService } from '@nestjs/config';
import type { TranslationCacheStore } from './translation-cache.port';
import { TranslationService } from './translation.service';

/**
 * These cover the caching and degradation contract, which is what callers
 * actually depend on. The Gemini call itself is never exercised — without a
 * key the service reports unavailable and returns nulls, which is the
 * documented "degrade honestly" path.
 */
describe('TranslationService', () => {
  const configWithoutKey = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;

  const originalKey = process.env['GEMINI_API_KEY'];

  beforeEach(() => {
    delete process.env['GEMINI_API_KEY'];
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env['GEMINI_API_KEY'];
    else process.env['GEMINI_API_KEY'] = originalKey;
  });

  describe('without an API key', () => {
    it('reports itself unavailable rather than throwing', () => {
      const service = new TranslationService(configWithoutKey);
      expect(service.available).toBe(false);
    });

    it('returns one null per input so callers can keep the original text', async () => {
      const service = new TranslationService(configWithoutKey);
      const result = await service.translateTexts(['съешь ещё', 'этих булок'], 'ru');

      expect(result).toEqual([null, null]);
    });

    it('returns an empty array for empty input without touching the cache', async () => {
      const store: TranslationCacheStore = { get: jest.fn(), set: jest.fn() };
      const service = new TranslationService(configWithoutKey, store);

      expect(await service.translateTexts([], 'ru')).toEqual([]);
      expect(store.get).not.toHaveBeenCalled();
    });
  });

  describe('normalize', () => {
    it('passes English through untouched and free', async () => {
      const store: TranslationCacheStore = { get: jest.fn(), set: jest.fn() };
      const service = new TranslationService(configWithoutKey, store);

      const result = await service.normalize(['already english'], 'en');

      expect(result).toEqual([
        { text: 'already english', textEn: 'already english', language: 'en', translated: false },
      ]);
      // English must never reach the translation path at all.
      expect(store.get).not.toHaveBeenCalled();
    });

    it('marks translated:false when translation is unavailable', async () => {
      const service = new TranslationService(configWithoutKey);

      const result = await service.normalize(['Пошлины'], 'ru');

      expect(result).toEqual([
        { text: 'Пошлины', textEn: null, language: 'ru', translated: false },
      ]);
    });
  });

  describe('persistent cache', () => {
    it('serves a hit from the store without calling the model', async () => {
      const store: TranslationCacheStore = {
        get: jest.fn().mockResolvedValue('Import tariffs'),
        set: jest.fn().mockResolvedValue(undefined),
      };
      const service = new TranslationService(configWithoutKey, store);

      // No API key, so a cache miss would yield null. A non-null result proves
      // the persistent layer was consulted BEFORE the availability check.
      const result = await service.translateTexts(['Пошлины на импорт'], 'ru');

      expect(result).toEqual(['Import tariffs']);
      expect(store.set).not.toHaveBeenCalled();
    });

    it('keys the cache by kind, since each kind truncates differently', async () => {
      const store: TranslationCacheStore = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
      };
      const service = new TranslationService(configWithoutKey, store);

      await service.translateTexts(['Пошлины'], 'ru', 'headline');
      await service.translateTexts(['Пошлины'], 'ru', 'body');

      const keys = (store.get as jest.Mock).mock.calls.map((call) => call[0]);
      expect(keys[0]).toContain('headline:');
      expect(keys[1]).toContain('body:');
      expect(keys[0]).not.toEqual(keys[1]);
    });

    it('treats a broken cache as a miss instead of failing the translation', async () => {
      const store: TranslationCacheStore = {
        get: jest.fn().mockRejectedValue(new Error('mongo is down')),
        set: jest.fn(),
      };
      const service = new TranslationService(configWithoutKey, store);

      // Must not reject — a cache outage degrades to "no translation".
      await expect(service.translateTexts(['Пошлины'], 'ru')).resolves.toEqual([null]);
    });

    it('works with no store provided at all', async () => {
      const service = new TranslationService(configWithoutKey);
      await expect(service.translateTexts(['Пошлины'], 'ru')).resolves.toEqual([null]);
    });
  });
});
