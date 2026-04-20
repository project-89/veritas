import type { VeritasPluginManifest } from '@veritas/shared/types';

export const magiPluginManifest: VeritasPluginManifest = {
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
};
