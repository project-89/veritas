const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const PLUGIN_ROOTS = [
  path.join(ROOT, 'packages'),
  path.join(ROOT, 'private-plugins', 'packages'),
];
const SHARED_OUTPUT = path.join(ROOT, 'libs/shared/src/lib/plugins/generated-plugin-manifests.ts');
const CLIENT_OUTPUT = path.join(ROOT, 'apps/veritas-client/lib/generated-plugin-components.ts');
const API_OUTPUT = path.join(ROOT, 'apps/api/src/app/generated-plugin-backend.ts');

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function relativeImport(fromFile, toFile) {
  const rel = path.relative(path.dirname(fromFile), toFile);
  const withoutExt = rel.replace(/\.[^.]+$/, '');
  return toPosix(withoutExt.startsWith('.') ? withoutExt : `./${withoutExt}`);
}

function readPluginConfigs() {
  const discovered = [];

  for (const packagesDir of PLUGIN_ROOTS) {
    if (!fs.existsSync(packagesDir)) continue;

    const pluginEntries = fs
      .readdirSync(packagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const pluginRoot = path.join(packagesDir, entry.name);
        const configPath = path.join(pluginRoot, 'plugin.json');
        if (!fs.existsSync(configPath)) return null;
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return {
          name: entry.name,
          root: pluginRoot,
          ...config,
        };
      })
      .filter(Boolean);

    discovered.push(...pluginEntries);
  }

  const dedupedById = new Map();
  for (const plugin of discovered) {
    dedupedById.set(plugin.id, plugin);
  }

  return Array.from(dedupedById.values());
}

function buildSharedOutput(plugins) {
  const imports = [];
  const symbols = [];

  plugins.forEach((plugin, index) => {
    const alias = `pluginManifest${index}`;
    imports.push(
      `import { ${plugin.manifest.symbol} as ${alias} } from '${relativeImport(
        SHARED_OUTPUT,
        path.join(plugin.root, plugin.manifest.entry),
      )}';`,
    );
    symbols.push(alias);
  });

  return `${imports.join('\n')}

import type { VeritasPluginManifest } from '@veritas/shared/types';

export const INSTALLED_PLUGIN_MANIFESTS: VeritasPluginManifest[] = [${symbols.join(', ')}];
`;
}

function buildClientOutput(plugins) {
  const imports = [];
  const routeEntries = [];
  const investigationPanelEntries = [];
  const identityPanelEntries = [];

  plugins.forEach((plugin, index) => {
    const client = plugin.client ?? {};

    (client.routes ?? []).forEach((route, routeIndex) => {
      const alias = `pluginRoute${index}_${routeIndex}`;
      imports.push(
        `import { ${route.symbol} as ${alias} } from '${relativeImport(
          CLIENT_OUTPUT,
          path.join(plugin.root, route.entry),
        )}';`,
      );
      routeEntries.push(`  '${route.path}': ${alias},`);
    });

    (client.investigationPanels ?? []).forEach((panel, panelIndex) => {
      const alias = `pluginInvestigationPanel${index}_${panelIndex}`;
      imports.push(
        `import { ${panel.symbol} as ${alias} } from '${relativeImport(
          CLIENT_OUTPUT,
          path.join(plugin.root, panel.entry),
        )}';`,
      );
      investigationPanelEntries.push(`  '${panel.capability}': ${alias},`);
    });

    (client.identityPanels ?? []).forEach((panel, panelIndex) => {
      const alias = `pluginIdentityPanel${index}_${panelIndex}`;
      imports.push(
        `import { ${panel.symbol} as ${alias} } from '${relativeImport(
          CLIENT_OUTPUT,
          path.join(plugin.root, panel.entry),
        )}';`,
      );
      identityPanelEntries.push(`  '${panel.capability}': ${alias},`);
    });
  });

  return `${imports.join('\n')}

import type { ComponentType } from 'react';

export const GENERATED_PAGE_ROUTE_COMPONENTS: Record<string, ComponentType<any>> = {
${routeEntries.join('\n')}
};

export const GENERATED_INVESTIGATION_PANEL_COMPONENTS: Record<string, ComponentType<any>> = {
${investigationPanelEntries.join('\n')}
};

export const GENERATED_IDENTITY_PANEL_COMPONENTS: Record<string, ComponentType<any>> = {
${identityPanelEntries.join('\n')}
};
`;
}

function buildApiOutput(plugins) {
  const imports = [];
  const providerSymbols = [];
  const controllerSymbols = [];

  plugins.forEach((plugin, index) => {
    if (!plugin.backend) return;
    const importNames = [];
    if (plugin.backend.providersSymbol) {
      const alias = `pluginProviders${index}`;
      importNames.push(`${plugin.backend.providersSymbol} as ${alias}`);
      providerSymbols.push(alias);
    }
    if (plugin.backend.controllersSymbol) {
      const alias = `pluginControllers${index}`;
      importNames.push(`${plugin.backend.controllersSymbol} as ${alias}`);
      controllerSymbols.push(alias);
    }
    if (importNames.length === 0) return;
    imports.push(
      `import { ${importNames.join(', ')} } from '${relativeImport(
        API_OUTPUT,
        path.join(plugin.root, plugin.backend.entry),
      )}';`,
    );
  });

  return `${imports.join('\n')}

export const GENERATED_PLUGIN_APP_PROVIDERS = [
${providerSymbols.map((symbol) => `  ...${symbol},`).join('\n')}
];

export const GENERATED_PLUGIN_CONTROLLERS = [
${controllerSymbols.map((symbol) => `  ...${symbol},`).join('\n')}
];
`;
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content.trim()}\n`, 'utf8');
}

const plugins = readPluginConfigs();
writeFile(SHARED_OUTPUT, buildSharedOutput(plugins));
writeFile(CLIENT_OUTPUT, buildClientOutput(plugins));
writeFile(API_OUTPUT, buildApiOutput(plugins));

console.log(`Generated plugin registries for ${plugins.length} plugin(s).`);
