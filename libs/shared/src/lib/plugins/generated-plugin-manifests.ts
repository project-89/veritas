import type { VeritasPluginManifest } from '@veritas/shared/types';
import { atlasPluginManifest as pluginManifest0 } from '../../../../../packages/atlas-plugin/src/manifest';
import { magiPluginManifest as pluginManifest1 } from '../../../../../private-plugins/packages/magi-plugin/src/manifest';

export const INSTALLED_PLUGIN_MANIFESTS: VeritasPluginManifest[] = [
  pluginManifest0,
  pluginManifest1,
];
