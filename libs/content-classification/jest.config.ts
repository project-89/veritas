export default {
  displayName: 'content-classification',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    'node_modules/franc-min/index.js': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.spec.json' },
    ],
    'node_modules/trigram-utils/index.js': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.spec.json' },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/libs/content-classification',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  transformIgnorePatterns: [
    '/node_modules/(?!franc-min|trigram-utils).+\\.js$',
  ],
  moduleNameMapper: {
    '^afinn-165$': '<rootDir>/__mocks__/afinn-165.ts',
    '^@veritas/database$': '<rootDir>/../../libs/database/src/index.ts',
    '^@veritas/shared/types$': '<rootDir>/../../libs/shared/types/src/index.ts',
    '^@veritas/shared$': '<rootDir>/../../libs/shared/types/src/index.ts',
  },
};
