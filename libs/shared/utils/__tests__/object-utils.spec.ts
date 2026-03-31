import {
  deepClone,
  getNestedProperty,
  setNestedProperty,
  deepMerge,
  removeEmptyValues,
  flattenObject,
} from '../src/lib/object-utils';

describe('object-utils', () => {
  describe('deepClone', () => {
    it('should create a deep copy of a simple object', () => {
      const original = { a: 1, b: 2 };
      const clone = deepClone(original);

      expect(clone).toEqual(original);
      expect(clone).not.toBe(original);
    });

    it('should create a deep copy of a nested object', () => {
      const original = { a: 1, b: { c: 2, d: { e: 3 } } };
      const clone = deepClone(original);

      clone.b.d.e = 99;

      expect(original.b.d.e).toBe(3);
      expect(clone.b.d.e).toBe(99);
    });

    it('should deep clone arrays', () => {
      const original = [1, [2, 3], { a: 4 }];
      const clone = deepClone(original);

      expect(clone).toEqual(original);
      expect(clone).not.toBe(original);
      expect(clone[1]).not.toBe(original[1]);
      expect(clone[2]).not.toBe(original[2]);
    });

    it('should deep clone arrays within objects', () => {
      const original = { items: [{ id: 1 }, { id: 2 }] };
      const clone = deepClone(original);

      (clone.items[0] as { id: number }).id = 99;

      expect((original.items[0] as { id: number }).id).toBe(1);
    });

    it('should return null when given null', () => {
      expect(deepClone(null)).toBeNull();
    });

    it('should return undefined when given undefined', () => {
      expect(deepClone(undefined)).toBeUndefined();
    });

    it('should return primitives as-is', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('hello')).toBe('hello');
      expect(deepClone(true)).toBe(true);
    });

    it('should handle empty objects', () => {
      expect(deepClone({})).toEqual({});
    });

    it('should handle empty arrays', () => {
      expect(deepClone([])).toEqual([]);
    });

    it('should handle objects with null values', () => {
      const original = { a: null, b: 1 };
      const clone = deepClone(original);

      expect(clone).toEqual({ a: null, b: 1 });
    });
  });

  describe('getNestedProperty', () => {
    const testObj = {
      user: {
        profile: {
          name: 'John',
          address: {
            city: 'NYC',
          },
        },
        tags: ['admin', 'user'],
      },
      count: 42,
    };

    it('should get a top-level property', () => {
      expect(getNestedProperty(testObj, 'count')).toBe(42);
    });

    it('should get a deeply nested property', () => {
      expect(getNestedProperty(testObj, 'user.profile.address.city')).toBe('NYC');
    });

    it('should get a nested array', () => {
      expect(getNestedProperty(testObj, 'user.tags')).toEqual(['admin', 'user']);
    });

    it('should return default value for non-existent path', () => {
      expect(getNestedProperty(testObj, 'user.profile.email', 'N/A')).toBe('N/A');
    });

    it('should return undefined when no default and path not found', () => {
      expect(getNestedProperty(testObj, 'user.nonexistent')).toBeUndefined();
    });

    it('should return default value when path traverses through a non-object', () => {
      expect(getNestedProperty(testObj, 'count.something', 'default')).toBe('default');
    });

    it('should return default value for null obj', () => {
      expect(getNestedProperty(null as unknown as Record<string, unknown>, 'a.b', 'fallback')).toBe('fallback');
    });

    it('should return default value for undefined obj', () => {
      expect(getNestedProperty(undefined as unknown as Record<string, unknown>, 'a', 'fallback')).toBe('fallback');
    });

    it('should return default value for empty path', () => {
      expect(getNestedProperty(testObj, '', 'fallback')).toBe('fallback');
    });

    it('should handle paths through null intermediate values', () => {
      const obj = { a: { b: null } } as Record<string, unknown>;
      expect(getNestedProperty(obj, 'a.b.c', 'default')).toBe('default');
    });
  });

  describe('setNestedProperty', () => {
    it('should set a top-level property', () => {
      const obj = { a: 1 };
      const result = setNestedProperty(obj, 'a', 2);

      expect(result.a).toBe(2);
      expect(obj.a).toBe(1); // original unchanged
    });

    it('should set a deeply nested property', () => {
      const obj = { user: { profile: { name: 'John' } } };
      const result = setNestedProperty(obj, 'user.profile.name', 'Jane');

      expect(result.user.profile.name).toBe('Jane');
      expect(obj.user.profile.name).toBe('John');
    });

    it('should create intermediate objects that do not exist', () => {
      const obj = {} as Record<string, unknown>;
      const result = setNestedProperty(obj, 'a.b.c', 'value');

      expect(getNestedProperty(result as Record<string, unknown>, 'a.b.c')).toBe('value');
    });

    it('should overwrite non-object intermediates', () => {
      const obj = { a: 'string' } as Record<string, unknown>;
      const result = setNestedProperty(obj, 'a.b', 'value');

      expect(getNestedProperty(result as Record<string, unknown>, 'a.b')).toBe('value');
    });

    it('should return the original obj when obj is null', () => {
      expect(setNestedProperty(null, 'a', 1)).toBeNull();
    });

    it('should return the original obj when path is empty', () => {
      const obj = { a: 1 };
      expect(setNestedProperty(obj, '', 2)).toBe(obj);
    });

    it('should not mutate the original object', () => {
      const obj = { a: { b: 1 } };
      const result = setNestedProperty(obj, 'a.b', 99);

      expect(obj.a.b).toBe(1);
      expect(result.a.b).toBe(99);
    });
  });

  describe('deepMerge', () => {
    it('should merge flat objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should deep merge nested objects', () => {
      const target = { user: { name: 'John', age: 30 } } as Record<string, unknown>;
      const source = { user: { age: 31, email: 'john@example.com' } };
      const result = deepMerge(target, source);

      expect(result).toEqual({ user: { name: 'John', age: 31, email: 'john@example.com' } });
    });

    it('should not mutate the target object', () => {
      const target = { a: { b: 1 } };
      const source = { a: { b: 2 } };
      deepMerge(target, source);

      expect(target.a.b).toBe(1);
    });

    it('should handle multiple sources', () => {
      const target = { a: 1 } as Record<string, unknown>;
      const source1 = { b: 2 };
      const source2 = { c: 3 };
      const result = deepMerge(target, source1, source2);

      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('should handle null sources gracefully', () => {
      const target = { a: 1 };
      const result = deepMerge(target, null as unknown as Partial<typeof target>);

      expect(result).toEqual({ a: 1 });
    });

    it('should handle undefined sources gracefully', () => {
      const target = { a: 1 };
      const result = deepMerge(target, undefined as unknown as Partial<typeof target>);

      expect(result).toEqual({ a: 1 });
    });

    it('should return target when no sources provided', () => {
      const target = { a: 1 };
      const result = deepMerge(target);

      expect(result).toEqual({ a: 1 });
    });

    it('should handle arrays in source by replacing target arrays', () => {
      const target = { items: [1, 2] };
      const source = { items: [3, 4, 5] };
      const result = deepMerge(target, source);

      expect(result.items).toEqual([3, 4, 5]);
    });

    it('should deep clone array objects during merge', () => {
      const target = { items: [] as { id: number }[] };
      const source = { items: [{ id: 1 }, { id: 2 }] };
      const result = deepMerge(target, source);

      (result.items as { id: number }[])[0]!.id = 99;

      expect(source.items[0]!.id).toBe(1);
    });

    it('should overwrite primitives with objects', () => {
      const target = { a: 'string' } as Record<string, unknown>;
      const source = { a: { nested: true } };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: { nested: true } });
    });
  });

  describe('removeEmptyValues', () => {
    it('should remove null values', () => {
      const obj = { a: 1, b: null, c: 3 };
      const result = removeEmptyValues(obj);

      expect(result).toEqual({ a: 1, c: 3 });
    });

    it('should remove undefined values', () => {
      const obj = { a: 1, b: undefined, c: 3 };
      const result = removeEmptyValues(obj);

      expect(result).toEqual({ a: 1, c: 3 });
    });

    it('should keep falsy values that are not null/undefined', () => {
      const obj = { a: 0, b: '', c: false, d: null };
      const result = removeEmptyValues(obj);

      expect(result).toEqual({ a: 0, b: '', c: false });
    });

    it('should return empty object when all values are empty', () => {
      const obj = { a: null, b: undefined };
      const result = removeEmptyValues(obj);

      expect(result).toEqual({});
    });

    it('should return a copy with all values when none are empty', () => {
      const obj = { a: 1, b: 'hello', c: true };
      const result = removeEmptyValues(obj);

      expect(result).toEqual(obj);
    });

    it('should handle empty object', () => {
      expect(removeEmptyValues({})).toEqual({});
    });

    it('should keep nested objects even if they contain null values (shallow removal)', () => {
      const obj = { a: { inner: null }, b: null };
      const result = removeEmptyValues(obj);

      expect(result).toEqual({ a: { inner: null } });
    });
  });

  describe('flattenObject', () => {
    it('should flatten a simple nested object', () => {
      const obj = { a: { b: 1 } };
      expect(flattenObject(obj)).toEqual({ 'a.b': 1 });
    });

    it('should flatten a deeply nested object', () => {
      const obj = { a: { b: { c: { d: 'deep' } } } };
      expect(flattenObject(obj)).toEqual({ 'a.b.c.d': 'deep' });
    });

    it('should handle top-level primitive values', () => {
      const obj = { a: 1, b: 'hello' };
      expect(flattenObject(obj)).toEqual({ a: 1, b: 'hello' });
    });

    it('should preserve arrays as values', () => {
      const obj = { a: { b: [1, 2, 3] } };
      expect(flattenObject(obj)).toEqual({ 'a.b': [1, 2, 3] });
    });

    it('should handle null values', () => {
      const obj = { a: null, b: { c: null } };
      expect(flattenObject(obj)).toEqual({ a: null, 'b.c': null });
    });

    it('should handle mixed nesting levels', () => {
      const obj = { a: 1, b: { c: 2 }, d: { e: { f: 3 } } };
      expect(flattenObject(obj)).toEqual({ a: 1, 'b.c': 2, 'd.e.f': 3 });
    });

    it('should handle empty nested objects', () => {
      const obj = { a: {} };
      expect(flattenObject(obj)).toEqual({});
    });

    it('should use custom prefix', () => {
      const obj = { a: 1 };
      expect(flattenObject(obj, 'root')).toEqual({ 'root.a': 1 });
    });

    it('should handle an empty object', () => {
      expect(flattenObject({})).toEqual({});
    });
  });
});
