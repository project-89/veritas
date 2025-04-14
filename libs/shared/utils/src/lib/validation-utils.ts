/**
 * Validation utility functions
 */

/**
 * Validates an email address
 * @param email Email address to validate
 * @returns Whether the email is valid
 */
export function isValidEmail(email: string): boolean {
  if (!email) {
    return false;
  }

  // Simple regex for email validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * Validates a URL
 * @param url URL to validate
 * @param requireHttps Whether to require HTTPS protocol
 * @returns Whether the URL is valid
 */
export function isValidUrl(url: string, requireHttps = false): boolean {
  if (!url) {
    return false;
  }

  try {
    const urlObj = new URL(url);
    if (requireHttps && urlObj.protocol !== 'https:') {
      return false;
    }

    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

/**
 * Validates a date string
 * @param dateString Date string to validate
 * @param allowFuture Whether to allow future dates
 * @returns Whether the date is valid
 */
export function isValidDate(dateString: string, allowFuture = true): boolean {
  if (!dateString) {
    return false;
  }

  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    return false;
  }

  if (!allowFuture && date > new Date()) {
    return false;
  }

  return true;
}

/**
 * Type guard for checking if a value is a string
 * @param value Value to check
 * @returns Whether the value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard for checking if a value is a number
 * @param value Value to check
 * @returns Whether the value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Type guard for checking if a value is a boolean
 * @param value Value to check
 * @returns Whether the value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard for checking if a value is an array
 * @param value Value to check
 * @returns Whether the value is an array
 */
export function isArray<T = unknown>(value: unknown): value is Array<T> {
  return Array.isArray(value);
}

/**
 * Type guard for checking if a value is an object
 * @param value Value to check
 * @returns Whether the value is an object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates a string against a minimum and maximum length
 * @param value String to validate
 * @param min Minimum length
 * @param max Maximum length
 * @returns Whether the string's length is within the specified range
 */
export function isLengthValid(
  value: string,
  min: number,
  max: number
): boolean {
  if (!value) {
    return min === 0;
  }

  return value.length >= min && value.length <= max;
}

/**
 * Validates a number against a minimum and maximum value
 * @param value Number to validate
 * @param min Minimum value
 * @param max Maximum value
 * @returns Whether the number is within the specified range
 */
export function isNumberInRange(
  value: number,
  min: number,
  max: number
): boolean {
  if (!isNumber(value)) {
    return false;
  }

  return value >= min && value <= max;
}

/**
 * Checks if all required fields are present in an object
 * @param obj Object to check
 * @param requiredFields Array of required field names
 * @returns Whether all required fields are present and non-empty
 */
export function hasRequiredFields(
  obj: Record<string, unknown>,
  requiredFields: string[]
): boolean {
  if (!isObject(obj)) {
    return false;
  }

  return requiredFields.every((field) => {
    const value = obj[field];

    if (value === undefined || value === null) {
      return false;
    }

    if (typeof value === 'string' && value.trim() === '') {
      return false;
    }

    return true;
  });
}
