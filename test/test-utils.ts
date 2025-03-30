import { SourceNode } from '../libs/shared/src/schemas/base.schema';

/**
 * Mock source node for testing connectors and services
 */
export const mockSourceNode: SourceNode = {
  id: 'test-source-123',
  name: 'Test Source',
  platform: 'twitter',
  url: 'https://twitter.com/test-account',
  description: 'Test account for unit tests',
  verificationStatus: 'verified',
  credibilityScore: 0.85,
  metadata: {
    followerCount: 10000,
    location: 'Test Location',
    userId: '123456789',
    screenName: 'test_account',
    verified: true,
    profileImageUrl: 'https://example.com/profile.jpg',
  },
};

/**
 * Mock configuration for testing API credentials
 */
export const mockApiCredentials = {
  twitter: {
    apiKey: 'test-api-key',
    apiSecret: 'test-api-secret',
    accessToken: 'test-access-token',
    accessTokenSecret: 'test-access-token-secret',
    bearerToken: 'test-bearer-token',
  },
  facebook: {
    appId: 'test-app-id',
    appSecret: 'test-app-secret',
    accessToken: 'test-page-access-token',
    pageId: 'test-page-id',
  },
  reddit: {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    username: 'test-username',
    password: 'test-password',
    userAgent: 'test-user-agent',
  },
};

/**
 * Helper function to create a mock response object
 */
export function createMockResponse<T>(data: T): T {
  return data;
}
