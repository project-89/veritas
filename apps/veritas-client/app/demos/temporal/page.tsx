'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { generateTemporalData } from '../../../lib/mock-data';

const TemporalNarrativeVisualization = dynamic(
  () => import('@veritas-nx/visualization').then(mod => ({ default: mod.TemporalNarrativeVisualization })),
  { ssr: false }
);

export default function TemporalPage() {
  const [data] = useState(generateTemporalData());

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-2">Temporal Narrative Visualization</h2>
        <p className="mb-4 text-slate-400 text-sm">
          This visualization shows how multiple narratives evolve in strength and relationship over time.
        </p>
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <TemporalNarrativeVisualization
            data={data}
            width={1000}
            height={600}
            onStreamClick={(streamId) => console.log('Stream clicked:', streamId)}
            onEventClick={(event) => console.log('Event clicked:', event)}
          />
        </div>
      </div>
    </div>
  );
}
