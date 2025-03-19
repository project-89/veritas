/**
 * Mock implementation of class-transformer for testing purposes
 */

// Mock Type decorator
export function Type(typeFunction: () => any) {
  return function (target: any, key: string) {
    // This is a mock implementation that does nothing
    // In a real scenario, it would set metadata for type transformation
  };
}
