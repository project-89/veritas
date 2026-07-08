export default {
  displayName: 'analysis',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  coverageDirectory: '../../coverage/libs/analysis',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
};
