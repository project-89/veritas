'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { generateTemporalData } from '../../lib/mock-data';

const TemporalNarrativeVisualization = dynamic(
  () => import('@veritas-nx/visualization').then(mod => ({ default: mod.TemporalNarrativeVisualization })),
  { ssr: false }
);

export default function TemporalPage() {
  const [data] = useState(generateTemporalData());

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">
        Temporal Narrative Visualization
      </h2>
      <p className="mb-4 text-gray-600">
        This visualization shows how multiple narratives evolve in
        strength and relationship over time.
      </p>
      <div className="border rounded-lg overflow-hidden">
        <TemporalNarrativeVisualization
          data={data}
          width={1000}
          height={600}
          onStreamClick={(streamId) =>
            console.log('Stream clicked:', streamId)
          }
          onEventClick={(event) =>
            console.log('Event clicked:', event)
          }
        />
      </div>
    </div>
  );
}
