'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NervBadge, NervPanel } from '../../components/nerv';
import type { ConnectorCapability, Investigation, QueryRefinement } from '../../lib/api';
import {
  createOrGetInvestigation,
  fetchCapabilities,
  fetchInvestigations,
  fetchQueryRefinement,
} from '../../lib/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// The platform picker is built from GET /capabilities at runtime \u2014 the server
// reports which connectors are actually registered and why any are down, so
// this list can never drift from reality (it once offered a disabled Reddit,
// hid four live connectors, and listed an unregistered Truth Social). The map
// below is PRESENTATION only: labels + grouping for known platform ids.
// Unknown ids reported by the server auto-surface with a default label.
const PLATFORM_META: Record<string, { label: string; group: string }> = {
  twitter: { label: 'Twitter / X', group: 'Social' },
  bluesky: { label: 'Bluesky', group: 'Social' },
  farcaster: { label: 'Farcaster', group: 'Social' },
  '4chan': { label: '4chan', group: 'Social' },
  reddit: { label: 'Reddit', group: 'Social' },
  truthsocial: { label: 'Truth Social', group: 'Social' },
  facebook: { label: 'Facebook', group: 'Social' },
  youtube: { label: 'YouTube', group: 'Media & Reference' },
  rss: { label: 'News + State Media Feeds', group: 'Media & Reference' },
  gdelt: { label: 'GDELT News Index', group: 'Media & Reference' },
  telegram: { label: 'Telegram OSINT', group: 'Media & Reference' },
  wikipedia: { label: 'Wikipedia', group: 'Media & Reference' },
  web: { label: 'Web Scraper', group: 'Media & Reference' },
};

const GROUP_ORDER = ['Social', 'Media & Reference', 'Other'];

interface PlatformOption {
  id: string;
  label: string;
  group: string;
  disabled: boolean;
  disabledReason?: string;
}

/** Fallback shown only if /capabilities is unreachable \u2014 matches the last
 *  known deployment state rather than aspiration. */
const FALLBACK_PLATFORMS: PlatformOption[] = [
  { id: 'twitter', label: 'Twitter / X', group: 'Social', disabled: false },
  { id: 'bluesky', label: 'Bluesky', group: 'Social', disabled: false },
  { id: 'farcaster', label: 'Farcaster', group: 'Social', disabled: false },
  { id: '4chan', label: '4chan', group: 'Social', disabled: false },
  { id: 'youtube', label: 'YouTube', group: 'Media & Reference', disabled: false },
  { id: 'rss', label: 'News + State Media Feeds', group: 'Media & Reference', disabled: false },
  { id: 'gdelt', label: 'GDELT News Index', group: 'Media & Reference', disabled: false },
  { id: 'telegram', label: 'Telegram OSINT', group: 'Media & Reference', disabled: false },
  { id: 'wikipedia', label: 'Wikipedia', group: 'Media & Reference', disabled: false },
];

function toPlatformOptions(connectors: ConnectorCapability[]): PlatformOption[] {
  return connectors.map((c) => {
    const meta = PLATFORM_META[c.platform];
    return {
      id: c.platform,
      label: meta?.label ?? c.platform.charAt(0).toUpperCase() + c.platform.slice(1),
      group: meta?.group ?? 'Other',
      disabled: c.status !== 'live',
      disabledReason: c.detail,
    };
  });
}

const TIME_RANGES = [
  { value: '24h', label: '24h' },
  { value: '3d', label: '3d' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
] as const;

const DEPTH_PRESETS = [
  { id: 'quick', label: 'Quick', limit: 25, description: 'Fast overview (~100 posts)' },
  { id: 'standard', label: 'Standard', limit: 100, description: 'Good coverage (~400 posts)' },
  { id: 'deep', label: 'Deep', limit: 250, description: 'Comprehensive (~1000 posts)' },
  {
    id: 'exhaustive',
    label: 'Exhaustive',
    limit: 500,
    description: 'Maximum coverage (~2000+ posts)',
  },
] as const;

// Honest tips only — the pipeline has no AND/OR/NOT/quote operators. Terms
// are matched implicitly: significant words extracted, stopwords dropped,
// posts must contain most of the remaining terms.
const TIPS = [
  'Vague topic? Hit REFINE — it grounds the query in live web results',
  '2–4 specific terms beat long sentences — filler words are dropped',
  'Posts must match most of your significant terms (all, if only 1–2)',
  'Person mode + @handle pulls account timelines across platforms',
  'A wallet/contract in Advanced triggers on-chain evidence lookup',
  'Sparse results? The workspace suggests a better time window',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SearchPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [caseMode, setCaseMode] = useState<'new' | 'existing'>('new');
  const [searchMode, setSearchMode] = useState<'topic' | 'claim' | 'person'>('topic');
  const [caseTitle, setCaseTitle] = useState('');
  const [query, setQuery] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([
    'twitter',
    'bluesky',
    'youtube',
    'rss',
    'farcaster',
  ]);
  const [timeRange, setTimeRange] = useState('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [usernames, setUsernames] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [wallets, setWallets] = useState('');
  const [subreddits, setSubreddits] = useState('');
  const [depthPreset, setDepthPreset] = useState<string>('standard');
  const limit = DEPTH_PRESETS.find((p) => p.id === depthPreset)?.limit ?? 100;
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [loadingInv, setLoadingInv] = useState(true);
  const [selectedInvestigationId, setSelectedInvestigationId] = useState<string>('');
  const [platformOptions, setPlatformOptions] = useState<PlatformOption[]>(FALLBACK_PLATFORMS);
  const [refining, setRefining] = useState(false);
  const [refinement, setRefinement] = useState<QueryRefinement | null>(null);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Build the platform picker from the server's runtime capability report.
  useEffect(() => {
    let cancelled = false;
    fetchCapabilities()
      .then((caps) => {
        if (cancelled) return;
        const options = toPlatformOptions(caps.connectors);
        setPlatformOptions(options);
        // Never leave a dead platform selected — its scans return nothing.
        const usable = new Set(options.filter((o) => !o.disabled).map((o) => o.id));
        setPlatforms((prev) => prev.filter((id) => usable.has(id)));
      })
      .catch(() => {
        // Fallback list already in place.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const platformGroups = GROUP_ORDER.map((group) => ({
    label: group,
    platforms: platformOptions
      .filter((p) => p.group === group)
      // Live connectors first; offline ones sink with their reason.
      .sort((a, b) => Number(a.disabled) - Number(b.disabled)),
  })).filter((g) => g.platforms.length > 0);

  // Load recent investigations
  useEffect(() => {
    let cancelled = false;
    fetchInvestigations()
      .then((data) => {
        if (!cancelled) setInvestigations(data.slice(0, 8));
      })
      .catch(() => {
        if (!cancelled) setInvestigations([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingInv(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePlatform = useCallback((id: string) => {
    setPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }, []);

  // Vague-query rescue: ground the topic in live web results and let the user
  // PICK a sharper query. Deliberately never applied silently — we don't scan
  // something different from what was typed without the user choosing it.
  const handleRefine = useCallback(async () => {
    const q = query.trim();
    if (!q || refining) return;
    setRefining(true);
    setRefinement(null);
    try {
      setRefinement(await fetchQueryRefinement(q));
    } catch {
      setRefinement({
        query: q,
        interpretation: null,
        refinedQueries: [],
        entities: [],
        analysisMode: 'unavailable',
        results: [],
      });
    } finally {
      setRefining(false);
    }
  }, [query, refining]);

  const handleScan = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    const trimmedCaseTitle = caseTitle.trim();
    const resolvedInvestigationId = selectedInvestigationId.trim();

    // Build URL params for the investigation workspace
    const params = new URLSearchParams({ q });
    params.set('mode', searchMode);
    if (platforms.length > 0) params.set('platforms', platforms.join(','));
    if (limit !== 100) params.set('limit', String(limit));
    if (timeRange === 'custom' && customStart && customEnd) {
      params.set('timeRange', `${customStart}_${customEnd}`);
    } else {
      params.set('timeRange', timeRange);
    }
    const trimmedUsernames = usernames.trim();
    const trimmedHashtags = hashtags.trim();
    const trimmedWallets = wallets.trim();
    const trimmedSubreddits = subreddits.trim();
    if (trimmedUsernames) params.set('usernames', trimmedUsernames);
    if (trimmedHashtags) params.set('hashtags', trimmedHashtags);
    if (trimmedWallets) params.set('wallets', trimmedWallets);
    if (trimmedSubreddits) params.set('subreddits', trimmedSubreddits);
    params.set('fresh', '1');

    // Start from an existing case or create a new one with an explicit title
    try {
      if (caseMode === 'existing' && resolvedInvestigationId) {
        params.set('inv', resolvedInvestigationId);
        router.push(`/investigate/${resolvedInvestigationId}?${params.toString()}`);
        return;
      }

      const inv = await createOrGetInvestigation(q, {
        name:
          trimmedCaseTitle ||
          (searchMode === 'person' ? `User: @${q.replace(/^@+/, '')}` : undefined),
        platforms: platforms.length > 0 ? platforms : undefined,
        timeRange: timeRange === 'custom' ? `${customStart}_${customEnd}` : timeRange,
        limit,
        searchMode,
      });
      const investigationId = inv._id ?? inv.id;
      if (!investigationId) {
        throw new Error('Investigation creation returned no id');
      }
      router.push(`/investigate/${investigationId}?${params.toString()}`);
    } catch {
      // Fallback to results page if investigation creation fails
      router.push(`/results?${params.toString()}`);
    }
  }, [
    query,
    caseTitle,
    caseMode,
    selectedInvestigationId,
    platforms,
    limit,
    timeRange,
    customStart,
    customEnd,
    usernames,
    hashtags,
    wallets,
    subreddits,
    router,
    searchMode,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleScan();
  };

  return (
    <div className="min-h-[calc(100vh-49px)] overflow-y-auto px-6 py-6">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-start gap-4 xl:grid-cols-[1fr_360px]">
      {/* ── SCAN PANEL ── */}
      <div className="w-full">
        <NervPanel title="Initiate Scan" accent="orange" status="online">
          <div className="p-4 space-y-4">
            <div className="space-y-3 border border-nerv-border/50 rounded-sm p-3 bg-nerv-bg-panel/30">
              <div className="flex items-center gap-2">
                {[
                  { id: 'new', label: 'New Case' },
                  { id: 'existing', label: 'Existing Case' },
                ].map((mode) => {
                  const selected = caseMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setCaseMode(mode.id as 'new' | 'existing')}
                      className={[
                        'px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest border rounded-sm transition-all',
                        selected
                          ? 'border-nerv-orange/60 text-nerv-orange bg-nerv-orange/10'
                          : 'border-nerv-border text-nerv-text-muted hover:text-nerv-text hover:border-nerv-text-muted',
                      ].join(' ')}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>

              {caseMode === 'new' ? (
                <div>
                  <label
                    htmlFor="case-title"
                    className="text-[12px] uppercase tracking-[0.15em] text-nerv-text-muted font-display block mb-1.5"
                  >
                    Case Title
                  </label>
                  <input
                    id="case-title"
                    type="text"
                    value={caseTitle}
                    onChange={(e) => setCaseTitle(e.target.value)}
                    placeholder="Pipeline Sabotage Narrative Tracking"
                    className="w-full px-3 py-2.5 font-mono text-sm bg-nerv-bg border border-nerv-border text-nerv-text placeholder:text-nerv-text-muted focus:outline-none focus:border-nerv-orange/50 transition-all"
                  />
                  <span className="block mt-1 text-[10px] font-mono text-nerv-text-muted">
                    Case title for the investigation container. The query below is just the first
                    scan inside that case.
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <label
                      htmlFor="target-case"
                      className="text-[12px] uppercase tracking-[0.15em] text-nerv-text-muted font-display block mb-1.5"
                    >
                      Target Case
                    </label>
                    <select
                      id="target-case"
                      value={selectedInvestigationId}
                      onChange={(e) => setSelectedInvestigationId(e.target.value)}
                      className="w-full px-3 py-2.5 font-mono text-sm bg-nerv-bg border border-nerv-border text-nerv-text focus:outline-none focus:border-nerv-blue/50 transition-all"
                    >
                      <option value="">Select investigation...</option>
                      {investigations.map((inv) => {
                        const investigationId = inv._id ?? inv.id ?? '';
                        return (
                          <option key={investigationId || inv.query} value={investigationId}>
                            {inv.name || inv.query}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  {selectedInvestigationId && (
                    <div className="flex flex-wrap gap-1">
                      {investigations
                        .filter((inv) => (inv._id ?? inv.id) === selectedInvestigationId)
                        .slice(0, 1)
                        .map((inv) => (
                          <NervBadge
                            key={selectedInvestigationId}
                            label={`APPEND TO ${(inv.name || inv.query).toUpperCase().slice(0, 28)}`}
                            variant="blue"
                            size="sm"
                          />
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Query row */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                {[
                  { id: 'topic', label: 'Topic Search', hint: 'Campaign or entity discovery' },
                  {
                    id: 'claim',
                    label: 'Claim Search',
                    hint: 'Anchored allegation or factual claim',
                  },
                  {
                    id: 'person',
                    label: 'Person Search',
                    hint: "Pull a user's timeline across platforms",
                  },
                ].map((mode) => {
                  const selected = searchMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        const next = mode.id as 'topic' | 'claim' | 'person';
                        setSearchMode(next);
                        // Person mode defaults to a tight 3d window; user can extend later
                        if (next === 'person') setTimeRange('3d');
                      }}
                      className={[
                        'px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest border rounded-sm transition-all',
                        selected
                          ? 'border-nerv-blue/60 text-nerv-blue bg-nerv-blue/10'
                          : 'border-nerv-border text-nerv-text-muted hover:text-nerv-text hover:border-nerv-text-muted',
                      ].join(' ')}
                      title={mode.hint}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
              <label
                htmlFor="scan-query"
                className="text-[12px] uppercase tracking-[0.15em] text-nerv-text-muted font-display block mb-1.5"
              >
                {searchMode === 'claim'
                  ? 'Claim Query'
                  : searchMode === 'person'
                    ? 'Target Username'
                    : 'Scan Query'}
              </label>
              <div className="flex gap-2">
                <input
                  id="scan-query"
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    searchMode === 'claim'
                      ? 'Enter a factual claim or allegation...'
                      : searchMode === 'person'
                        ? '@handle or username'
                        : 'Enter narrative topic...'
                  }
                  className="flex-1 px-3 py-2.5 font-mono text-sm bg-nerv-bg border border-nerv-border text-nerv-green placeholder:text-nerv-text-muted focus:outline-none focus:border-nerv-green/50 focus:shadow-[0_0_8px_rgba(0,255,65,0.15)] transition-all"
                />
                <button
                  type="button"
                  onClick={handleRefine}
                  disabled={!query.trim() || refining}
                  title="Ground a vague topic in live web results and get sharper query suggestions"
                  className="px-4 py-2.5 border border-nerv-blue/40 text-nerv-blue text-[12px] font-mono uppercase tracking-widest hover:bg-nerv-blue/10 hover:border-nerv-blue/70 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  {refining ? 'Refining…' : 'Refine'}
                </button>
                <button
                  type="button"
                  onClick={handleScan}
                  disabled={!query.trim() || (caseMode === 'existing' && !selectedInvestigationId)}
                  className="px-6 py-2.5 bg-nerv-orange/20 border border-nerv-orange/50 text-nerv-orange text-[13px] font-mono uppercase tracking-widest hover:bg-nerv-orange/30 hover:border-nerv-orange disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  {caseMode === 'existing'
                    ? 'Append Scan'
                    : searchMode === 'person'
                      ? 'Investigate User'
                      : 'Create Case'}
                </button>
              </div>
              <div className="mt-1 text-[10px] font-mono text-nerv-text-muted">
                {searchMode === 'claim'
                  ? 'Claim mode prioritizes anchors, event terms, and stricter post matching.'
                  : searchMode === 'person'
                    ? "Pulls the user's recent timeline across every connector that supports per-user fetches. Starts narrow (3d) — extend depth from the results page."
                    : 'Topic mode is broader and better for campaign or entity discovery.'}
              </div>

              {/* Refinement results — suggestions only; the user picks, we never
                  silently scan something different from what they typed */}
              {refinement && (
                <div className="mt-3 border border-nerv-blue/30 rounded-sm bg-nerv-blue/5 p-3 space-y-2">
                  {refinement.interpretation ? (
                    <>
                      <p className="text-[12px] font-mono text-nerv-text-secondary leading-snug">
                        <span className="text-nerv-blue uppercase tracking-wider text-[10px] mr-2">
                          Reads as
                        </span>
                        {refinement.interpretation}
                      </p>
                      {refinement.refinedQueries.length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-wider text-nerv-text-muted mb-1">
                            Sharper queries — click to use
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {refinement.refinedQueries.map((rq) => (
                              <button
                                key={rq}
                                type="button"
                                onClick={() => {
                                  setQuery(rq);
                                  inputRef.current?.focus();
                                }}
                                className="px-2 py-1 text-[12px] font-mono border border-nerv-green/40 text-nerv-green rounded-sm hover:bg-nerv-green/10 transition-colors"
                              >
                                {rq}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {refinement.entities.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-nerv-text-muted">
                            Entities
                          </span>
                          {refinement.entities.map((en) => (
                            <span
                              key={en}
                              className="px-1.5 py-0.5 text-[11px] font-mono border border-nerv-border text-nerv-text-secondary rounded-sm"
                            >
                              {en}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-[12px] font-mono text-nerv-text-muted leading-snug">
                      {refinement.results.length > 0
                        ? 'Refinement needs the LLM (GEMINI_API_KEY) — raw web context found, but no query suggestions were generated.'
                        : 'No web context found for this topic — try different wording.'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Advanced toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-[11px] font-mono uppercase tracking-widest text-nerv-text-muted hover:text-nerv-text-secondary transition-colors"
            >
              {showAdvanced ? '\u25B4' : '\u25BE'} Advanced Filters
            </button>

            {/* Advanced filters */}
            {showAdvanced && (
              <div className="grid grid-cols-2 gap-3 p-3 border border-nerv-border/50 rounded-sm bg-nerv-bg-panel/30">
                <div>
                  <label
                    htmlFor="advanced-usernames"
                    className="text-[11px] uppercase tracking-widest text-nerv-text-muted block mb-1"
                  >
                    Usernames
                  </label>
                  <input
                    id="advanced-usernames"
                    type="text"
                    value={usernames}
                    onChange={(e) => setUsernames(e.target.value)}
                    placeholder="@handle1, @handle2"
                    className="w-full px-2 py-1.5 text-xs font-mono bg-nerv-bg border border-nerv-border text-nerv-text placeholder:text-nerv-text-muted/50 focus:outline-none focus:border-nerv-blue/50 transition-all"
                  />
                  <span className="text-[10px] font-mono text-nerv-text-muted">
                    Fetch timelines for these users
                  </span>
                </div>
                <div>
                  <label
                    htmlFor="advanced-hashtags"
                    className="text-[11px] uppercase tracking-widest text-nerv-text-muted block mb-1"
                  >
                    Hashtags
                  </label>
                  <input
                    id="advanced-hashtags"
                    type="text"
                    value={hashtags}
                    onChange={(e) => setHashtags(e.target.value)}
                    placeholder="#tag1, #tag2"
                    className="w-full px-2 py-1.5 text-xs font-mono bg-nerv-bg border border-nerv-border text-nerv-text placeholder:text-nerv-text-muted/50 focus:outline-none focus:border-nerv-blue/50 transition-all"
                  />
                  <span className="text-[10px] font-mono text-nerv-text-muted">
                    Add to search terms
                  </span>
                </div>
                <div>
                  <label
                    htmlFor="advanced-wallets"
                    className="text-[11px] uppercase tracking-widest text-nerv-text-muted block mb-1"
                  >
                    Wallet / Contract
                  </label>
                  <input
                    id="advanced-wallets"
                    type="text"
                    value={wallets}
                    onChange={(e) => setWallets(e.target.value)}
                    placeholder="0x1234... or contract address"
                    className="w-full px-2 py-1.5 text-xs font-mono bg-nerv-bg border border-nerv-border text-nerv-text placeholder:text-nerv-text-muted/50 focus:outline-none focus:border-nerv-blue/50 transition-all"
                  />
                  <span className="text-[10px] font-mono text-nerv-text-muted">
                    Triggers on-chain evidence lookup
                  </span>
                </div>
                <div>
                  <label
                    htmlFor="advanced-subreddits"
                    className="text-[11px] uppercase tracking-widest text-nerv-text-muted block mb-1"
                  >
                    Subreddits
                  </label>
                  <input
                    id="advanced-subreddits"
                    type="text"
                    value={subreddits}
                    onChange={(e) => setSubreddits(e.target.value)}
                    placeholder="r/cryptocurrency, r/bitcoin"
                    className="w-full px-2 py-1.5 text-xs font-mono bg-nerv-bg border border-nerv-border text-nerv-text placeholder:text-nerv-text-muted/50 focus:outline-none focus:border-nerv-blue/50 transition-all"
                  />
                  <span className="text-[10px] font-mono text-nerv-text-muted">
                    Scope Reddit search (offline until Reddit credentials are added)
                  </span>
                </div>
              </div>
            )}

            {/* Options row */}
            <div className="grid grid-cols-3 gap-4">
              {/* Data Sources */}
              <div>
                <div className="text-[12px] uppercase tracking-[0.15em] text-nerv-text-muted font-display block mb-2">
                  Data Sources
                </div>
                <div className="space-y-3">
                  {platformGroups.map((group) => (
                    <div key={group.label}>
                      <div className="text-[10px] uppercase tracking-widest text-nerv-text-muted mb-1">
                        {group.label}
                      </div>
                      <div className="space-y-1">
                        {group.platforms.map((p) => {
                          const checked = platforms.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              disabled={p.disabled}
                              title={
                                p.disabled
                                  ? `Unavailable \u2014 ${p.disabledReason ?? 'connector offline'}`
                                  : undefined
                              }
                              className={[
                                'flex items-center gap-2 group',
                                p.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
                              ].join(' ')}
                              onClick={p.disabled ? undefined : () => togglePlatform(p.id)}
                            >
                              <span
                                className={[
                                  'w-3.5 h-3.5 border flex items-center justify-center text-[10px] font-mono transition-all',
                                  checked
                                    ? 'border-nerv-green bg-nerv-green/15 text-nerv-green'
                                    : 'border-nerv-border text-transparent',
                                  !p.disabled && !checked ? 'hover:border-nerv-text-muted' : '',
                                ].join(' ')}
                              >
                                {checked ? '\u2713' : ''}
                              </span>
                              <span
                                className={[
                                  'text-[13px] font-mono transition-colors',
                                  checked ? 'text-nerv-text' : 'text-nerv-text-muted',
                                ].join(' ')}
                              >
                                {p.label}
                                {p.disabled && (
                                  <span className="ml-1.5 text-[9px] uppercase tracking-wider text-nerv-text-muted/70">
                                    offline
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setPlatforms(platformOptions.filter((p) => !p.disabled).map((p) => p.id))
                      }
                      className="text-[10px] font-mono uppercase text-nerv-green hover:underline"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlatforms([])}
                      className="text-[10px] font-mono uppercase text-nerv-text-muted hover:underline"
                    >
                      None
                    </button>
                  </div>
                </div>
              </div>

              {/* Time Range */}
              <div>
                <div className="text-[12px] uppercase tracking-[0.15em] text-nerv-text-muted font-display block mb-2">
                  Time Range
                </div>
                <div className="space-y-1.5">
                  {[...TIME_RANGES, { value: 'custom' as const, label: 'Custom' }].map((t) => {
                    const selected = timeRange === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => setTimeRange(t.value)}
                      >
                        <span
                          className={[
                            'w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all',
                            selected
                              ? 'border-nerv-orange'
                              : 'border-nerv-border hover:border-nerv-text-muted',
                          ].join(' ')}
                        >
                          {selected && <span className="w-1.5 h-1.5 rounded-full bg-nerv-orange" />}
                        </span>
                        <span
                          className={[
                            'text-xs font-mono transition-colors',
                            selected ? 'text-nerv-orange' : 'text-nerv-text-muted',
                          ].join(' ')}
                        >
                          {t.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {timeRange === 'custom' && (
                  <div className="mt-2 space-y-1.5 pl-5">
                    <div>
                      <label
                        htmlFor="custom-start-date"
                        className="text-[10px] uppercase tracking-widest text-nerv-text-muted block mb-0.5"
                      >
                        From
                      </label>
                      <input
                        id="custom-start-date"
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="w-full px-2 py-1 text-xs font-mono bg-nerv-bg border border-nerv-border text-nerv-text focus:outline-none focus:border-nerv-orange/50 transition-all"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="custom-end-date"
                        className="text-[10px] uppercase tracking-widest text-nerv-text-muted block mb-0.5"
                      >
                        To
                      </label>
                      <input
                        id="custom-end-date"
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="w-full px-2 py-1 text-xs font-mono bg-nerv-bg border border-nerv-border text-nerv-text focus:outline-none focus:border-nerv-orange/50 transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Depth */}
              <div>
                <div className="text-[12px] uppercase tracking-[0.15em] text-nerv-text-muted font-display block mb-2">
                  Depth
                </div>
                <div className="space-y-1.5">
                  {DEPTH_PRESETS.map((preset) => {
                    const selected = depthPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => setDepthPreset(preset.id)}
                      >
                        <span
                          className={[
                            'w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all',
                            selected
                              ? 'border-nerv-orange'
                              : 'border-nerv-border hover:border-nerv-text-muted',
                          ].join(' ')}
                        >
                          {selected && <span className="w-1.5 h-1.5 rounded-full bg-nerv-orange" />}
                        </span>
                        <div className="flex flex-col">
                          <span
                            className={[
                              'text-xs font-mono transition-colors leading-tight',
                              selected ? 'text-nerv-orange' : 'text-nerv-text-muted',
                            ].join(' ')}
                          >
                            {preset.label}
                          </span>
                          <span className="text-[10px] font-mono text-nerv-text-muted leading-tight">
                            {preset.description}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </NervPanel>
      </div>

      {/* ── RIGHT RAIL: Recent + Tips ── */}
      <div className="flex w-full flex-col gap-4 pb-8">
        {/* Recent Investigations */}
        <div>
          <NervPanel title="Recent Investigations" accent="blue" corners>
            <div className="divide-y divide-nerv-border">
              {loadingInv ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-3 text-nerv-text-muted">
                    <div className="w-4 h-4 border-2 border-nerv-border border-t-nerv-blue rounded-full animate-spin" />
                    <span className="text-[12px] font-mono uppercase tracking-widest">
                      Loading...
                    </span>
                  </div>
                </div>
              ) : investigations.length === 0 ? (
                <div className="px-3 py-6 text-center">
                  <span className="text-[12px] font-mono text-nerv-text-muted uppercase tracking-widest">
                    No previous investigations
                  </span>
                </div>
              ) : (
                investigations.map((inv) => (
                  <button
                    key={inv._id ?? inv.id ?? inv.query}
                    type="button"
                    onClick={() => {
                      const investigationId = inv._id ?? inv.id;
                      if (!investigationId) return;
                      setCaseMode('existing');
                      setSelectedInvestigationId(investigationId);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-nerv-bg-elevated/30 transition-colors group"
                  >
                    <span className="text-xs font-mono text-nerv-text truncate mr-3">
                      {inv.name || inv.query}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[12px] font-mono text-nerv-text-muted">
                        {formatDate(inv.updatedAt)}
                      </span>
                      <span className="text-[12px] font-mono text-nerv-orange opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest">
                        Use
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </NervPanel>
        </div>

        {/* Quick Tips */}
        <div>
          <NervPanel title="Quick Tips" accent="green" corners>
            <div className="px-3 py-2 space-y-2">
              {TIPS.map((tip) => (
                <div key={tip} className="flex items-start gap-2">
                  <span className="text-nerv-green text-[12px] mt-0.5 shrink-0">&gt;</span>
                  <span className="text-[13px] font-mono text-nerv-text-secondary leading-snug">
                    {tip}
                  </span>
                </div>
              ))}
            </div>
          </NervPanel>
        </div>
      </div>
      </div>
    </div>
  );
}
