'use client';

import dynamic from 'next/dynamic';

const VisualizationDemo = dynamic(
  () => import('@veritas-nx/visualization').then(mod => ({ default: mod.VisualizationDemo })),
  { ssr: false }
);

export default function DemoPage() {
  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">
        All Visualizations Demo
      </h2>
      <p className="mb-4 text-gray-600">
        This interactive demo showcases all visualization types in one
        place, allowing you to switch between them and compare their
        features.
      </p>
      <div className="border rounded-lg overflow-hidden">
        <VisualizationDemo />
      </div>
    </div>
  );
}
