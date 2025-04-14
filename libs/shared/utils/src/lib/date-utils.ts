/**
 * Date and time utility functions
 */

/**
 * Formats a date according to a specified format string
 * @param date Date to format
 * @param format Format string (e.g., 'YYYY-MM-DD')
 * @returns Formatted date string
 */
export function formatDate(date: Date, format = 'YYYY-MM-DD'): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  // Add leading zeros
  const mm = month < 10 ? `0${month}` : month;
  const dd = day < 10 ? `0${day}` : day;
  const hh = hours < 10 ? `0${hours}` : hours;
  const min = minutes < 10 ? `0${minutes}` : minutes;
  const ss = seconds < 10 ? `0${seconds}` : seconds;

  // Replace format tokens with actual values
  return format
    .replace('YYYY', year.toString())
    .replace('MM', mm.toString())
    .replace('DD', dd.toString())
    .replace('HH', hh.toString())
    .replace('mm', min.toString())
    .replace('ss', ss.toString());
}

/**
 * Parses a relative date string (e.g., "2 hours ago", "yesterday")
 * @param dateText Relative date string
 * @returns Date object
 */
export function parseRelativeDate(dateText: string): Date {
  const now = new Date();
  const lowerText = dateText.toLowerCase();

  if (lowerText.includes('hour') || lowerText.includes('hr')) {
    const hours = parseInt(lowerText.match(/\d+/)?.[0] || '1');
    const date = new Date(now);
    date.setHours(date.getHours() - hours);
    return date;
  } else if (lowerText.includes('minute') || lowerText.includes('min')) {
    const minutes = parseInt(lowerText.match(/\d+/)?.[0] || '1');
    const date = new Date(now);
    date.setMinutes(date.getMinutes() - minutes);
    return date;
  } else if (lowerText.includes('day')) {
    const days = parseInt(lowerText.match(/\d+/)?.[0] || '1');
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    return date;
  } else if (lowerText.includes('yesterday')) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    return date;
  } else if (lowerText.includes('week')) {
    const weeks = parseInt(lowerText.match(/\d+/)?.[0] || '1');
    const date = new Date(now);
    date.setDate(date.getDate() - weeks * 7);
    return date;
  } else if (lowerText.includes('month')) {
    const months = parseInt(lowerText.match(/\d+/)?.[0] || '1');
    const date = new Date(now);
    date.setMonth(date.getMonth() - months);
    return date;
  } else if (lowerText.includes('year')) {
    const years = parseInt(lowerText.match(/\d+/)?.[0] || '1');
    const date = new Date(now);
    date.setFullYear(date.getFullYear() - years);
    return date;
  }

  // Try to parse as a specific date if it doesn't match relative patterns
  const parsedDate = new Date(dateText);
  return isNaN(parsedDate.getTime()) ? now : parsedDate;
}

/**
 * Parses a timeframe string into start and end dates
 * @param timeframe Timeframe string (e.g., 'last-24h', 'last-7d', 'last-30d')
 * @returns Object with startDate and endDate
 */
export function parseTimeframe(timeframe: string): {
  startDate: Date;
  endDate: Date;
} {
  let endDate = new Date();
  let startDate = new Date();

  if (timeframe === 'last-24h') {
    startDate.setHours(startDate.getHours() - 24);
  } else if (timeframe === 'last-7d') {
    startDate.setDate(startDate.getDate() - 7);
  } else if (timeframe === 'last-30d') {
    startDate.setDate(startDate.getDate() - 30);
  } else if (timeframe === 'last-90d') {
    startDate.setDate(startDate.getDate() - 90);
  } else if (timeframe === 'last-6m') {
    startDate.setMonth(startDate.getMonth() - 6);
  } else if (timeframe === 'last-1y') {
    startDate.setFullYear(startDate.getFullYear() - 1);
  } else if (timeframe.startsWith('custom:')) {
    // Parse custom timeframe in format 'custom:YYYY-MM-DD:YYYY-MM-DD'
    const dates = timeframe.substring(7).split(':');
    if (dates.length === 2) {
      startDate = new Date(dates[0]);
      endDate = new Date(dates[1]);
    }
  }

  return { startDate, endDate };
}

/**
 * Gets appropriate time filter based on date range
 * Useful for API calls that accept time filters
 * @param startDate Start date
 * @param endDate End date (optional)
 * @returns Time filter string
 */
export function getTimeFilter(
  startDate?: Date,
  endDate?: Date
): 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' {
  if (!startDate) return 'all';

  const now = new Date();
  const diffHours = (now.getTime() - startDate.getTime()) / (60 * 60 * 1000);

  if (diffHours <= 24) return 'hour';
  if (diffHours <= 24 * 7) return 'day';
  if (diffHours <= 24 * 30) return 'week';
  if (diffHours <= 24 * 90) return 'month';
  if (diffHours <= 24 * 365) return 'year';
  return 'all';
}

/**
 * Formats a date as a relative time string (e.g., "5 minutes ago")
 * @param date Date to format
 * @returns Relative time string
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSec < 60) {
    return `${diffSec} second${diffSec !== 1 ? 's' : ''} ago`;
  } else if (diffMin < 60) {
    return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 30) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  } else if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
  } else {
    return `${diffYears} year${diffYears !== 1 ? 's' : ''} ago`;
  }
}
