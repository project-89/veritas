import { truncateText, slugify, hashContent } from './string-utils';
import { formatDate, parseTimeframe } from './date-utils';
import { deepClone, getNestedProperty } from './object-utils';
import { isValidEmail, isValidUrl } from './validation-utils';
import { normalizeValue, calculateEngagementScore } from './scoring-utils';
import { adjustColorOpacity, getContrastingTextColor } from './color-utils';

describe('string-utils', () => {
  describe('truncateText', () => {
    it('should truncate text that exceeds max length', () => {
      expect(truncateText('Hello World', 5)).toBe('Hello...');
    });

    it('should not truncate text within max length', () => {
      expect(truncateText('Hello', 5)).toBe('Hello');
    });

    it('should use custom ellipsis if provided', () => {
      expect(truncateText('Hello World', 5, '—')).toBe('Hello—');
    });
  });

  describe('slugify', () => {
    it('should convert spaces to hyphens', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    it('should remove special characters', () => {
      expect(slugify('Hello, World!')).toBe('hello-world');
    });

    it('should convert to lowercase', () => {
      expect(slugify('HELLO WORLD')).toBe('hello-world');
    });
  });

  describe('hashContent', () => {
    it('should generate consistent hashes', () => {
      const hash1 = hashContent('test content');
      const hash2 = hashContent('test content');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different content', () => {
      const hash1 = hashContent('test content');
      const hash2 = hashContent('different content');
      expect(hash1).not.toBe(hash2);
    });
  });
});

describe('date-utils', () => {
  describe('formatDate', () => {
    it('should format date with default format', () => {
      const date = new Date(2023, 0, 15); // Jan 15, 2023
      expect(formatDate(date)).toBe('2023-01-15');
    });

    it('should format date with custom format', () => {
      const date = new Date(2023, 0, 15, 14, 30); // Jan 15, 2023, 14:30
      expect(formatDate(date, 'MM/DD/YYYY HH:mm')).toBe('01/15/2023 14:30');
    });
  });

  describe('parseTimeframe', () => {
    it('should parse last-24h timeframe', () => {
      const result = parseTimeframe('last-24h');
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setHours(yesterday.getHours() - 24);

      // Use timestamp comparison to avoid millisecond differences
      expect(result.endDate.getTime()).toBeCloseTo(now.getTime(), -3);
      expect(result.startDate.getTime()).toBeCloseTo(yesterday.getTime(), -3);
    });
  });
});

describe('object-utils', () => {
  describe('deepClone', () => {
    it('should create a deep copy of an object', () => {
      const original = { a: 1, b: { c: 2 } };
      const clone = deepClone(original);

      // Modify the clone
      clone.b.c = 3;

      // Original should be unchanged
      expect(original.b.c).toBe(2);
      expect(clone.b.c).toBe(3);
    });
  });

  describe('getNestedProperty', () => {
    it('should get a nested property', () => {
      const obj = { user: { profile: { name: 'John' } } };
      expect(getNestedProperty(obj, 'user.profile.name')).toBe('John');
    });

    it('should return default value if property not found', () => {
      const obj = { user: { profile: {} } };
      expect(getNestedProperty(obj, 'user.profile.name', 'Anonymous')).toBe(
        'Anonymous'
      );
    });
  });
});

describe('validation-utils', () => {
  describe('isValidEmail', () => {
    it('should validate correct email addresses', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(isValidEmail('test@')).toBe(false);
      expect(isValidEmail('test.com')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    it('should validate correct URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://example.com')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidUrl('example.com')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });

    it('should enforce HTTPS when required', () => {
      expect(isValidUrl('http://example.com', true)).toBe(false);
      expect(isValidUrl('https://example.com', true)).toBe(true);
    });
  });
});

describe('scoring-utils', () => {
  describe('normalizeValue', () => {
    it('should normalize a value to range 0-1', () => {
      expect(normalizeValue(5, 0, 10)).toBe(0.5);
      expect(normalizeValue(0, 0, 10)).toBe(0);
      expect(normalizeValue(10, 0, 10)).toBe(1);
    });

    it('should handle values outside the range', () => {
      expect(normalizeValue(-5, 0, 10)).toBe(0);
      expect(normalizeValue(15, 0, 10)).toBe(1);
    });
  });

  describe('calculateEngagementScore', () => {
    it('should calculate engagement score', () => {
      const score = calculateEngagementScore({
        likes: 100,
        shares: 50,
        comments: 25,
        reach: 1000,
      });

      // Should return a value between 0 and 1
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });
  });
});

describe('color-utils', () => {
  describe('adjustColorOpacity', () => {
    it('should convert hex color to rgba with specified opacity', () => {
      expect(adjustColorOpacity('#FF0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    });
  });

  describe('getContrastingTextColor', () => {
    it('should return white for dark backgrounds', () => {
      expect(getContrastingTextColor('#000000')).toBe('#FFFFFF');
      expect(getContrastingTextColor('#123456')).toBe('#FFFFFF');
    });

    it('should return black for light backgrounds', () => {
      expect(getContrastingTextColor('#FFFFFF')).toBe('#000000');
      expect(getContrastingTextColor('#EEEEEE')).toBe('#000000');
    });
  });
});
