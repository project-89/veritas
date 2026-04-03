export default {
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleNameMapper: {
    '^franc-min$': '<rootDir>/__mocks__/franc-min.ts',
    '^afinn-165$': '<rootDir>/__mocks__/afinn-165.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/api',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
};
