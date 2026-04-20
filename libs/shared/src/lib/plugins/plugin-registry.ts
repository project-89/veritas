import type {
  VeritasPluginManifest,
  VeritasPluginNavItem,
} from '@veritas/shared/types';

const CORE_PLUGIN_MANIFESTS: VeritasPluginManifest[] = [
  {
    id: 'veritas.core.investigations',
    name: 'Investigations Core',
    version: '1.0.0',
    kind: 'core',
    status: 'installed',
    description: 'Core case, search, and world event investigation platform.',
    capabilities: ['investigations', 'search', 'world-map', 'results'],
    ui: {
      navItems: [
        { slot: 'top-nav', href: '/monitor', label: 'Monitor', order: 10 },
        { slot: 'top-nav', href: '/search', label: 'Search', order: 20 },
        { slot: 'top-nav', href: '/worldmap', label: 'World Map', order: 30 },
      ],
      routes: [
        { slot: 'page-route', path: '/monitor', label: 'Monitor' },
        { slot: 'page-route', path: '/search', label: 'Search' },
        { slot: 'page-route', path: '/worldmap', label: 'World Map' },
      ],
      slots: ['results-tab', 'investigation-panel', 'monitor-card-action'],
    },
    backend: {
      moduleName: 'CoreAppModule',
      controllers: ['InvestigationController', 'MonitorController', 'EventsController'],
      services: ['ScanProcessor', 'AnalysisProcessor'],
    },
  },
  {
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
  },
  {
    id: 'veritas.plugin.magi',
    name: 'MAGI Profiles',
    version: '1.0.0',
    kind: 'private-plugin',
    status: 'installed',
    description: 'Psychological and behavioral identity profiling.',
    capabilities: ['magi-profiles'],
    ui: {
      slots: ['identity-panel', 'investigation-action'],
    },
    backend: {
      moduleName: 'MagiPluginModule',
      controllers: ['IdentityController'],
      services: ['PsychologicalProfilerService'],
    },
  },
];

export function getInstalledPluginManifests(): VeritasPluginManifest[] {
  return CORE_PLUGIN_MANIFESTS.slice();
}

export function getTopNavPluginItems(): VeritasPluginNavItem[] {
  return getInstalledPluginManifests()
    .filter((plugin) => plugin.status === 'installed')
    .flatMap((plugin) => plugin.ui?.navItems ?? [])
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}
