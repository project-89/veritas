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
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-2">Narrative Landscape Visualization</h2>
        <p className="mb-4 text-slate-400 text-sm">
          This visualization presents narratives as a topographical landscape where elevation indicates narrative strength and proximity indicates similarity.
        </p>
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <NarrativeLandscapeVisualization
            data={data}
            width={1000}
            height={600}
            onFeatureClick={(feature) => console.log('Feature clicked:', feature)}
            onPathClick={(path) => console.log('Path clicked:', path)}
          />
        </div>
      </div>
    </div>
  );
}
