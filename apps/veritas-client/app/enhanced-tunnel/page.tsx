'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { generateEnhancedTunnelData } from '@veritas-nx/visualization';

const EnhancedRealityTunnelVisualization = dynamic(
  () => import('@veritas-nx/visualization').then(mod => ({ default: mod.EnhancedRealityTunnelVisualization })),
  { ssr: false }
);

export default function EnhancedTunnelPage() {
  const [data] = useState(generateEnhancedTunnelData());

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">
        Enhanced Reality Tunnel Visualization
      </h2>
      <p className="mb-4 text-gray-600">
        This advanced visualization extends the reality tunnel concept
        with enhanced features for deeper narrative analysis and
        exploration.
      </p>
      <div className="border rounded-lg overflow-hidden">
        <EnhancedRealityTunnelVisualization
          data={data}
          width={1000}
          height={600}
          onNodeClick={(node) => console.log('Node clicked:', node)}
          onBranchClick={(branch) =>
            console.log('Branch clicked:', branch)
          }
        />
      </div>
    </div>
  );
}
