'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { generateLandscapeData } from '@veritas-nx/visualization';

const NarrativeLandscapeVisualization = dynamic(
  () => import('@veritas-nx/visualization').then(mod => ({ default: mod.NarrativeLandscapeVisualization })),
  { ssr: false }
);

export default function LandscapePage() {
  const [data] = useState(generateLandscapeData());

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">
        Narrative Landscape Visualization
      </h2>
      <p className="mb-4 text-gray-600">
        This visualization presents narratives as a topographical
        landscape where elevation indicates narrative strength and
        proximity indicates similarity.
      </p>
      <div className="border rounded-lg overflow-hidden">
        <NarrativeLandscapeVisualization
          data={data}
          width={1000}
          height={600}
          onFeatureClick={(feature) =>
            console.log('Feature clicked:', feature)
          }
          onPathClick={(path) => console.log('Path clicked:', path)}
        />
      </div>
    </div>
  );
}
