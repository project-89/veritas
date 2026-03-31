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
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-2">Enhanced Reality Tunnel Visualization</h2>
        <p className="mb-4 text-slate-400 text-sm">
          This advanced visualization extends the reality tunnel concept with enhanced features for deeper narrative analysis and exploration.
        </p>
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <EnhancedRealityTunnelVisualization
            data={data}
            width={1000}
            height={600}
            onNodeClick={(node) => console.log('Node clicked:', node)}
            onBranchClick={(branch) => console.log('Branch clicked:', branch)}
          />
        </div>
      </div>
    </div>
  );
}
