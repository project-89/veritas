'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { generateNetworkData } from '../../../lib/mock-data';

const NetworkGraphVisualization = dynamic(
  () => import('@veritas-nx/visualization').then(mod => ({ default: mod.NetworkGraphVisualization })),
  { ssr: false }
);

export default function NetworkPage() {
  const [data] = useState(generateNetworkData());

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-2">Network Graph Visualization</h2>
        <p className="mb-4 text-slate-400 text-sm">
          This visualization shows network relationships between different entities. Nodes represent content, sources, or accounts, while edges represent relationships between them.
        </p>
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <NetworkGraphVisualization
            data={data}
            width={1000}
            height={600}
            onNodeClick={(node) => console.log('Node clicked:', node)}
          />
        </div>
      </div>
    </div>
  );
}
