const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('node:path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/api'),
  },
  resolve: {
    symlinks: false,
    alias: {
      '@veritas/database': join(__dirname, '../../libs/database/src/index.ts'),
      '@veritas/analysis': join(__dirname, '../../libs/analysis/src/index.ts'),
      '@veritas/content-classification': join(
        __dirname,
        '../../libs/content-classification/src/index.ts',
      ),
      '@veritas/ingestion': join(__dirname, '../../libs/ingestion/src/index.ts'),
      '@veritas/plugin-atlas': join(__dirname, '../../packages/atlas-plugin/src/index.ts'),
      '@veritas/plugin-magi': join(
        __dirname,
        '../../private-plugins/packages/magi-plugin/src/index.ts',
      ),
      '@veritas/plugin-magi/backend': join(
        __dirname,
        '../../private-plugins/packages/magi-plugin/src/backend/index.ts',
      ),
      '@veritas/shared/plugins': join(
        __dirname,
        '../../libs/shared/src/lib/plugins/plugin-registry.ts',
      ),
      '@veritas/shared/types': join(__dirname, '../../libs/shared/types/src/index.ts'),
      '@veritas/shared/utils': join(__dirname, '../../libs/shared/utils/src/index.ts'),
      '@veritas/shared': join(__dirname, '../../libs/shared/types/src/index.ts'),
      '@veritas/sources': join(__dirname, '../../libs/sources/src/index.ts'),
    },
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
    }),
  ],
};
