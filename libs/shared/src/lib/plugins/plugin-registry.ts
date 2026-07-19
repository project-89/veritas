import type { VeritasPluginManifest, VeritasPluginNavItem } from '@veritas/shared/types';
import { INSTALLED_PLUGIN_MANIFESTS } from './generated-plugin-manifests';

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
        { slot: 'top-nav', href: '/', label: 'Command', order: 0 },
        { slot: 'top-nav', href: '/monitor', label: 'Monitor', order: 10 },
        { slot: 'top-nav', href: '/search', label: 'Search', order: 20 },
        { slot: 'top-nav', href: '/worldmap', label: 'World Map', order: 30 },
        { slot: 'top-nav', href: '/perspectives', label: 'Perspectives', order: 35 },
      ],
      routes: [
        { slot: 'page-route', path: '/monitor', label: 'Monitor' },
        { slot: 'page-route', path: '/search', label: 'Search' },
        { slot: 'page-route', path: '/worldmap', label: 'World Map' },
        { slot: 'page-route', path: '/perspectives', label: 'Perspectives' },
      ],
      slots: ['results-tab', 'investigation-panel', 'monitor-card-action'],
    },
    backend: {
      moduleName: 'CoreAppModule',
      controllers: ['InvestigationController', 'MonitorController', 'EventsController'],
      services: ['ScanProcessor', 'AnalysisProcessor'],
    },
  },
];

export function getInstalledPluginManifests(): VeritasPluginManifest[] {
  return [...CORE_PLUGIN_MANIFESTS, ...INSTALLED_PLUGIN_MANIFESTS];
}

export function getTopNavPluginItems(): VeritasPluginNavItem[] {
  return getInstalledPluginManifests()
    .filter((plugin) => plugin.status === 'installed')
    .flatMap((plugin) => plugin.ui?.navItems ?? [])
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}
