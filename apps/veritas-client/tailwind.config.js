const { join } = require('path');
const { createGlobPatternsForDependencies } = require('@nx/react/tailwind');

module.exports = {
  content: [
    join(__dirname, 'app/**/*.{ts,tsx,js,jsx}'),
    join(__dirname, 'components/**/*.{ts,tsx,js,jsx}'),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: { extend: {} },
  plugins: [],
};
