const nxPreset = require('@nx/jest/preset').default;

module.exports = {
  ...nxPreset,
  watchman: false,
  setupFilesAfterEnv: [require.resolve('./jest.setup.ts')],
};
