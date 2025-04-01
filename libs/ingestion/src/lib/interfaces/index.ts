/**
 * Export all interfaces from this directory for easier imports
 * Note: NarrativeInsight is now imported from ../../types/narrative-insight.interface
 * for consistency
 */

// Data connector for general data sources
export * from './data-connector.interface';

// Social media connectors for social platforms
export * from './social-media-connector.interface';

// Transform-on-ingest connectors that anonymize data during ingestion
export * from './transform-on-ingest-connector.interface';

// Export other interfaces as needed
