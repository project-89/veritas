import {
  extractDomain,
  formatUrl,
  hashContent,
  sanitizeHtml,
  slugify,
  truncateText,
} from '../src/lib/string-utils';

describe('string-utils', () => {
  describe('sanitizeHtml', () => {
    it('should remove simple HTML tags', () => {
      expect(sanitizeHtml('<p>Hello</p>')).toBe('Hello');
    });

    it('should remove nested HTML tags', () => {
      expect(sanitizeHtml('<div><p>Hello</p></div>')).toBe('Hello');
    });

    it('should remove tags with attributes', () => {
      expect(sanitizeHtml('<a href="https://example.com">Link</a>')).toBe('Link');
    });

    it('should remove self-closing tags', () => {
      expect(sanitizeHtml('Hello<br/>World')).toBe('HelloWorld');
    });

    it('should return the same string when no HTML is present', () => {
      expect(sanitizeHtml('Hello World')).toBe('Hello World');
    });

    it('should handle empty string', () => {
      expect(sanitizeHtml('')).toBe('');
    });

    it('should handle multiple tags in sequence', () => {
      expect(sanitizeHtml('<b>Bold</b> and <i>Italic</i>')).toBe('Bold and Italic');
    });

    it('should remove script tags', () => {
      expect(sanitizeHtml('<script>alert("xss")</script>Safe')).toBe('alert("xss")Safe');
    });
  });

  describe('truncateText', () => {
    it('should truncate text exceeding max length', () => {
      expect(truncateText('Hello World', 5)).toBe('Hello...');
    });

    it('should not truncate text within max length', () => {
      expect(truncateText('Hello', 5)).toBe('Hello');
    });

    it('should not truncate text equal to max length', () => {
      expect(truncateText('Hello', 5)).toBe('Hello');
    });

    it('should use custom ellipsis', () => {
      expect(truncateText('Hello World', 5, '---')).toBe('Hello---');
    });

    it('should handle empty string', () => {
      expect(truncateText('', 10)).toBe('');
    });

    it('should handle max length of 0', () => {
      expect(truncateText('Hello', 0)).toBe('...');
    });

    it('should handle single character truncation', () => {
      expect(truncateText('Hello', 1)).toBe('H...');
    });

    it('should return falsy input as-is', () => {
      expect(truncateText(undefined as unknown as string, 10)).toBeUndefined();
      expect(truncateText(null as unknown as string, 10)).toBeNull();
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

    it('should collapse multiple spaces into single hyphen', () => {
      expect(slugify('Hello   World')).toBe('hello-world');
    });

    it('should collapse multiple hyphens into single hyphen', () => {
      expect(slugify('Hello---World')).toBe('hello-world');
    });

    it('should handle already-slugified text', () => {
      expect(slugify('hello-world')).toBe('hello-world');
    });

    it('should handle empty string', () => {
      expect(slugify('')).toBe('');
    });

    it('should handle strings with numbers', () => {
      expect(slugify('Article 42 Title')).toBe('article-42-title');
    });

    it('should handle strings with mixed special characters', () => {
      expect(slugify('What?! A (great) article...')).toBe('what-a-great-article');
    });

    it('should handle leading and trailing spaces', () => {
      expect(slugify(' Hello World ')).toBe('-hello-world-');
    });
  });

  describe('formatUrl', () => {
    it('should combine base URL and path', () => {
      expect(formatUrl('https://example.com', '/api/users')).toBe('https://example.com/api/users');
    });

    it('should handle base URL with trailing slash', () => {
      expect(formatUrl('https://example.com/', '/api/users')).toBe('https://example.com/api/users');
    });

    it('should handle base URL with multiple trailing slashes', () => {
      expect(formatUrl('https://example.com///', '/api/users')).toBe(
        'https://example.com/api/users',
      );
    });

    it('should handle path without leading slash', () => {
      expect(formatUrl('https://example.com', 'api/users')).toBe('https://example.com/api/users');
    });

    it('should add query parameters', () => {
      const result = formatUrl('https://example.com', '/api/users', {
        page: 1,
        limit: 10,
      });
      expect(result).toBe('https://example.com/api/users?page=1&limit=10');
    });

    it('should handle string query parameters', () => {
      const result = formatUrl('https://example.com', '/search', {
        q: 'hello world',
      });
      expect(result).toBe('https://example.com/search?q=hello%20world');
    });

    it('should handle boolean query parameters', () => {
      const result = formatUrl('https://example.com', '/api', {
        active: true,
      });
      expect(result).toBe('https://example.com/api?active=true');
    });

    it('should filter out undefined query parameters', () => {
      const result = formatUrl('https://example.com', '/api', {
        a: 'value',
        b: undefined,
      });
      expect(result).toBe('https://example.com/api?a=value');
    });

    it('should not add query string when params is empty', () => {
      expect(formatUrl('https://example.com', '/api', {})).toBe('https://example.com/api');
    });

    it('should not add query string when params is undefined', () => {
      expect(formatUrl('https://example.com', '/api')).toBe('https://example.com/api');
    });

    it('should encode special characters in parameter keys and values', () => {
      const result = formatUrl('https://example.com', '/api', {
        'key with spaces': 'value&special=chars',
      });
      expect(result).toContain('key%20with%20spaces=value%26special%3Dchars');
    });
  });

  describe('hashContent', () => {
    it('should generate consistent hashes for the same input', () => {
      const hash1 = hashContent('test content');
      const hash2 = hashContent('test content');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different content', () => {
      const hash1 = hashContent('test content');
      const hash2 = hashContent('different content');
      expect(hash1).not.toBe(hash2);
    });

    it('should return a hex string', () => {
      const hash = hashContent('test');
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should incorporate salt into the hash', () => {
      const hash1 = hashContent('test', 'salt1');
      const hash2 = hashContent('test', 'salt2');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = hashContent('');
      expect(hash).toBe('0');
    });

    it('should handle empty string with salt', () => {
      const hash = hashContent('', 'salt');
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should produce the same hash with default empty salt', () => {
      const hash1 = hashContent('test');
      const hash2 = hashContent('test', '');
      expect(hash1).toBe(hash2);
    });
  });

  describe('extractDomain', () => {
    it('should extract domain from a standard URL', () => {
      expect(extractDomain('https://example.com/path')).toBe('example.com');
    });

    it('should extract domain from URL with subdomain', () => {
      expect(extractDomain('https://www.example.com')).toBe('www.example.com');
    });

    it('should extract domain from URL with port', () => {
      expect(extractDomain('http://localhost:3000/api')).toBe('localhost');
    });

    it('should extract domain from URL with query parameters', () => {
      expect(extractDomain('https://example.com?q=test')).toBe('example.com');
    });

    it('should return empty string for invalid URL', () => {
      expect(extractDomain('not-a-url')).toBe('');
    });

    it('should return empty string for empty string', () => {
      expect(extractDomain('')).toBe('');
    });

    it('should handle URLs with authentication', () => {
      expect(extractDomain('https://user:pass@example.com')).toBe('example.com');
    });

    it('should handle http protocol', () => {
      expect(extractDomain('http://example.com')).toBe('example.com');
    });
  });
});
