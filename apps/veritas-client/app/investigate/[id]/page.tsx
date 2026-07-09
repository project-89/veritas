'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { fetchInvestigation } from '../../../lib/api';

function LoadingState() {
  return (
    <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-6 h-6 border-2 border-nerv-border border-t-nerv-orange rounded-full animate-spin mx-auto" />
        <span className="text-[12px] font-mono text-nerv-text-muted uppercase tracking-widest">
          Loading Investigation...
        </span>
      </div>
    </div>
  );
}

function InvestigatePageInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const investigationId =
      typeof params.id === 'string' &&
      params.id.trim() !== '' &&
      params.id !== 'undefined' &&
      params.id !== 'null'
        ? params.id
        : null;
    if (!investigationId) return;

    // Load the investigation and redirect to the results workspace with proper params
    fetchInvestigation(investigationId)
      .then((data) => {
        if (data.investigation) {
          const inv = data.investigation;
          // Preserve any URL params from the search page (fresh, platforms, etc.)
          const existingParams = new URLSearchParams(searchParams.toString());
          if (!existingParams.has('q')) {
            existingParams.set('q', inv.query);
          }
          const resolvedInvestigationId = inv._id ?? inv.id;
          if (!resolvedInvestigationId) {
            throw new Error('Investigation payload missing id');
          }
          existingParams.set('inv', resolvedInvestigationId);
          router.replace(`/results?${existingParams.toString()}`);
        } else {
          setError('Investigation not found');
        }
      })
      .catch((err) => {
        setError(`Failed to load: ${err instanceof Error ? err.message : err}`);
      });
  }, [params.id, searchParams, router]);

  if (error) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <span className="text-sm font-mono text-nerv-red">{error}</span>
          <button
            type="button"
            onClick={() => router.push('/monitor')}
            className="block text-[12px] font-mono text-nerv-orange uppercase tracking-widest hover:underline mx-auto"
          >
            Back to Monitor
          </button>
        </div>
      </div>
    );
  }

  return <LoadingState />;
}

export default function InvestigatePage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <InvestigatePageInner />
    </Suspense>
  );
}
