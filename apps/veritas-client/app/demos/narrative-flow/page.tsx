'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { NarrativeBranch, NarrativeConnection } from '@veritas-nx/visualization';
import { generateSampleNarrativeFlowData } from '@veritas-nx/visualization';

const NarrativeFlow = dynamic(
  () => import('@veritas-nx/visualization').then(mod => ({ default: mod.NarrativeFlow })),
  { ssr: false }
);

export default function NarrativeFlowPage() {
  const [data, setData] = useState(generateSampleNarrativeFlowData());
  const [showLabels, setShowLabels] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [animate, setAnimate] = useState(true);
  const [selectedElement, setSelectedElement] = useState<{
    type: 'branch' | 'connection';
    data: NarrativeBranch | NarrativeConnection;
  } | null>(null);

  const regenerateData = () => {
    const startYear = 2018 + Math.floor(Math.random() * 3);
    const endYear = startYear + 2 + Math.floor(Math.random() * 3);
    const numBranches = 3 + Math.floor(Math.random() * 5);
    setData(generateSampleNarrativeFlowData(new Date(startYear, 0, 1), new Date(endYear, 0, 1), numBranches));
    setSelectedElement(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-2">Narrative Flow Visualization</h2>
        <p className="mb-4 text-slate-400 text-sm">
          How narratives emerge from, diverge from, and sometimes return to consensus reality.
        </p>

        <div className="flex flex-wrap gap-3 mb-4">
          <button onClick={regenerateData} className="px-3 py-1.5 text-xs rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
            Generate New Data
          </button>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} className="rounded" />
            Labels
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} className="rounded" />
            Events
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} className="rounded" />
            Animate
          </label>
        </div>

        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <NarrativeFlow
            data={data}
            width={1000}
            height={600}
            showLabels={showLabels}
            showEvents={showEvents}
            animate={animate}
            onBranchClick={(branch) => setSelectedElement({ type: 'branch', data: branch })}
            onConnectionClick={(connection) => setSelectedElement({ type: 'connection', data: connection })}
          />
        </div>
      </div>

      {selectedElement?.type === 'branch' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-white">{(selectedElement.data as NarrativeBranch).name}</h3>
            <button onClick={() => setSelectedElement(null)} className="text-xs text-slate-500 hover:text-slate-300">Close</button>
          </div>
          <p className="text-sm text-slate-400 mb-3">{(selectedElement.data as NarrativeBranch).description}</p>
          <div className="flex flex-wrap gap-4 text-sm text-slate-300">
            <span>Peak: {(selectedElement.data as NarrativeBranch).metrics.peakStrength.toFixed(2)}</span>
            <span>Influence: {(selectedElement.data as NarrativeBranch).metrics.influence.toFixed(2)}</span>
            <span>Volatility: {(selectedElement.data as NarrativeBranch).metrics.volatility.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
