const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('node:path');

/**
 * Nx 22's `@nx/webpack:webpack` executor requires an explicit webpackConfig;
 * without one webpack falls back to its own defaults and looks for a `./src`
 * entry at the workspace root, failing with "Can't resolve './src'". This app
 * shipped without a config, so its build target never worked.
 *
 * Unlike apps/api this needs no `@veritas/*` resolve aliases — main.ts only
 * imports external packages (the MCP SDK, redis, zod).
 */
module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/veritas-mcp'),
  },
  resolve: {
    symlinks: false,
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
    }),
  ],
};
