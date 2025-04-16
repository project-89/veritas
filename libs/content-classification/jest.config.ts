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
  transformIgnorePatterns: [
    '/node_modules/(?!franc-min|trigram-utils).+\\.js$',
  ],
  moduleNameMapper: {
    '^@veritas/database$': '<rootDir>/../../libs/database/src/index.ts',
    '^@veritas/shared/types$': '<rootDir>/../../libs/shared/types/src/index.ts',
    '^@veritas/shared$': '<rootDir>/../../libs/shared/types/src/index.ts',
  },
};
