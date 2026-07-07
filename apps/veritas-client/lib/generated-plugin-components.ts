/* eslint-disable @nx/enforce-module-boundaries -- generated plugin imports are intentionally resolved from installed plugin packages */
import { AtlasPage as pluginRoute0_0 } from '@veritas/plugin-atlas';
import { AtlasInvestigationPanel as pluginInvestigationPanel0_0 } from '@veritas/plugin-atlas';
import { MagiIdentityPanel as pluginIdentityPanel1_0 } from '@veritas/plugin-magi';

import type { ComponentType } from 'react';
import type { IdentityRecord, Investigation, InvestigationEvidenceSeed, MagiProfileMode, MentalModel } from './api';

type GeneratedAtlasPageProps = {
  api: {
    fetchAtlasLenses: typeof import('./api').fetchAtlasLenses;
    fetchInvestigation: typeof import('./api').fetchInvestigation;
    createOrGetInvestigation: typeof import('./api').createOrGetInvestigation;
    addInvestigationEvidenceSeed: typeof import('./api').addInvestigationEvidenceSeed;
    buildMentalModel: typeof import('./api').buildMentalModel;
  };
};

type GeneratedInvestigationPanelProps = {
  investigationRecord?: Investigation | null;
  mentalModel?: MentalModel | null;
  mentalModelSaving?: boolean;
  onAddEvidenceSeed?: (seed: {
    kind: InvestigationEvidenceSeed['kind'];
    value: string;
    notes?: string | null;
  }) => Promise<void>;
  onBuildMentalModel?: () => Promise<void>;
  onRefreshMentalModel?: () => Promise<void>;
};

type GeneratedIdentityPanelProps = {
  identity: IdentityRecord;
  onGenerateProfile?: (id: string, mode: MagiProfileMode) => void;
};

export const GENERATED_PAGE_ROUTE_COMPONENTS: Record<string, ComponentType<GeneratedAtlasPageProps>> = {
  '/atlas': pluginRoute0_0 as ComponentType<GeneratedAtlasPageProps>,
};

export const GENERATED_INVESTIGATION_PANEL_COMPONENTS: Record<string, ComponentType<GeneratedInvestigationPanelProps>> = {
  'atlas-lenses': pluginInvestigationPanel0_0 as ComponentType<GeneratedInvestigationPanelProps>,
};

export const GENERATED_IDENTITY_PANEL_COMPONENTS: Record<string, ComponentType<GeneratedIdentityPanelProps>> = {
  'magi-profiles': pluginIdentityPanel1_0 as ComponentType<GeneratedIdentityPanelProps>,
};
