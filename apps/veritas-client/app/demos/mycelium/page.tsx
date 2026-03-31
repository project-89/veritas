'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { generateMyceliumData } from '@veritas-nx/visualization';

const NarrativeMyceliumVisualization = dynamic(
  () => import('@veritas-nx/visualization').then(mod => ({ default: mod.NarrativeMyceliumVisualization })),
  { ssr: false }
);

export default function MyceliumPage() {
  const [data] = useState(generateMyceliumData());

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-2">Narrative Mycelium Visualization</h2>
        <p className="mb-4 text-slate-400 text-sm">
          This visualization represents narratives as organic, interconnected mycelium-like structures, showing how ideas branch, connect, and form clusters.
        </p>
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <NarrativeMyceliumVisualization
            data={data}
            width={1000}
            height={600}
            onNodeClick={(node) => console.log('Node clicked:', node)}
            onClusterClick={(cluster) => console.log('Cluster clicked:', cluster)}
          />
        </div>
      </div>
    </div>
  );
}
