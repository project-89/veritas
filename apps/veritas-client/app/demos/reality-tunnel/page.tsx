'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { generateRealityTunnelData } from '../../../lib/mock-data';

const RealityTunnelVisualization = dynamic(
  () => import('@veritas-nx/visualization').then(mod => ({ default: mod.RealityTunnelVisualization })),
  { ssr: false }
);

export default function RealityTunnelPage() {
  const [data] = useState(generateRealityTunnelData());

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-2">Reality Tunnel Visualization</h2>
        <p className="mb-4 text-slate-400 text-sm">
          This visualization shows how narratives and perspectives evolve and diverge over time, creating &quot;reality tunnels&quot; that shape perception.
        </p>
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <RealityTunnelVisualization
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
