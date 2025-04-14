import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ContentClassificationService } from './content-classification.service';
import * as francMin from 'franc-min';

// Mock franc-min
jest.mock('franc-min', () => ({
  franc: jest.fn(),
}));

describe('ContentClassificationService', () => {
  let service: ContentClassificationService;
  let configService: ConfigService;

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

    service = module.get<ContentClassificationService>(
      ContentClassificationService
    );
    configService = module.get<ConfigService>(ConfigService);

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
        'This is a longer text that should be detected as English'
      );
      expect(francMin.franc).toHaveBeenCalled();
      expect(result).toBe('en');
    });

    it('should detect Spanish correctly', async () => {
      // Mock franc returning 'spa' for Spanish text
      (francMin.franc as jest.Mock).mockReturnValue('spa');

      const result = await service['detectLanguage'](
        'Este es un texto en español que debería ser detectado correctamente'
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

      const result = await service['detectLanguage'](
        'Some text causing an error'
      );
      expect(result).toBe('en'); // Should default to English on error
    });

    it('should handle undefined language detection', async () => {
      // Mock franc returning 'und' (undefined)
      (francMin.franc as jest.Mock).mockReturnValue('und');

      const result = await service['detectLanguage'](
        'Text that cannot be identified'
      );
      expect(francMin.franc).toHaveBeenCalled();
      expect(result).toBe('en'); // Should map 'und' to 'en'
    });
  });

  describe('extractTopics', () => {
    it('should extract main topics from text', () => {
      const text =
        'Machine learning algorithms are transforming artificial intelligence research';
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
      const foundKeywords = expectedKeywords.filter((keyword) =>
        topics.includes(keyword)
      );

      expect(foundKeywords.length).toBeGreaterThanOrEqual(3);

      // Also check that the returned topics array has the expected length (should be 5 or less)
      expect(topics.length).toBeLessThanOrEqual(5);
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
      const text =
        'Data science data analysis data visualization data science models';
      const topics = service['extractTopics'](text);

      // 'data' should be the first topic because it appears most frequently
      expect(topics[0]).toBe('data');
      expect(topics).toContain('science');
      expect(topics).toContain('analysis');
      expect(topics).toContain('visualization');
    });
  });

  describe('classifyContent', () => {
    it('should classify content locally when NLP service is not configured', async () => {
      // Mock franc for language detection
      (francMin.franc as jest.Mock).mockReturnValue('eng');

      const classification = await service.classifyContent(
        'This is a test message for classification'
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
});
