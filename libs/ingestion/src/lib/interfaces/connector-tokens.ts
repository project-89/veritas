/**
 * Injection tokens for platform connectors.
 * Used to decouple IngestionService from concrete connector implementations,
 * allowing swappable API-based and API-free connectors.
 */
export const REDDIT_CONNECTOR = Symbol('REDDIT_CONNECTOR');
export const TWITTER_CONNECTOR = Symbol('TWITTER_CONNECTOR');
export const YOUTUBE_CONNECTOR = Symbol('YOUTUBE_CONNECTOR');
export const FACEBOOK_CONNECTOR = Symbol('FACEBOOK_CONNECTOR');
export const TRUTHSOCIAL_CONNECTOR = Symbol('TRUTHSOCIAL_CONNECTOR');
export const FARCASTER_CONNECTOR = Symbol('FARCASTER_CONNECTOR');
export const TELEGRAM_CONNECTOR = Symbol('TELEGRAM_CONNECTOR');
export const WIKIPEDIA_CONNECTOR = Symbol('WIKIPEDIA_CONNECTOR');
export const BLUESKY_CONNECTOR = Symbol('BLUESKY_CONNECTOR');
export const FOURCHAN_CONNECTOR = Symbol('FOURCHAN_CONNECTOR');
export const GDELT_CONNECTOR = Symbol('GDELT_CONNECTOR');
