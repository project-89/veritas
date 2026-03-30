/**
 * Object manipulation utility functions
 */

/**
 * Creates a deep clone of an object or array
 * @param obj Object to clone
 * @returns Deep clone of the input object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(deepClone) as unknown as T;
  }

  const clone = {} as T;

  Object.keys(obj).forEach((key) => {
    const typedKey = key as keyof T;
    clone[typedKey] = deepClone(obj[typedKey]);
  });

  return clone;
}

/**
 * Gets a nested property from an object using a path string
 * @param obj Object to get property from
 * @param path Path to the property (e.g., 'user.address.city')
 * @param defaultValue Default value to return if property not found
 * @returns Property value or default value
 */
export function getNestedProperty<T>(
  obj: Record<string, unknown>,
  path: string,
  defaultValue?: T
): T | undefined {
  if (!obj || !path) {
    return defaultValue;
  }

  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object'
    ) {
      return defaultValue;
    }

    current = (current as Record<string, unknown>)[key];

    if (current === undefined) {
      return defaultValue;
    }
  }

  return current as T;
}

/**
 * Sets a nested property in an object using a path string
 * Creates intermediate objects if they don't exist
 * @param obj Object to set property in
 * @param path Path to the property (e.g., 'user.address.city')
 * @param value Value to set
 * @returns Modified object
 */
export function setNestedProperty<T>(obj: T, path: string, value: unknown): T {
  if (!obj || !path) {
    return obj;
  }

  const keys = path.split('.');
  const objectToModify = deepClone(obj);
  let current: Record<string, unknown> = objectToModify as Record<string, unknown>;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i] as string;

    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }

    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1] as string;
  current[lastKey] = value;

  return objectToModify;
}

/**
 * Safely merges objects, handling nested properties
 * @param target Target object
 * @param sources Source objects to merge
 * @returns Merged object
 */
export function deepMerge<T>(target: T, ...sources: Partial<T>[]): T {
  if (!sources.length) {
    return target;
  }

  const result = deepClone(target);

  for (const source of sources) {
    if (source === null || source === undefined) {
      continue;
    }

    Object.keys(source).forEach((key) => {
      const typedKey = key as keyof T;
      const sourceValue = (source as Record<string, unknown>)[key];

      if (Array.isArray(sourceValue)) {
        (result as Record<string, unknown>)[key] = sourceValue.map((item: unknown) => {
          return typeof item === 'object' && item !== null
            ? deepMerge({}, item as Record<string, unknown>)
            : item;
        });
      } else if (
        typeof sourceValue === 'object' &&
        sourceValue !== null &&
        result[typedKey] &&
        typeof result[typedKey] === 'object'
      ) {
        (result as Record<string, unknown>)[key] = deepMerge(
          result[typedKey] as object,
          sourceValue as Partial<object>
        );
      } else {
        (result as Record<string, unknown>)[key] = sourceValue;
      }
    });
  }

  return result;
}

/**
 * Removes undefined and null values from an object (shallow)
 * @param obj Object to clean
 * @returns Cleaned object without undefined/null values
 */
export function removeEmptyValues<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};

  Object.entries(obj).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      result[key as keyof T] = value;
    }
  });

  return result;
}

/**
 * Flattens a nested object into a single-level object with path keys
 * @param obj Nested object
 * @param prefix Prefix for keys
 * @returns Flattened object
 */
export function flattenObject(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, unknown> {
  return Object.keys(obj).reduce((acc, key) => {
    const pre = prefix.length ? `${prefix}.` : '';

    if (
      typeof obj[key] === 'object' &&
      obj[key] !== null &&
      !Array.isArray(obj[key])
    ) {
      Object.assign(acc, flattenObject(obj[key] as Record<string, unknown>, `${pre}${key}`));
    } else {
      acc[`${pre}${key}`] = obj[key];
    }

    return acc;
  }, {} as Record<string, unknown>);
}
