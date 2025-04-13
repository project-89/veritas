import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ContentClassificationService } from './content-classification.service';
import * as francMin from 'franc-min';

// Mock the franc-min module
jest.mock('franc-min', () => ({
  franc: jest.fn(),
}));

describe('ContentClassificationService', () => {
  let service: ContentClassificationService;
  let configService: ConfigService;

  beforeEach(async () => {
    // Mock the configService
    const configServiceMock = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'NLP_SERVICE_ENDPOINT') return null;
        if (key === 'NLP_SERVICE_API_KEY') return null;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentClassificationService,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get<ContentClassificationService>(
      ContentClassificationService
    );
    configService = module.get<ConfigService>(ConfigService);

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectLanguage', () => {
    it('should return "en" for short text', () => {
      // Access private method using any type
      const result = (service as any).detectLanguage('Hello');
      expect(result).toBe('en');
      expect(francMin.franc).not.toHaveBeenCalled();
    });

    it('should detect English text correctly', () => {
      // Mock the franc function to return English
      (francMin.franc as jest.Mock).mockReturnValue('eng');

      const text =
        'This is a sample English text that should be detected as English';
      const result = (service as any).detectLanguage(text);

      expect(francMin.franc).toHaveBeenCalledWith(text);
      expect(result).toBe('en');
    });

    it('should detect Spanish text correctly', () => {
      // Mock the franc function to return Spanish
      (francMin.franc as jest.Mock).mockReturnValue('spa');

      const text =
        'Este es un texto de muestra en español que debería detectarse como español';
      const result = (service as any).detectLanguage(text);

      expect(francMin.franc).toHaveBeenCalledWith(text);
      expect(result).toBe('es');
    });

    it('should handle non-mapped languages', () => {
      // Mock the franc function to return a non-mapped language
      (francMin.franc as jest.Mock).mockReturnValue('ukr'); // Ukrainian

      const text =
        'Це зразок українського тексту, який повинен визначатися як українська';
      const result = (service as any).detectLanguage(text);

      expect(francMin.franc).toHaveBeenCalledWith(text);
      expect(result).toBe('ukr'); // Should return the original code
    });

    it('should handle detection errors gracefully', () => {
      // Mock the franc function to throw an error
      (francMin.franc as jest.Mock).mockImplementation(() => {
        throw new Error('Test error');
      });

      const text = 'This text will cause an error in language detection';
      const result = (service as any).detectLanguage(text);

      expect(francMin.franc).toHaveBeenCalledWith(text);
      expect(result).toBe('en'); // Should default to English on error
    });

    it('should handle undefined language detection', () => {
      // Mock the franc function to return 'und' (undefined)
      (francMin.franc as jest.Mock).mockReturnValue('und');

      const text = '12345 67890 !@#$%^&*()';
      const result = (service as any).detectLanguage(text);

      expect(francMin.franc).toHaveBeenCalledWith(text);
      expect(result).toBe('en'); // Should map undefined to English
    });
  });

  describe('extractTopics', () => {
    it('should extract main topics from text', () => {
      const text =
        'Artificial intelligence and machine learning are transforming technology sector businesses';
      const result = (service as any).extractTopics(text);

      // Topics should include important keywords from the text
      expect(result).toContain('artificial');
      expect(result).toContain('intelligence');
      expect(result).toContain('machine');
      expect(result).toContain('learning');
      expect(result).toContain('transforming');

      // Should not include stop words
      expect(result).not.toContain('and');
      expect(result).not.toContain('are');

      // Should be limited to 5 topics max
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should return expected topics for short text', () => {
      const text = 'Short text';
      const result = (service as any).extractTopics(text);

      // Both "short" and "text" are 4+ chars and not stop words
      expect(result).toEqual(['short', 'text']);
    });

    it('should ignore stop words', () => {
      const text = 'The and a in to of is it that for with as be';
      const result = (service as any).extractTopics(text);

      // All of these are stop words
      expect(result).toEqual([]);
    });

    it('should prioritize by frequency', () => {
      const text =
        'technology technology technology innovation innovation research';
      const result = (service as any).extractTopics(text);

      // Should be ordered by frequency
      expect(result[0]).toBe('technology');
      expect(result[1]).toBe('innovation');
      expect(result[2]).toBe('research');
    });
  });
});
