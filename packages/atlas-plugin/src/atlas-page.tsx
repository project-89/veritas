'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addInvestigationEvidenceSeed,
  buildMentalModel,
  createOrGetInvestigation,
  fetchAtlasLenses,
  fetchInvestigation,
  type AtlasLensRecord,
  type Investigation,
  type InvestigationEvidenceSeed,
  type MentalModel,
} from '../../../apps/veritas-client/lib/api';
import { NervBadge } from '../../../apps/veritas-client/components/nerv/nerv-badge';
import { NervPanel } from '../../../apps/veritas-client/components/nerv/nerv-panel';
import { NervStatus } from '../../../apps/veritas-client/components/nerv/nerv-status';

const SEED_KINDS: InvestigationEvidenceSeed['kind'][] = [
  'youtube',
  'url',
  'article',
  'post',
  'wallet',
  'contract',
  'domain',
  'document',
  'note',
];

interface DraftSource {
  uid: string;
  kind: InvestigationEvidenceSeed['kind'];
  value: string;
  label: string;
  notes: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function getInvestigationId(investigation: Investigation | null | undefined): string | null {
  return investigation?._id ?? investigation?.id ?? null;
}

function buildAtlasQuery(title: string): string {
  const base = slugify(title) || 'lens';
  return `atlas:${base}:${Date.now().toString(36)}`;
}

function timeAgo(iso: string | Date): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function createDraftSource(kind: InvestigationEvidenceSeed['kind'] = 'youtube'): DraftSource {
  return {
    uid: `src-${Math.random().toString(36).slice(2, 10)}`,
    kind,
    value: '',
    label: '',
    notes: '',
  };
}

export function AtlasPage() {
  const router = useRouter();
  const [lenses, setLenses] = useState<AtlasLensRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedInvestigation, setSelectedInvestigation] = useState<Investigation | null>(null);
  const [selectedMentalModel, setSelectedMentalModel] = useState<MentalModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [draftSources, setDraftSources] = useState<DraftSource[]>([createDraftSource()]);

  const loadLenses = useCallback(async (preferId?: string | null) => {
    setLoading(true);
    try {
      const result = await fetchAtlasLenses();
      setLenses(result);
      const nextId =
        preferId ??
        (selectedId && result.some((record) => getInvestigationId(record.investigation) === selectedId)
          ? selectedId
          : getInvestigationId(result[0]?.investigation) ?? null);
      setSelectedId(nextId);
      setError(null);
    } catch (err) {
      setError(`Failed to load ATLAS lenses: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const loadSelected = useCallback(async (investigationId: string | null) => {
    if (!investigationId) {
      setSelectedInvestigation(null);
      setSelectedMentalModel(null);
      return;
    }
    try {
      const result = await fetchInvestigation(investigationId);
      setSelectedInvestigation(result.investigation);
      setSelectedMentalModel(result.mentalModel);
      setError(null);
    } catch (err) {
      setError(`Failed to load lens detail: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }, []);

  useEffect(() => {
    void loadLenses();
  }, [loadLenses]);

  useEffect(() => {
    void loadSelected(selectedId);
  }, [selectedId, loadSelected]);

  const selectedLens = useMemo(
    () => lenses.find((record) => getInvestigationId(record.investigation) === selectedId) ?? null,
    [lenses, selectedId],
  );

  const resetSourceForm = useCallback(() => {
    setDraftSources([createDraftSource()]);
  }, []);

  const updateDraftSource = useCallback((uid: string, patch: Partial<DraftSource>) => {
    setDraftSources((prev) =>
      prev.map((source) => (source.uid === uid ? { ...source, ...patch } : source)),
    );
  }, []);

  const addDraftSource = useCallback(() => {
    setDraftSources((prev) => [...prev, createDraftSource()]);
  }, []);

  const removeDraftSource = useCallback((uid: string) => {
    setDraftSources((prev) => {
      if (prev.length === 1) {
        return [createDraftSource()];
      }
      return prev.filter((source) => source.uid !== uid);
    });
  }, []);

  const validDraftSources = useMemo(
    () => draftSources.filter((source) => source.value.trim()),
    [draftSources],
  );

  const handleCreateLens = useCallback(async () => {
    if (!title.trim() || validDraftSources.length === 0) {
      setError('Title and at least one source are required.');
      return;
    }

    setSaving(true);
    try {
      const investigation = await createOrGetInvestigation(buildAtlasQuery(title), {
        name: title.trim(),
        platforms: [],
        timeRange: '30d',
        limit: 25,
      });
      const investigationId = getInvestigationId(investigation);
      if (!investigationId) {
        throw new Error('ATLAS investigation did not return an id');
      }

      for (const source of validDraftSources) {
        await addInvestigationEvidenceSeed(investigationId, {
          kind: source.kind,
          value: source.value.trim(),
          label: source.label.trim() || undefined,
          notes: source.notes.trim() || null,
        });
      }

      await buildMentalModel(investigationId);
      await loadLenses(investigationId);
      await loadSelected(investigationId);
      resetSourceForm();
      setTitle('');
      setError(null);
    } catch (err) {
      setError(`Failed to create lens: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  }, [loadLenses, loadSelected, resetSourceForm, title, validDraftSources]);

  const handleAddSourceToLens = useCallback(async () => {
    if (!selectedId) {
      setError('Select an existing lens first.');
      return;
    }
    if (validDraftSources.length === 0) {
      setError('At least one source value is required.');
      return;
    }

    setSaving(true);
    try {
      for (const source of validDraftSources) {
        await addInvestigationEvidenceSeed(selectedId, {
          kind: source.kind,
          value: source.value.trim(),
          label: source.label.trim() || undefined,
          notes: source.notes.trim() || null,
        });
      }
      const built = await buildMentalModel(selectedId);
      setSelectedInvestigation(built.investigation);
      setSelectedMentalModel(built.mentalModel);
      await loadLenses(selectedId);
      resetSourceForm();
      setError(null);
    } catch (err) {
      setError(`Failed to extend lens: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  }, [selectedId, validDraftSources, loadLenses, resetSourceForm]);

  const handleRebuildLens = useCallback(async () => {
    if (!selectedId) return;
    setRebuilding(true);
    try {
      const result = await buildMentalModel(selectedId);
      setSelectedInvestigation(result.investigation);
      setSelectedMentalModel(result.mentalModel);
      await loadLenses(selectedId);
      setError(null);
    } catch (err) {
      setError(`Failed to rebuild lens: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setRebuilding(false);
    }
  }, [selectedId, loadLenses]);

  return (
    <div className="h-[calc(100vh-3.5rem)] flex overflow-hidden">
      <div className="w-[300px] shrink-0 border-r border-nerv-border bg-nerv-bg-panel overflow-hidden flex flex-col">
        <div className="px-3 py-3 border-b border-nerv-border">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.28em] text-nerv-orange">
                ATLAS
              </div>
              <div className="text-[10px] font-mono text-nerv-text-muted mt-1">
                Saved lenses and reusable reasoning maps
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push('/search')}
              className="text-[9px] font-mono uppercase text-nerv-text-secondary hover:text-nerv-orange"
            >
              New Scan
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto nerv-scrollbar px-2 py-2">
          {loading ? (
            <div className="px-2 py-8 text-[10px] font-mono text-nerv-text-muted">Loading ATLAS...</div>
          ) : lenses.length === 0 ? (
            <div className="px-2 py-8 text-[10px] font-mono text-nerv-text-muted leading-relaxed">
              No lenses yet. Create one from a YouTube video, article, profile URL, wallet, contract, or analyst note.
            </div>
          ) : (
            <div className="space-y-1">
              {lenses.map((record) => {
                const investigationId = getInvestigationId(record.investigation);
                const isSelected = investigationId === selectedId;
                return (
                  <button
                    key={investigationId ?? record.mentalModel.id}
                    type="button"
                    onClick={() => setSelectedId(investigationId)}
                    className={[
                      'w-full text-left px-3 py-2 rounded-sm border transition-colors',
                      isSelected
                        ? 'border-nerv-orange/50 bg-nerv-orange/8'
                        : 'border-transparent hover:border-nerv-border hover:bg-nerv-bg-elevated/30',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-mono text-nerv-text truncate">
                          {record.investigation.name}
                        </div>
                        <div className="text-[9px] font-mono text-nerv-text-muted truncate mt-1">
                          {record.mentalModel.domain}
                        </div>
                      </div>
                      <NervBadge
                        label={record.mentalModel.status.toUpperCase()}
                        variant={record.mentalModel.status === 'generated' ? 'green' : 'amber'}
                        size="sm"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[8px] font-mono text-nerv-text-muted">
                        {timeAgo(record.mentalModel.updatedAt)}
                      </span>
                      <span className="text-[8px] font-mono text-nerv-text-muted">
                        {record.mentalModel.sourceSummary.processedSeeds}/{record.mentalModel.sourceSummary.totalSeeds} SRC
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto nerv-scrollbar p-4 space-y-4">
        {error && (
          <div className="px-3 py-2 border border-nerv-red/40 bg-nerv-red/10 text-[10px] font-mono text-nerv-red">
            {error}
          </div>
        )}

        <NervPanel
          title="ATLAS Lens Intake"
          subtitle="Extract a reusable reasoning framework from a source"
          accent="orange"
          headerRight={<NervStatus status={saving || rebuilding ? 'warning' : 'online'} size="sm" />}
        >
          <div className="p-4 grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1">
                  New Lens Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Net Crypto Scam Tradecraft"
                  className="w-full bg-nerv-bg-deep border border-nerv-border px-3 py-2 text-[11px] font-mono text-nerv-text outline-none focus:border-nerv-orange"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1">
                  Source Inputs
                </label>
                <div className="space-y-3">
                  {draftSources.map((source, index) => (
                    <div key={source.uid} className="border border-nerv-border bg-nerv-bg-deep/60 px-3 py-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
                          Source {index + 1}
                        </div>
                        <div className="flex items-center gap-2">
                          {draftSources.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeDraftSource(source.uid)}
                              className="text-[9px] font-mono uppercase text-nerv-red hover:text-nerv-orange"
                            >
                              Remove
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={addDraftSource}
                            className="w-6 h-6 border border-nerv-orange/40 text-nerv-orange hover:bg-nerv-orange/10 text-[14px] leading-none"
                            aria-label="Add source input"
                            title="Add source"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {SEED_KINDS.map((seedKind) => (
                          <button
                            key={`${source.uid}-${seedKind}`}
                            type="button"
                            onClick={() => updateDraftSource(source.uid, { kind: seedKind })}
                            className={[
                              'px-2 py-1 text-[9px] font-mono uppercase rounded-sm border transition-colors',
                              source.kind === seedKind
                                ? 'border-nerv-orange/50 bg-nerv-orange/15 text-nerv-orange'
                                : 'border-nerv-border text-nerv-text-muted hover:text-nerv-text',
                            ].join(' ')}
                          >
                            {seedKind}
                          </button>
                        ))}
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1">
                          Source Value
                        </label>
                        <input
                          value={source.value}
                          onChange={(e) => updateDraftSource(source.uid, { value: e.target.value })}
                          placeholder="https://www.youtube.com/watch?v=..."
                          className="w-full bg-nerv-bg-deep border border-nerv-border px-3 py-2 text-[11px] font-mono text-nerv-text outline-none focus:border-nerv-orange"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1">
                          Label
                        </label>
                        <input
                          value={source.label}
                          onChange={(e) => updateDraftSource(source.uid, { label: e.target.value })}
                          placeholder="Net Crypto Rexas Video"
                          className="w-full bg-nerv-bg-deep border border-nerv-border px-3 py-2 text-[11px] font-mono text-nerv-text outline-none focus:border-nerv-orange"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1">
                          Analyst Note
                        </label>
                        <textarea
                          value={source.notes}
                          onChange={(e) => updateDraftSource(source.uid, { notes: e.target.value })}
                          placeholder="Why this source matters, what it contributes, or how it should influence the lens."
                          rows={3}
                          className="w-full bg-nerv-bg-deep border border-nerv-border px-3 py-2 text-[11px] font-mono text-nerv-text outline-none focus:border-nerv-orange resize-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="text-[10px] font-mono text-nerv-text-muted leading-relaxed">
                  {validDraftSources.length} source{validDraftSources.length === 1 ? '' : 's'} ready.
                  Add as many videos, URLs, notes, wallets, or profiles as you want before creating the lens.
                </div>
                <div className="flex items-end justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCreateLens()}
                    disabled={saving || rebuilding}
                    className="px-3 py-2 text-[10px] font-mono uppercase border border-nerv-orange/40 text-nerv-orange hover:bg-nerv-orange/10 disabled:opacity-50"
                  >
                    {saving ? 'WORKING...' : 'Create Lens'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAddSourceToLens()}
                    disabled={saving || rebuilding || !selectedId}
                    className="px-3 py-2 text-[10px] font-mono uppercase border border-nerv-border text-nerv-text-secondary hover:bg-nerv-bg-elevated/40 disabled:opacity-50"
                  >
                    Add All To Selected
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="border border-nerv-border bg-nerv-bg-deep px-3 py-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
                  ATLAS Concept
                </div>
                <div className="text-[11px] font-mono leading-relaxed text-nerv-text-secondary">
                  ATLAS extracts a reusable lens from source material: how the source frames a domain, what evidence it trusts,
                  what heuristics it repeats, and what workflow it follows. Once saved, the lens can be reused inside investigations.
                </div>
              </div>

              {selectedLens ? (
                <div className="border border-nerv-border bg-nerv-bg-deep px-3 py-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
                        Selected Lens
                      </div>
                      <div className="text-[11px] font-mono text-nerv-text mt-1">
                        {selectedLens.investigation.name}
                      </div>
                    </div>
                    <NervBadge label={selectedLens.mentalModel.status.toUpperCase()} variant={selectedLens.mentalModel.status === 'generated' ? 'green' : 'amber'} size="sm" />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedLens.mentalModel.sourceSummary.seedKinds.map((seedKind) => (
                      <NervBadge key={seedKind} label={seedKind.toUpperCase()} variant="blue" size="sm" />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRebuildLens()}
                      disabled={rebuilding}
                      className="px-3 py-2 text-[10px] font-mono uppercase border border-nerv-orange/40 text-nerv-orange hover:bg-nerv-orange/10 disabled:opacity-50"
                    >
                      {rebuilding ? 'REBUILDING...' : 'Refresh Lens'}
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(`/results?inv=${encodeURIComponent(selectedId ?? '')}`)}
                      disabled={!selectedId}
                      className="px-3 py-2 text-[10px] font-mono uppercase border border-nerv-border text-nerv-text-secondary hover:bg-nerv-bg-elevated/40 disabled:opacity-50"
                    >
                      Open Case
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-nerv-border px-3 py-6 text-[10px] font-mono text-nerv-text-muted text-center">
                  Select a saved lens or create a new one.
                </div>
              )}
            </div>
          </div>
        </NervPanel>

        <div className="grid grid-cols-1 xl:grid-cols-[0.92fr_1.08fr] gap-4">
          <NervPanel title="Pinned Sources" subtitle="Evidence currently shaping the selected lens" accent="blue">
            <div className="p-4 space-y-2">
              {selectedInvestigation?.evidenceSeeds?.length ? (
                selectedInvestigation.evidenceSeeds.map((seed) => (
                  <div key={seed.id} className="border border-nerv-border bg-nerv-bg-deep px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-mono text-nerv-text truncate">
                          {seed.label || seed.value}
                        </div>
                        <div className="text-[9px] font-mono text-nerv-text-muted mt-1 break-all">
                          {seed.value}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <NervBadge label={seed.kind.toUpperCase()} variant="blue" size="sm" />
                        <NervBadge label={seed.status.toUpperCase()} variant={seed.status === 'processed' ? 'green' : seed.status === 'error' ? 'red' : 'amber'} size="sm" />
                      </div>
                    </div>
                    {seed.notes && (
                      <div className="mt-2 text-[9px] font-mono text-nerv-text-secondary leading-relaxed">
                        {seed.notes}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-[10px] font-mono text-nerv-text-muted">
                  No sources attached yet.
                </div>
              )}
            </div>
          </NervPanel>

          <NervPanel title="Lens Output" subtitle="Reusable reasoning model extracted from the source set" accent="purple">
            <div className="p-4 space-y-4">
              {selectedMentalModel ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-mono text-nerv-orange">{selectedMentalModel.name}</div>
                      <div className="text-[10px] font-mono text-nerv-text-muted mt-1">
                        {selectedMentalModel.domain}
                      </div>
                    </div>
                    <NervBadge
                      label={`${selectedMentalModel.sourceSummary.processedSeeds}/${selectedMentalModel.sourceSummary.totalSeeds} SRC`}
                      variant="blue"
                      size="sm"
                    />
                  </div>

                  <div className="text-[11px] font-mono leading-relaxed text-nerv-text-secondary whitespace-pre-wrap">
                    {selectedMentalModel.summary}
                  </div>

                  {selectedMentalModel.heuristics.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
                        Heuristics
                      </div>
                      <div className="space-y-2">
                        {selectedMentalModel.heuristics.map((heuristic) => (
                          <div key={heuristic.title} className="border border-nerv-border bg-nerv-bg-deep px-3 py-2">
                            <div className="text-[10px] font-mono text-nerv-text">{heuristic.title}</div>
                            <div className="text-[10px] font-mono text-nerv-text-secondary mt-1 leading-relaxed">
                              {heuristic.description}
                            </div>
                            {heuristic.evidence.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {heuristic.evidence.map((evidence) => (
                                  <NervBadge key={evidence} label={evidence} variant="amber" size="sm" />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
                        Decision Rules
                      </div>
                      <div className="space-y-1">
                        {selectedMentalModel.decisionRules.map((rule, index) => (
                          <div key={`${rule}-${index}`} className="text-[10px] font-mono text-nerv-text-secondary leading-relaxed">
                            {rule}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
                        Workflow
                      </div>
                      <div className="space-y-1">
                        {selectedMentalModel.workflowSteps.map((step, index) => (
                          <div key={`${step}-${index}`} className="text-[10px] font-mono text-nerv-text-secondary leading-relaxed">
                            {step}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
                        Evidence Prefs
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedMentalModel.evidencePreferences.map((item) => (
                          <NervBadge key={item} label={item} variant="blue" size="sm" />
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
                        Blind Spots
                      </div>
                      <div className="space-y-1">
                        {selectedMentalModel.blindSpots.map((item, index) => (
                          <div key={`${item}-${index}`} className="text-[10px] font-mono text-nerv-text-secondary leading-relaxed">
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
                        Signature Phrases
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedMentalModel.signaturePhrases.map((item) => (
                          <NervBadge key={item} label={item} variant="purple" size="sm" />
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-[10px] font-mono text-nerv-text-muted">
                  Build a lens from one or more sources to see heuristics, workflow, decision rules, and evidence preferences here.
                </div>
              )}
            </div>
          </NervPanel>
        </div>
      </div>
    </div>
  );
}
