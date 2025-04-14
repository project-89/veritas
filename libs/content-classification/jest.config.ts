export default {
  displayName: 'content-classification',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/libs/content-classification',
  transformIgnorePatterns: [
    '/node_modules/(?!franc-min|trigram-utils).+\\.js$',
  ],
};
