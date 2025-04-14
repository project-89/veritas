/**
 * String utility functions for common text operations
 */

/**
 * Sanitizes HTML from a string by removing all HTML tags
 * @param input String that might contain HTML
 * @returns String with HTML tags removed
 */
export function sanitizeHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/**
 * Truncates a string to a maximum length, adding ellipsis if truncated
 * @param text The input string to truncate
 * @param maxLength Maximum allowed length
 * @param ellipsis The ellipsis string to append (default: '...')
 * @returns Truncated string
 */
export function truncateText(
  text: string,
  maxLength: number,
  ellipsis = '...'
): string {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + ellipsis;
}

/**
 * Creates a URL-friendly slug from a string
 * @param text Input string to convert to slug
 * @returns URL-friendly slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Replace multiple hyphens with single hyphen
}

/**
 * Formats a URL by combining base URL, path, and optional query parameters
 * @param baseUrl Base URL (e.g., 'https://example.com')
 * @param path Path to append (e.g., '/api/users')
 * @param params Optional query parameters as an object
 * @returns Formatted URL
 */
export function formatUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): string {
  // Remove trailing slashes from baseUrl
  const base = baseUrl.replace(/\/+$/, '');

  // Ensure path starts with a single slash
  const formattedPath = path.replace(/^\/*/, '/');

  let url = `${base}${formattedPath}`;

  // Add query parameters if provided
  if (params && Object.keys(params).length > 0) {
    const queryParams = Object.entries(params)
      .filter(([_, value]) => value !== undefined)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
      )
      .join('&');

    url += `?${queryParams}`;
  }

  return url;
}

/**
 * Creates a content hash for a text string
 * Similar to what's used in the TransformOnIngestService
 * @param text Content to hash
 * @param salt Optional salt to add to the hash
 * @returns Hash string
 */
export function hashContent(text: string, salt = ''): string {
  // Simple hash function for demonstration
  // In production, use a proper cryptographic hash function
  let hash = 0;
  const stringToHash = text + salt;

  for (let i = 0; i < stringToHash.length; i++) {
    const char = stringToHash.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(16);
}

/**
 * Extracts domain from a URL
 * @param url URL to extract domain from
 * @returns Domain name
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    // If URL is invalid, return empty string
    return '';
  }
}
