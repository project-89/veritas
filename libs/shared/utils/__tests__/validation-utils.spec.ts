import {
  hasRequiredFields,
  isArray,
  isBoolean,
  isLengthValid,
  isNumber,
  isNumberInRange,
  isObject,
  isString,
  isValidDate,
  isValidEmail,
  isValidUrl,
} from '../src/lib/validation-utils';

describe('validation-utils', () => {
  describe('isValidEmail', () => {
    it('should accept a valid email', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
    });

    it('should accept email with subdomain', () => {
      expect(isValidEmail('user@mail.example.com')).toBe(true);
    });

    it('should accept email with plus addressing', () => {
      expect(isValidEmail('user+tag@example.com')).toBe(true);
    });

    it('should accept email with dots in local part', () => {
      expect(isValidEmail('first.last@example.com')).toBe(true);
    });

    it('should reject email without @', () => {
      expect(isValidEmail('testexample.com')).toBe(false);
    });

    it('should reject email without domain', () => {
      expect(isValidEmail('test@')).toBe(false);
    });

    it('should reject email without TLD', () => {
      expect(isValidEmail('test@example')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidEmail('')).toBe(false);
    });

    it('should reject null/undefined coerced to string', () => {
      expect(isValidEmail(null as unknown as string)).toBe(false);
      expect(isValidEmail(undefined as unknown as string)).toBe(false);
    });

    it('should reject email with spaces', () => {
      expect(isValidEmail('test @example.com')).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    it('should accept a valid HTTPS URL', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
    });

    it('should accept a valid HTTP URL', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
    });

    it('should accept URL with path', () => {
      expect(isValidUrl('https://example.com/path/to/page')).toBe(true);
    });

    it('should accept URL with query parameters', () => {
      expect(isValidUrl('https://example.com?key=value')).toBe(true);
    });

    it('should reject string without protocol', () => {
      expect(isValidUrl('example.com')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidUrl('')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidUrl(null as unknown as string)).toBe(false);
      expect(isValidUrl(undefined as unknown as string)).toBe(false);
    });

    it('should reject non-http protocols', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('file:///path/to/file')).toBe(false);
    });

    describe('requireHttps', () => {
      it('should accept HTTPS when requireHttps is true', () => {
        expect(isValidUrl('https://example.com', true)).toBe(true);
      });

      it('should reject HTTP when requireHttps is true', () => {
        expect(isValidUrl('http://example.com', true)).toBe(false);
      });

      it('should accept HTTP when requireHttps is false', () => {
        expect(isValidUrl('http://example.com', false)).toBe(true);
      });
    });
  });

  describe('isValidDate', () => {
    it('should accept a valid ISO date string', () => {
      expect(isValidDate('2023-01-15')).toBe(true);
    });

    it('should accept a valid datetime string', () => {
      expect(isValidDate('2023-01-15T10:30:00Z')).toBe(true);
    });

    it('should accept a human-readable date string', () => {
      expect(isValidDate('January 15, 2023')).toBe(true);
    });

    it('should reject an invalid date string', () => {
      expect(isValidDate('not-a-date')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidDate('')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidDate(null as unknown as string)).toBe(false);
      expect(isValidDate(undefined as unknown as string)).toBe(false);
    });

    describe('allowFuture', () => {
      it('should accept past dates when allowFuture is false', () => {
        expect(isValidDate('2000-01-01', false)).toBe(true);
      });

      it('should reject future dates when allowFuture is false', () => {
        expect(isValidDate('2099-01-01', false)).toBe(false);
      });

      it('should accept future dates when allowFuture is true (default)', () => {
        expect(isValidDate('2099-01-01')).toBe(true);
      });
    });
  });

  describe('isString', () => {
    it('should return true for string values', () => {
      expect(isString('hello')).toBe(true);
      expect(isString('')).toBe(true);
    });

    it('should return false for non-string values', () => {
      expect(isString(42)).toBe(false);
      expect(isString(true)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString({})).toBe(false);
      expect(isString([])).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('should return true for numeric values', () => {
      expect(isNumber(42)).toBe(true);
      expect(isNumber(0)).toBe(true);
      expect(isNumber(-1)).toBe(true);
      expect(isNumber(3.14)).toBe(true);
    });

    it('should return false for NaN', () => {
      expect(isNumber(NaN)).toBe(false);
    });

    it('should return false for non-number values', () => {
      expect(isNumber('42')).toBe(false);
      expect(isNumber(null)).toBe(false);
      expect(isNumber(undefined)).toBe(false);
      expect(isNumber(true)).toBe(false);
    });

    it('should return true for Infinity', () => {
      expect(isNumber(Infinity)).toBe(true);
      expect(isNumber(-Infinity)).toBe(true);
    });
  });

  describe('isBoolean', () => {
    it('should return true for boolean values', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });

    it('should return false for non-boolean values', () => {
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean(1)).toBe(false);
      expect(isBoolean('true')).toBe(false);
      expect(isBoolean(null)).toBe(false);
      expect(isBoolean(undefined)).toBe(false);
    });
  });

  describe('isArray', () => {
    it('should return true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray(['a', 'b'])).toBe(true);
    });

    it('should return false for non-array values', () => {
      expect(isArray({})).toBe(false);
      expect(isArray('string')).toBe(false);
      expect(isArray(42)).toBe(false);
      expect(isArray(null)).toBe(false);
      expect(isArray(undefined)).toBe(false);
    });
  });

  describe('isObject', () => {
    it('should return true for plain objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ a: 1 })).toBe(true);
    });

    it('should return false for null', () => {
      expect(isObject(null)).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(isObject([])).toBe(false);
      expect(isObject([1, 2])).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isObject('string')).toBe(false);
      expect(isObject(42)).toBe(false);
      expect(isObject(true)).toBe(false);
      expect(isObject(undefined)).toBe(false);
    });
  });

  describe('isLengthValid', () => {
    it('should return true when string length is within range', () => {
      expect(isLengthValid('hello', 1, 10)).toBe(true);
    });

    it('should return true when string length equals min', () => {
      expect(isLengthValid('hi', 2, 10)).toBe(true);
    });

    it('should return true when string length equals max', () => {
      expect(isLengthValid('hello', 1, 5)).toBe(true);
    });

    it('should return false when string is too short', () => {
      expect(isLengthValid('hi', 3, 10)).toBe(false);
    });

    it('should return false when string is too long', () => {
      expect(isLengthValid('hello world', 1, 5)).toBe(false);
    });

    it('should handle empty string with min 0', () => {
      expect(isLengthValid('', 0, 10)).toBe(true);
    });

    it('should handle falsy value with min 0', () => {
      expect(isLengthValid(null as unknown as string, 0, 10)).toBe(true);
    });

    it('should handle falsy value with min > 0', () => {
      expect(isLengthValid(undefined as unknown as string, 1, 10)).toBe(false);
    });
  });

  describe('isNumberInRange', () => {
    it('should return true when number is within range', () => {
      expect(isNumberInRange(5, 1, 10)).toBe(true);
    });

    it('should return true when number equals min', () => {
      expect(isNumberInRange(1, 1, 10)).toBe(true);
    });

    it('should return true when number equals max', () => {
      expect(isNumberInRange(10, 1, 10)).toBe(true);
    });

    it('should return false when number is below min', () => {
      expect(isNumberInRange(0, 1, 10)).toBe(false);
    });

    it('should return false when number is above max', () => {
      expect(isNumberInRange(11, 1, 10)).toBe(false);
    });

    it('should return false for NaN', () => {
      expect(isNumberInRange(NaN, 1, 10)).toBe(false);
    });

    it('should handle negative ranges', () => {
      expect(isNumberInRange(-5, -10, 0)).toBe(true);
    });

    it('should handle zero range', () => {
      expect(isNumberInRange(5, 5, 5)).toBe(true);
      expect(isNumberInRange(4, 5, 5)).toBe(false);
    });
  });

  describe('hasRequiredFields', () => {
    it('should return true when all required fields are present', () => {
      const obj = { name: 'John', email: 'john@example.com', age: 30 };
      expect(hasRequiredFields(obj, ['name', 'email'])).toBe(true);
    });

    it('should return false when a required field is missing', () => {
      const obj = { name: 'John' };
      expect(hasRequiredFields(obj, ['name', 'email'])).toBe(false);
    });

    it('should return false when a required field is null', () => {
      const obj = { name: 'John', email: null };
      expect(hasRequiredFields(obj, ['name', 'email'])).toBe(false);
    });

    it('should return false when a required field is undefined', () => {
      const obj = { name: 'John', email: undefined };
      expect(hasRequiredFields(obj, ['name', 'email'])).toBe(false);
    });

    it('should return false when a required string field is empty', () => {
      const obj = { name: '', email: 'john@example.com' };
      expect(hasRequiredFields(obj, ['name', 'email'])).toBe(false);
    });

    it('should return false when a required string field is whitespace only', () => {
      const obj = { name: '   ', email: 'john@example.com' };
      expect(hasRequiredFields(obj, ['name', 'email'])).toBe(false);
    });

    it('should return true with empty required fields array', () => {
      const obj = { name: 'John' };
      expect(hasRequiredFields(obj, [])).toBe(true);
    });

    it('should accept 0 as a valid value', () => {
      const obj = { count: 0, name: 'test' };
      expect(hasRequiredFields(obj, ['count', 'name'])).toBe(true);
    });

    it('should accept false as a valid value', () => {
      const obj = { active: false, name: 'test' };
      expect(hasRequiredFields(obj, ['active', 'name'])).toBe(true);
    });

    it('should return false for non-object input', () => {
      expect(hasRequiredFields(null as unknown as Record<string, unknown>, ['a'])).toBe(false);
      expect(hasRequiredFields('string' as unknown as Record<string, unknown>, ['a'])).toBe(false);
      expect(hasRequiredFields(42 as unknown as Record<string, unknown>, ['a'])).toBe(false);
    });

    it('should return false for array input', () => {
      expect(hasRequiredFields([] as unknown as Record<string, unknown>, ['length'])).toBe(false);
    });
  });
});
