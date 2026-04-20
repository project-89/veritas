import type { VeritasPluginManifest } from '@veritas/shared/types';

export const atlasPluginManifest: VeritasPluginManifest = {
  id: 'veritas.plugin.atlas',
  name: 'ATLAS Lenses',
  version: '1.0.0',
  kind: 'public-plugin',
  status: 'installed',
  description: 'Reusable lens extraction and application workflows.',
  capabilities: ['atlas-lenses'],
  ui: {
    navItems: [{ slot: 'top-nav', href: '/atlas', label: 'ATLAS', order: 40 }],
    routes: [{ slot: 'page-route', path: '/atlas', label: 'ATLAS' }],
    slots: ['investigation-action', 'identity-panel'],
  },
  backend: {
    moduleName: 'AtlasPluginModule',
    controllers: ['InvestigationController'],
    services: ['MentalModelService'],
  },
};
