import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as francMin from 'franc-min';
import { ContentClassificationService } from '../../src/lib/services/content-classification.service';

// Mock franc-min
jest.mock('franc-min', () => ({
  franc: jest.fn(),
}));

describe('ContentClassificationService', () => {
  let service: ContentClassificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentClassificationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'NLP_SERVICE_ENDPOINT') return null;
              if (key === 'NLP_SERVICE_API_KEY') return null;
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ContentClassificationService>(ContentClassificationService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectLanguage', () => {
    it('should return "en" for short text', async () => {
      const result = await service['detectLanguage']('hi');
      expect(result).toBe('en');
    });

    it('should detect English correctly', async () => {
      // Mock franc returning 'eng' for English text
      (francMin.franc as jest.Mock).mockReturnValue('eng');

      const result = await service['detectLanguage'](
        'This is a longer text that should be detected as English',
      );
      expect(francMin.franc).toHaveBeenCalled();
      expect(result).toBe('en');
    });

    it('should detect Spanish correctly', async () => {
      // Mock franc returning 'spa' for Spanish text
      (francMin.franc as jest.Mock).mockReturnValue('spa');

      const result = await service['detectLanguage'](
        'Este es un texto en español que debería ser detectado correctamente',
      );
      expect(francMin.franc).toHaveBeenCalled();
      expect(result).toBe('es');
    });

    it('should handle non-mapped languages', async () => {
      // Mock franc returning some less common language code
      (francMin.franc as jest.Mock).mockReturnValue('nob'); // Norwegian Bokmål

      const result = await service['detectLanguage']('Dette er en norsk tekst');
      expect(francMin.franc).toHaveBeenCalled();
      expect(result).toBe('nob'); // Should return the original code if not mapped
    });

    it('should handle errors and return English', async () => {
      // Mock franc throwing an error
      (francMin.franc as jest.Mock).mockImplementation(() => {
        throw new Error('Language detection failed');
      });

      const result = await service['detectLanguage']('Some text causing an error');
      expect(result).toBe('en'); // Should default to English on error
    });

    it('should handle undefined language detection', async () => {
      // Mock franc returning 'und' (undefined)
      (francMin.franc as jest.Mock).mockReturnValue('und');

      const result = await service['detectLanguage']('Text that cannot be identified');
      expect(francMin.franc).toHaveBeenCalled();
      expect(result).toBe('en'); // Should map 'und' to 'en'
    });
  });

  describe('extractTopics', () => {
    it('should extract main topics from text', () => {
      const text = 'Machine learning algorithms are transforming artificial intelligence research';
      const topics = service['extractTopics'](text);

      // Check that at least 3 of these keywords are present
      // The extractTopics method may only return 5 topics max, so we can't expect all of them
      const expectedKeywords = [
        'machine',
        'learning',
        'algorithms',
        'transforming',
        'artificial',
        'intelligence',
        'research',
      ];
      const foundKeywords = expectedKeywords.filter((keyword) => topics.includes(keyword));

      expect(foundKeywords.length).toBeGreaterThanOrEqual(3);

      // The extractor may return up to 6 topics when it needs extra single-occurrence fillers.
      expect(topics.length).toBeLessThanOrEqual(6);
    });

    it('should ignore stop words', () => {
      const text = 'The cat and the dog are in the house with their toys';
      const topics = service['extractTopics'](text);

      expect(topics).not.toContain('the');
      expect(topics).not.toContain('and');
      expect(topics).not.toContain('are');
      expect(topics).not.toContain('with');
    });

    it('should prioritize topics by frequency', () => {
      const text = 'Data science data analysis data visualization data science models';
      const topics = service['extractTopics'](text);

      // Repeated phrases should be surfaced first, while still retaining
      // the highest-signal single-word topics.
      expect(topics[0]).toBe('data science');
      expect(topics).toContain('analysis');
      expect(topics).toContain('visualization');
      expect(topics).toContain('models');
    });

    it('does not shatter accented words into fragments', () => {
      // Regression: `split(/[^a-z'-]+/)` turned "préférentiels" into
      // "pr"/"f"/"rentiels", and those fragments were surfaced as topics.
      const topics = service['extractTopics'](
        "les tarifs douaniers préférentiels de l'union européenne sur les tarifs douaniers",
      );

      expect(topics).not.toContain('rentiels');
      expect(topics).not.toContain('enne');
      expect(topics).not.toContain('europ');
    });

    it('does not surface foreign function words as topics', () => {
      // Regression: STOP_WORDS was English-only, so a French document's most
      // frequent tokens ("les", "des", "sont") ranked as its topics.
      const topics = service['extractTopics'](
        'les tarifs sont des taxes les tarifs sont des taxes pour les importations',
      );

      expect(topics).not.toContain('les');
      expect(topics).not.toContain('des');
      expect(topics).not.toContain('sont');
      expect(topics).not.toContain('pour');
      // Content words survive — as a bigram now that the function words
      // between them are stripped ("tarifs taxes").
      expect(topics.join(' ')).toContain('tarifs');
    });

    it('returns nothing for unsegmented scripts rather than pretending to succeed', () => {
      expect(service['extractTopics']('美国对中国商品加征关税')).toEqual([]);
    });
  });

  describe('non-English abstention', () => {
    it('abstains from topics and entities for confidently-detected non-English text', async () => {
      (francMin.franc as jest.Mock).mockReturnValue('fra');

      const classification = await service.classifyContent(
        "Les tarifs douaniers préférentiels de l'Union européenne sont vivement contestés " +
          'par plusieurs États membres cette semaine à Bruxelles',
      );

      expect(classification.language).toBe('fr');
      // Better to return nothing than fragments — the ingest layer is
      // responsible for supplying an English translation.
      expect(classification.topics).toEqual([]);
      expect(classification.entities).toEqual([]);
      // Language-independent signals are still produced.
      expect(classification.sentiment).toBeDefined();
      expect(classification.categories).toBeDefined();
    });

    it('abstains on non-Latin script even when the text is too short to detect reliably', async () => {
      (francMin.franc as jest.Mock).mockReturnValue('rus');

      const classification = await service.classifyContent('Пошлины на импорт');

      expect(classification.topics).toEqual([]);
      expect(classification.entities).toEqual([]);
    });

    it('abstains on non-Latin script even when the detector claims English', async () => {
      // detectLanguage() returns 'en' for anything under 10 chars, so short
      // Cyrillic/CJK posts reached the English pipeline and emitted non-Latin
      // tokens as "topics" while reporting language 'en'. Script is direct
      // evidence and must stand on its own, not be gated behind the detector.
      // Found by the ground-truth harness (scripts/eval, case `ru-forced-en`).
      (francMin.franc as jest.Mock).mockReturnValue('eng');

      const classification = await service.classifyContent('Пошлины на импорт стали выросли');

      expect(classification.topics).toEqual([]);
      expect(classification.entities).toEqual([]);
    });

    it('still analyses short English text that franc misdetects as another Latin language', async () => {
      // franc-min is unreliable under ~40 chars. Abstaining on a bare
      // misdetection would silently strip topics from real English posts,
      // which is a worse failure than the one abstention exists to fix.
      (francMin.franc as jest.Mock).mockReturnValue('fra');

      const classification = await service.classifyContent('tariffs on steel imports');

      expect(classification.topics.length).toBeGreaterThan(0);
      expect(classification.topics).toContain('tariffs');
    });
  });

  describe('classifyContent', () => {
    it('should classify content locally when NLP service is not configured', async () => {
      // Mock franc for language detection
      (francMin.franc as jest.Mock).mockReturnValue('eng');

      const classification = await service.classifyContent(
        'This is a test message for classification',
      );

      expect(classification).toBeDefined();
      expect(classification.language).toBe('en');
      expect(classification.categories).toBeDefined();
      expect(classification.topics).toBeDefined();
      expect(classification.entities).toBeDefined();
      expect(classification.sentiment).toBeDefined();
      expect(classification.toxicity).toBeDefined();
      expect(classification.subjectivity).toBeDefined();
    });
  });

  describe('extractEntities', () => {
    const extract = (text: string): Array<{ text: string; type: string; confidence: number }> =>
      service['extractEntities'](text);

    it('detects a real person name as a person entity', () => {
      const entities = extract('Barack Obama gave a speech yesterday.');
      const person = entities.find((e) => e.type === 'person');
      expect(person).toBeDefined();
      expect(person?.text.toLowerCase()).toContain('obama');
      expect(person?.confidence).toBeGreaterThan(0.7);
    });

    it('detects an organization', () => {
      const entities = extract('Apple Inc reported record earnings this quarter.');
      const org = entities.find((e) => e.type === 'organization');
      expect(org).toBeDefined();
      expect(org?.text.toLowerCase()).toContain('apple');
    });

    it('detects a location', () => {
      const entities = extract('The summit was held in London this week.');
      const location = entities.find((e) => e.type === 'location');
      expect(location).toBeDefined();
      expect(location?.text.toLowerCase()).toContain('london');
    });

    it('does NOT misclassify a non-person capitalized phrase as a person', () => {
      // The old regex tagged any two capitalized words as a person @0.7.
      const entities = extract('Breaking News reported that a New Report shows growth.');
      const people = entities.filter((e) => e.type === 'person');
      expect(people.map((e) => e.text)).not.toContain('Breaking News');
      expect(people.map((e) => e.text)).not.toContain('New Report');
    });

    it('extracts hashtags and mentions from social content', () => {
      const entities = extract('Loving the #election coverage from @newsdesk today.');
      const hashtag = entities.find((e) => e.type === 'hashtag');
      const mention = entities.find((e) => e.type === 'mention');
      expect(hashtag?.text).toBe('#election');
      expect(mention?.text).toBe('@newsdesk');
    });

    it('returns an empty array for empty or whitespace text', () => {
      expect(extract('')).toEqual([]);
      expect(extract('   \n  ')).toEqual([]);
    });

    it('dedupes repeated entities keeping a single entry per type/text', () => {
      const entities = extract('Barack Obama spoke. Barack Obama waved. Barack Obama left.');
      const obamas = entities.filter((e) => e.text.toLowerCase() === 'barack obama');
      expect(obamas.length).toBe(1);
    });
  });
});
