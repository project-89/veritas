'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { generateNetworkData } from '../../lib/mock-data';

const NetworkGraphVisualization = dynamic(
  () => import('@veritas-nx/visualization').then(mod => ({ default: mod.NetworkGraphVisualization })),
  { ssr: false }
);

export default function NetworkPage() {
  const [data] = useState(generateNetworkData());

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">
        Network Graph Visualization
      </h2>
      <p className="mb-4 text-gray-600">
        This visualization shows network relationships between
        different entities. Nodes represent content, sources, or
        accounts, while edges represent relationships between them.
      </p>
      <div className="border rounded-lg overflow-hidden">
        <NetworkGraphVisualization
          data={data}
          width={1000}
          height={600}
          onNodeClick={(node) => console.log('Node clicked:', node)}
        />
      </div>
    </div>
  );
}
