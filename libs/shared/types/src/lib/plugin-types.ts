export type VeritasPluginKind = 'core' | 'public-plugin' | 'private-plugin';

export type VeritasPluginStatus = 'installed' | 'not-installed' | 'disabled';

export type VeritasPluginUiSlot =
  | 'top-nav'
  | 'page-route'
  | 'results-tab'
  | 'investigation-panel'
  | 'identity-panel'
  | 'dossier-panel'
  | 'investigation-action'
  | 'monitor-card-action';

export interface VeritasPluginNavItem {
  slot: 'top-nav';
  href: string;
  label: string;
  order?: number;
}

export interface VeritasPluginRoute {
  slot: 'page-route';
  path: string;
  label: string;
}

export interface VeritasPluginUiContribution {
  navItems?: VeritasPluginNavItem[];
  routes?: VeritasPluginRoute[];
  slots?: VeritasPluginUiSlot[];
}

export interface VeritasPluginBackendContribution {
  moduleName?: string;
  controllers?: string[];
  services?: string[];
  queueProcessors?: string[];
}

export interface VeritasPluginManifest {
  id: string;
  name: string;
  version: string;
  kind: VeritasPluginKind;
  status: VeritasPluginStatus;
  capabilities: string[];
  description?: string;
  ui?: VeritasPluginUiContribution;
  backend?: VeritasPluginBackendContribution;
}
