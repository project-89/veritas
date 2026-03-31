'use client';

import dynamic from 'next/dynamic';

const VisualizationDemo = dynamic(
  () => import('@veritas-nx/visualization').then(mod => ({ default: mod.VisualizationDemo })),
  { ssr: false }
);

export default function AllDemosPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-2">All Visualizations Demo</h2>
        <p className="mb-4 text-slate-400 text-sm">
          Interactive demo showcasing all visualization types in one place.
        </p>
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <VisualizationDemo />
        </div>
      </div>
    </div>
  );
}
