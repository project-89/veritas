'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { generateRealityTunnelData } from '../../lib/mock-data';

const RealityTunnelVisualization = dynamic(
  () => import('@veritas-nx/visualization').then(mod => ({ default: mod.RealityTunnelVisualization })),
  { ssr: false }
);

export default function RealityTunnelPage() {
  const [data] = useState(generateRealityTunnelData());

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">
        Reality Tunnel Visualization
      </h2>
      <p className="mb-4 text-gray-600">
        This visualization shows how narratives and perspectives
        evolve and diverge over time, creating &quot;reality tunnels&quot; that
        shape perception.
      </p>
      <div className="border rounded-lg overflow-hidden">
        <RealityTunnelVisualization
          data={data}
          width={1000}
          height={600}
          onNodeClick={(node) => console.log('Node clicked:', node)}
        />
      </div>
    </div>
  );
}
