'use client';

import {
  addInvestigationEvidenceSeed,
  buildMentalModel,
  createOrGetInvestigation,
  fetchAtlasLenses,
  fetchInvestigation,
} from '../../lib/api';
import { GENERATED_PAGE_ROUTE_COMPONENTS } from '../../lib/generated-plugin-components';

const AtlasPageComponent = GENERATED_PAGE_ROUTE_COMPONENTS['/atlas'];

export default function AtlasPageRoute() {
  if (!AtlasPageComponent) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center px-6">
        <div className="text-[11px] font-mono uppercase tracking-widest text-nerv-text-muted">
          ATLAS plugin not installed.
        </div>
      </div>
    );
  }

  return (
    <AtlasPageComponent
      api={{
        fetchAtlasLenses,
        fetchInvestigation,
        createOrGetInvestigation,
        addInvestigationEvidenceSeed,
        buildMentalModel,
      }}
    />
  );
}
