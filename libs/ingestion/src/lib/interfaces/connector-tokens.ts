/**
 * Injection tokens for platform connectors.
 * Used to decouple IngestionService from concrete connector implementations,
 * allowing swappable API-based and API-free connectors.
 */
export const REDDIT_CONNECTOR = Symbol('REDDIT_CONNECTOR');
export const TWITTER_CONNECTOR = Symbol('TWITTER_CONNECTOR');
export const YOUTUBE_CONNECTOR = Symbol('YOUTUBE_CONNECTOR');
export const FACEBOOK_CONNECTOR = Symbol('FACEBOOK_CONNECTOR');
