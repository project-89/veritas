# @veritas/shared/utils

Shared utility functions for the Veritas project.

## Overview

This library provides common utility functions that can be used across different modules in the Veritas project. The utilities are organized by category into separate modules to make them easy to import and use.

## Installation

The library is installed as part of the Veritas monorepo.

## Usage

Import the specific utility functions you need:

```typescript
import { truncateText, slugify } from '@veritas/shared/utils';

const shortenedText = truncateText('A long string that needs to be shortened', 20); // 'A long string that ne...'
const urlFriendlyName = slugify('My Article Title!'); // 'my-article-title'
```

## Available Utilities

### String Utilities

Functions for manipulating and transforming strings.

- `sanitizeHtml(input: string): string` - Removes HTML tags from a string
- `truncateText(text: string, maxLength: number, ellipsis?: string): string` - Truncates a string to a specified length
- `slugify(text: string): string` - Creates a URL-friendly slug from a string
- `formatUrl(baseUrl: string, path: string, params?: Record<string, any>): string` - Formats a URL with query parameters
- `hashContent(text: string, salt?: string): string` - Creates a hash of a string
- `extractDomain(url: string): string` - Extracts the domain from a URL

### Date Utilities

Functions for working with dates and times.

- `formatDate(date: Date, format?: string): string` - Formats a date according to a specified format
- `parseRelativeDate(dateText: string): Date` - Parses a relative date string (e.g., "2 hours ago")
- `parseTimeframe(timeframe: string): { startDate: Date; endDate: Date }` - Parses a timeframe string into dates
- `getTimeFilter(startDate?: Date, endDate?: Date): string` - Gets an appropriate time filter for API calls
- `formatRelativeTime(date: Date): string` - Formats a date as a relative time string

### Object Utilities

Functions for manipulating objects and collections.

- `deepClone<T>(obj: T): T` - Creates a deep clone of an object
- `getNestedProperty<T>(obj: any, path: string, defaultValue?: T): T | undefined` - Gets a nested property from an object
- `setNestedProperty<T>(obj: T, path: string, value: any): T` - Sets a nested property in an object
- `deepMerge<T>(target: T, ...sources: any[]): T` - Safely merges objects, handling nested properties
- `removeEmptyValues<T>(obj: T): Partial<T>` - Removes undefined and null values from an object
- `flattenObject(obj: Record<string, any>, prefix?: string): Record<string, any>` - Flattens a nested object

### Validation Utilities

Functions for validating various data types.

- `isValidEmail(email: string): boolean` - Validates an email address
- `isValidUrl(url: string, requireHttps?: boolean): boolean` - Validates a URL
- `isValidDate(dateString: string, allowFuture?: boolean): boolean` - Validates a date string
- `isString(value: unknown): value is string` - Type guard for strings
- `isNumber(value: unknown): value is number` - Type guard for numbers
- `isBoolean(value: unknown): value is boolean` - Type guard for booleans
- `isArray<T>(value: unknown): value is Array<T>` - Type guard for arrays
- `isObject(value: unknown): value is Record<string, unknown>` - Type guard for objects
- `isLengthValid(value: string, min: number, max: number): boolean` - Validates string length
- `isNumberInRange(value: number, min: number, max: number): boolean` - Validates number range
- `hasRequiredFields(obj: Record<string, unknown>, requiredFields: string[]): boolean` - Checks for required fields

### Scoring Utilities

Functions for calculating various metrics and scores.

- `normalizeValue(value: number, min: number, max: number): number` - Normalizes a value to a range between 0 and 1
- `calculateCredibilityScore(userData: object): number` - Calculates a credibility score based on user metrics
- `calculateEngagementScore(metrics: object): number` - Calculates an engagement score based on social media metrics
- `calculateViralityScore(metrics: object): number` - Calculates a virality score based on content spread metrics
- `calculateWeightedAverage(scores: object): number` - Calculates a weighted average of multiple scores
- `normalizeEngagementMetrics(metrics: Record<string, number>): object` - Normalizes engagement metrics to a standard format

### Color Utilities

Functions for manipulating and transforming colors.

- `adjustColorOpacity(color: string, opacity: number): string` - Adjusts the opacity of a hex color
- `lightenColor(color: string, amount: number): string` - Lightens a color by a specified amount
- `darkenColor(color: string, amount: number): string` - Darkens a color by a specified amount
- `getContrastingTextColor(backgroundColor: string): string` - Generates a contrasting text color
- `hexToRgb(color: string): { r: number; g: number; b: number }` - Converts a hex color to RGB
- `rgbToHex(rgb: { r: number; g: number; b: number }): string` - Converts RGB to a hex color
- `calculateEdgeColor(edgeType: string, weight: number, baseColors: Record<string, string>): string` - Calculates the color of an edge

## Contributing

When adding new utility functions:

1. Add the function to the appropriate category file
2. Include proper JSDoc comments for documentation
3. Add tests for the new function in the corresponding spec file
4. Update this README if adding a new major feature
