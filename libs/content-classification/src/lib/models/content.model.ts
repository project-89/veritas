import { ContentSchema } from '../schemas/content.schema';

/**
 * Factory function to create a Content model
 * This is used when registering the model with the database service
 * @returns The Content model schema for MongoDB
 */
export function getContentModel() {
  return ContentSchema;
}

/**
 * Content model name for database registration
 */
export const CONTENT_MODEL_NAME = 'Content';

/**
 * Content collection name in MongoDB
 */
export const CONTENT_COLLECTION_NAME = 'content';
