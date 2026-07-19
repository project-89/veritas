'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

type AtlasSeedKind =
  | 'youtube'
  | 'url'
  | 'article'
  | 'post'
  | 'wallet'
  | 'contract'
  | 'domain'
  | 'document'
  | 'note';

interface AtlasMentalModel {
  id: string;
  name: string;
  domain: string;
  summary: string;
  status: 'draft' | 'generating' | 'generated' | 'failed';
  sourceSummary: {
    totalSeeds: number;
    processedSeeds: number;
    seedKinds: string[];
  };
  heuristics: Array<{
    title: string;
    description: string;
    evidence: string[];
  }>;
  decisionRules: string[];
  workflowSteps: string[];
  evidencePreferences: string[];
  blindSpots: string[];
  signaturePhrases: string[];
  updatedAt: string | Date;
}

interface AtlasEvidenceSeed {
  id: string;
  kind: AtlasSeedKind;
  value: string;
  label?: string;
  status: 'pending' | 'processing' | 'processed' | 'error';
  notes?: string | null;
}

interface AtlasInvestigation {
  _id?: string;
  id?: string;
  name: string;
  evidenceSeeds?: AtlasEvidenceSeed[];
}

interface AtlasLensRecord {
  investigation: AtlasInvestigation;
  mentalModel: AtlasMentalModel;
}

interface AtlasPageApi {
  fetchAtlasLenses(): Promise<AtlasLensRecord[]>;
  fetchInvestigation(
    investigationId: string,
  ): Promise<{ investigation: AtlasInvestigation; mentalModel: AtlasMentalModel | null }>;
  createOrGetInvestigation(
    query: string,
    options: {
      name: string;
      platforms: string[];
      timeRange: string;
      limit: number;
    },
  ): Promise<AtlasInvestigation>;
  addInvestigationEvidenceSeed(
    investigationId: string,
    seed: {
      kind: AtlasSeedKind;
      value: string;
      label?: string;
      notes?: string | null;
    },
  ): Promise<unknown>;
  buildMentalModel(
    investigationId: string,
  ): Promise<{ investigation: AtlasInvestigation; mentalModel: AtlasMentalModel | null }>;
}

interface AtlasPageProps {
  api: AtlasPageApi;
}

interface DraftSource {
  uid: string;
  kind: AtlasSeedKind;
  value: string;
  label: string;
  notes: string;
}

const SEED_KINDS: AtlasSeedKind[] = [
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

function AtlasBadge({
  label,
  variant = 'muted',
}: {
  label: string;
  variant?: 'muted' | 'blue' | 'green' | 'amber' | 'purple' | 'red';
}) {
  const variantClass = {
    muted: 'border-nerv-border text-nerv-text-muted bg-nerv-bg-elevated/20',
    blue: 'border-nerv-blue/40 text-nerv-blue bg-nerv-blue/10',
    green: 'border-nerv-green/40 text-nerv-green bg-nerv-green/10',
    amber: 'border-nerv-amber/40 text-nerv-amber bg-nerv-amber/10',
    purple: 'border-nerv-purple/40 text-nerv-purple bg-nerv-purple/10',
    red: 'border-nerv-red/40 text-nerv-red bg-nerv-red/10',
  }[variant];

  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider ${variantClass}`}
    >
      {label}
    </span>
  );
}

function AtlasStatus({ active }: { active: boolean }) {
  return (
    <div className="inline-flex items-center gap-1">
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-nerv-amber shadow-[0_0_6px_rgba(245,158,11,0.7)]' : 'bg-nerv-green shadow-[0_0_6px_rgba(0,255,65,0.6)]'}`}
      />
      <span className="text-[8px] font-mono uppercase tracking-wider text-nerv-text-muted">
        {active ? 'BUSY' : 'READY'}
      </span>
    </div>
  );
}

function AtlasPanel({
  title,
  subtitle,
  accent = 'orange',
  headerRight,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: 'orange' | 'blue' | 'purple';
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  const accentClass = {
    orange: 'border-l-nerv-orange',
    blue: 'border-l-nerv-blue',
    purple: 'border-l-nerv-purple',
  }[accent];

  return (
    <div
      className={`overflow-hidden rounded-sm border border-nerv-border border-l-2 ${accentClass} bg-nerv-bg-panel`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-nerv-border px-4 py-3">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-nerv-text">
            {title}
          </div>
          {subtitle ? (
            <div className="mt-1 text-[10px] font-mono text-nerv-text-muted">{subtitle}</div>
          ) : null}
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function getInvestigationId(investigation: AtlasInvestigation | null | undefined): string | null {
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

function createDraftSource(kind: AtlasSeedKind = 'youtube'): DraftSource {
  return {
    uid: `src-${Math.random().toString(36).slice(2, 10)}`,
    kind,
    value: '',
    label: '',
    notes: '',
  };
}

function sourceFieldId(sourceUid: string, field: 'value' | 'label' | 'notes'): string {
  return `${sourceUid}-${field}`;
}

export function AtlasPage({ api }: AtlasPageProps) {
  const router = useRouter();
  const [lenses, setLenses] = useState<AtlasLensRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedInvestigation, setSelectedInvestigation] = useState<AtlasInvestigation | null>(
    null,
  );
  const [selectedMentalModel, setSelectedMentalModel] = useState<AtlasMentalModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [draftSources, setDraftSources] = useState<DraftSource[]>([createDraftSource()]);

  const loadLenses = useCallback(
    async (preferId?: string | null) => {
      setLoading(true);
      try {
        const result = await api.fetchAtlasLenses();
        setLenses(result);
        const nextId =
          preferId ??
          (selectedId &&
          result.some((record) => getInvestigationId(record.investigation) === selectedId)
            ? selectedId
            : (getInvestigationId(result[0]?.investigation) ?? null));
        setSelectedId(nextId);
        setError(null);
      } catch (err) {
        setError(
          `Failed to load ATLAS lenses: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      } finally {
        setLoading(false);
      }
    },
    [api, selectedId],
  );

  const loadSelected = useCallback(
    async (investigationId: string | null) => {
      if (!investigationId) {
        setSelectedInvestigation(null);
        setSelectedMentalModel(null);
        return;
      }
      try {
        const result = await api.fetchInvestigation(investigationId);
        setSelectedInvestigation(result.investigation);
        setSelectedMentalModel(result.mentalModel);
        setError(null);
      } catch (err) {
        setError(
          `Failed to load lens detail: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    },
    [api],
  );

  useEffect(() => {
    void loadLenses();
  }, [loadLenses]);

  useEffect(() => {
    void loadSelected(selectedId);
  }, [loadSelected, selectedId]);

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
      const investigation = await api.createOrGetInvestigation(buildAtlasQuery(title), {
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
        await api.addInvestigationEvidenceSeed(investigationId, {
          kind: source.kind,
          value: source.value.trim(),
          label: source.label.trim() || undefined,
          notes: source.notes.trim() || null,
        });
      }

      await api.buildMentalModel(investigationId);
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
  }, [api, loadLenses, loadSelected, resetSourceForm, title, validDraftSources]);

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
        await api.addInvestigationEvidenceSeed(selectedId, {
          kind: source.kind,
          value: source.value.trim(),
          label: source.label.trim() || undefined,
          notes: source.notes.trim() || null,
        });
      }
      const built = await api.buildMentalModel(selectedId);
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
  }, [api, loadLenses, resetSourceForm, selectedId, validDraftSources]);

  const handleRebuildLens = useCallback(async () => {
    if (!selectedId) return;
    setRebuilding(true);
    try {
      const result = await api.buildMentalModel(selectedId);
      setSelectedInvestigation(result.investigation);
      setSelectedMentalModel(result.mentalModel);
      await loadLenses(selectedId);
      setError(null);
    } catch (err) {
      setError(`Failed to rebuild lens: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setRebuilding(false);
    }
  }, [api, loadLenses, selectedId]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <div className="flex w-[300px] shrink-0 flex-col overflow-hidden border-r border-nerv-border bg-nerv-bg-panel">
        <div className="border-b border-nerv-border px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.28em] text-nerv-orange">
                ATLAS
              </div>
              <div className="mt-1 text-[10px] font-mono text-nerv-text-muted">
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

        <div className="nerv-scrollbar flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="px-2 py-8 text-[10px] font-mono text-nerv-text-muted">
              Loading ATLAS...
            </div>
          ) : lenses.length === 0 ? (
            <div className="px-2 py-8 text-[10px] font-mono leading-relaxed text-nerv-text-muted">
              No lenses yet. Create one from a YouTube video, article, profile URL, wallet,
              contract, or analyst note.
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
                      'w-full rounded-sm border px-3 py-2 text-left transition-colors',
                      isSelected
                        ? 'border-nerv-orange/50 bg-nerv-orange/8'
                        : 'border-transparent hover:border-nerv-border hover:bg-nerv-bg-elevated/30',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[10px] font-mono text-nerv-text">
                          {record.investigation.name}
                        </div>
                        <div className="mt-1 truncate text-[9px] font-mono text-nerv-text-muted">
                          {record.mentalModel.domain}
                        </div>
                      </div>
                      <AtlasBadge
                        label={record.mentalModel.status.toUpperCase()}
                        variant={record.mentalModel.status === 'generated' ? 'green' : 'amber'}
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[8px] font-mono text-nerv-text-muted">
                        {timeAgo(record.mentalModel.updatedAt)}
                      </span>
                      <span className="text-[8px] font-mono text-nerv-text-muted">
                        {record.mentalModel.sourceSummary.processedSeeds}/
                        {record.mentalModel.sourceSummary.totalSeeds} SRC
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="nerv-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
        {error ? (
          <div className="border border-nerv-red/40 bg-nerv-red/10 px-3 py-2 text-[10px] font-mono text-nerv-red">
            {error}
          </div>
        ) : null}

        <AtlasPanel
          title="ATLAS Lens Intake"
          subtitle="Extract a reusable reasoning framework from a source"
          accent="orange"
          headerRight={<AtlasStatus active={saving || rebuilding} />}
        >
          <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="atlas-lens-title"
                  className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted"
                >
                  New Lens Title
                </label>
                <input
                  id="atlas-lens-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Influence Op Tradecraft"
                  className="w-full border border-nerv-border bg-nerv-bg-deep px-3 py-2 text-[11px] font-mono text-nerv-text outline-none focus:border-nerv-orange"
                />
              </div>

              <fieldset>
                <legend className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
                  Source Inputs
                </legend>
                <div className="space-y-3">
                  {draftSources.map((source, index) => (
                    <div
                      key={source.uid}
                      className="space-y-3 border border-nerv-border bg-nerv-bg-deep/60 px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
                          Source {index + 1}
                        </div>
                        <div className="flex items-center gap-2">
                          {draftSources.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => removeDraftSource(source.uid)}
                              className="text-[9px] font-mono uppercase text-nerv-red hover:text-nerv-orange"
                            >
                              Remove
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={addDraftSource}
                            className="h-6 w-6 border border-nerv-orange/40 text-[14px] leading-none text-nerv-orange hover:bg-nerv-orange/10"
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
                              'rounded-sm border px-2 py-1 text-[9px] font-mono uppercase transition-colors',
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
                        <label
                          htmlFor={sourceFieldId(source.uid, 'value')}
                          className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted"
                        >
                          Source Value
                        </label>
                        <input
                          id={sourceFieldId(source.uid, 'value')}
                          value={source.value}
                          onChange={(event) =>
                            updateDraftSource(source.uid, { value: event.target.value })
                          }
                          placeholder="https://www.youtube.com/watch?v=..."
                          className="w-full border border-nerv-border bg-nerv-bg-deep px-3 py-2 text-[11px] font-mono text-nerv-text outline-none focus:border-nerv-orange"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={sourceFieldId(source.uid, 'label')}
                          className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted"
                        >
                          Label
                        </label>
                        <input
                          id={sourceFieldId(source.uid, 'label')}
                          value={source.label}
                          onChange={(event) =>
                            updateDraftSource(source.uid, { label: event.target.value })
                          }
                          placeholder="Sanctions Evasion Explainer Video"
                          className="w-full border border-nerv-border bg-nerv-bg-deep px-3 py-2 text-[11px] font-mono text-nerv-text outline-none focus:border-nerv-orange"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={sourceFieldId(source.uid, 'notes')}
                          className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted"
                        >
                          Analyst Note
                        </label>
                        <textarea
                          id={sourceFieldId(source.uid, 'notes')}
                          value={source.notes}
                          onChange={(event) =>
                            updateDraftSource(source.uid, { notes: event.target.value })
                          }
                          placeholder="Why this source matters, what it contributes, or how it should influence the lens."
                          rows={3}
                          className="w-full resize-none border border-nerv-border bg-nerv-bg-deep px-3 py-2 text-[11px] font-mono text-nerv-text outline-none focus:border-nerv-orange"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="text-[10px] font-mono leading-relaxed text-nerv-text-muted">
                  {validDraftSources.length} source
                  {validDraftSources.length === 1 ? '' : 's'} ready. Add as many videos, URLs,
                  notes, wallets, or profiles as you want before creating the lens.
                </div>
                <div className="flex items-end justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCreateLens()}
                    disabled={saving || rebuilding}
                    className="border border-nerv-orange/40 px-3 py-2 text-[10px] font-mono uppercase text-nerv-orange hover:bg-nerv-orange/10 disabled:opacity-50"
                  >
                    {saving ? 'WORKING...' : 'Create Lens'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAddSourceToLens()}
                    disabled={saving || rebuilding || !selectedId}
                    className="border border-nerv-border px-3 py-2 text-[10px] font-mono uppercase text-nerv-text-secondary hover:bg-nerv-bg-elevated/40 disabled:opacity-50"
                  >
                    Add All To Selected
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="border border-nerv-border bg-nerv-bg-deep px-3 py-3">
                <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
                  ATLAS Concept
                </div>
                <div className="text-[11px] font-mono leading-relaxed text-nerv-text-secondary">
                  ATLAS extracts a reusable lens from source material: how the source frames a
                  domain, what evidence it trusts, what heuristics it repeats, and what workflow it
                  follows. Once saved, the lens can be reused inside investigations.
                </div>
              </div>

              {selectedLens ? (
                <div className="space-y-3 border border-nerv-border bg-nerv-bg-deep px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
                        Selected Lens
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-nerv-text">
                        {selectedLens.investigation.name}
                      </div>
                    </div>
                    <AtlasBadge
                      label={selectedLens.mentalModel.status.toUpperCase()}
                      variant={selectedLens.mentalModel.status === 'generated' ? 'green' : 'amber'}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedLens.mentalModel.sourceSummary.seedKinds.map((seedKind) => (
                      <AtlasBadge key={seedKind} label={seedKind.toUpperCase()} variant="blue" />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRebuildLens()}
                      disabled={rebuilding}
                      className="border border-nerv-orange/40 px-3 py-2 text-[10px] font-mono uppercase text-nerv-orange hover:bg-nerv-orange/10 disabled:opacity-50"
                    >
                      {rebuilding ? 'REBUILDING...' : 'Refresh Lens'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/results?inv=${encodeURIComponent(selectedId ?? '')}`)
                      }
                      disabled={!selectedId}
                      className="border border-nerv-border px-3 py-2 text-[10px] font-mono uppercase text-nerv-text-secondary hover:bg-nerv-bg-elevated/40 disabled:opacity-50"
                    >
                      Open Case
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-nerv-border px-3 py-6 text-center text-[10px] font-mono text-nerv-text-muted">
                  Select a saved lens or create a new one.
                </div>
              )}
            </div>
          </div>
        </AtlasPanel>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.92fr_1.08fr]">
          <AtlasPanel
            title="Pinned Sources"
            subtitle="Evidence currently shaping the selected lens"
            accent="blue"
          >
            <div className="space-y-2 p-4">
              {selectedInvestigation?.evidenceSeeds?.length ? (
                selectedInvestigation.evidenceSeeds.map((seed) => (
                  <div
                    key={seed.id}
                    className="border border-nerv-border bg-nerv-bg-deep px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[10px] font-mono text-nerv-text">
                          {seed.label || seed.value}
                        </div>
                        <div className="mt-1 break-all text-[9px] font-mono text-nerv-text-muted">
                          {seed.value}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <AtlasBadge label={seed.kind.toUpperCase()} variant="blue" />
                        <AtlasBadge
                          label={seed.status.toUpperCase()}
                          variant={
                            seed.status === 'processed'
                              ? 'green'
                              : seed.status === 'error'
                                ? 'red'
                                : 'amber'
                          }
                        />
                      </div>
                    </div>
                    {seed.notes ? (
                      <div className="mt-2 text-[9px] font-mono leading-relaxed text-nerv-text-secondary">
                        {seed.notes}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="text-[10px] font-mono text-nerv-text-muted">
                  No sources attached yet.
                </div>
              )}
            </div>
          </AtlasPanel>

          <AtlasPanel
            title="Lens Output"
            subtitle="Reusable reasoning model extracted from the source set"
            accent="purple"
          >
            <div className="space-y-4 p-4">
              {selectedMentalModel ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-mono text-nerv-orange">
                        {selectedMentalModel.name}
                      </div>
                      <div className="mt-1 text-[10px] font-mono text-nerv-text-muted">
                        {selectedMentalModel.domain}
                      </div>
                    </div>
                    <AtlasBadge
                      label={`${selectedMentalModel.sourceSummary.processedSeeds}/${selectedMentalModel.sourceSummary.totalSeeds} SRC`}
                      variant="blue"
                    />
                  </div>

                  <div className="whitespace-pre-wrap text-[11px] font-mono leading-relaxed text-nerv-text-secondary">
                    {selectedMentalModel.summary}
                  </div>

                  {selectedMentalModel.heuristics.length > 0 ? (
                    <div>
                      <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
                        Heuristics
                      </div>
                      <div className="space-y-2">
                        {selectedMentalModel.heuristics.map((heuristic) => (
                          <div
                            key={heuristic.title}
                            className="border border-nerv-border bg-nerv-bg-deep px-3 py-2"
                          >
                            <div className="text-[10px] font-mono text-nerv-text">
                              {heuristic.title}
                            </div>
                            <div className="mt-1 text-[10px] font-mono leading-relaxed text-nerv-text-secondary">
                              {heuristic.description}
                            </div>
                            {heuristic.evidence.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {heuristic.evidence.map((evidence) => (
                                  <AtlasBadge key={evidence} label={evidence} variant="amber" />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
                        Decision Rules
                      </div>
                      <div className="space-y-1">
                        {selectedMentalModel.decisionRules.map((rule, index) => (
                          <div
                            key={`${rule}-${index}`}
                            className="text-[10px] font-mono leading-relaxed text-nerv-text-secondary"
                          >
                            {rule}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
                        Workflow
                      </div>
                      <div className="space-y-1">
                        {selectedMentalModel.workflowSteps.map((step, index) => (
                          <div
                            key={`${step}-${index}`}
                            className="text-[10px] font-mono leading-relaxed text-nerv-text-secondary"
                          >
                            {step}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
                        Evidence Prefs
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedMentalModel.evidencePreferences.map((item) => (
                          <AtlasBadge key={item} label={item} variant="blue" />
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
                        Blind Spots
                      </div>
                      <div className="space-y-1">
                        {selectedMentalModel.blindSpots.map((item, index) => (
                          <div
                            key={`${item}-${index}`}
                            className="text-[10px] font-mono leading-relaxed text-nerv-text-secondary"
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
                        Signature Phrases
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedMentalModel.signaturePhrases.map((item) => (
                          <AtlasBadge key={item} label={item} variant="purple" />
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-[10px] font-mono text-nerv-text-muted">
                  Build a lens from one or more sources to see heuristics, workflow, decision rules,
                  and evidence preferences here.
                </div>
              )}
            </div>
          </AtlasPanel>
        </div>
      </div>
    </div>
  );
}
