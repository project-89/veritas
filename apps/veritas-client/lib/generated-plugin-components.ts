import { AtlasPage as pluginRoute0_0 } from '../../../packages/atlas-plugin/src/index';
import { AtlasInvestigationPanel as pluginInvestigationPanel0_0 } from '../../../packages/atlas-plugin/src/index';
import { MagiIdentityPanel as pluginIdentityPanel1_0 } from '../../../packages/magi-plugin/src/index';

import type { ComponentType } from 'react';

export const GENERATED_PAGE_ROUTE_COMPONENTS: Record<string, ComponentType<any>> = {
  '/atlas': pluginRoute0_0,
};

export const GENERATED_INVESTIGATION_PANEL_COMPONENTS: Record<string, ComponentType<any>> = {
  'atlas-lenses': pluginInvestigationPanel0_0,
};

export const GENERATED_IDENTITY_PANEL_COMPONENTS: Record<string, ComponentType<any>> = {
  'magi-profiles': pluginIdentityPanel1_0,
};
