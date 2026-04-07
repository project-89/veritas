'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NervBadge, NervPanel } from '../../components/nerv';
import type { Investigation } from '../../lib/api';
import { fetchInvestigations, createOrGetInvestigation } from '../../lib/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORM_GROUPS = [
  {
    label: 'Social',
    platforms: [
      { id: 'twitter', label: 'Twitter / X', icon: '\u{1D54F}' },
      { id: 'reddit', label: 'Reddit', icon: 'R' },
      { id: 'farcaster', label: 'Farcaster', icon: 'FC' },
      { id: 'truthsocial', label: 'Truth Social', icon: 'TS' },
    ],
  },
  {
    label: 'Media',
    platforms: [
      { id: 'youtube', label: 'YouTube', icon: '\u25B6' },
      { id: 'rss', label: 'News Feeds (177)', icon: '\u{1F4F0}' },
      { id: 'telegram', label: 'Telegram OSINT', icon: '\u2708' },
    ],
  },
];

const ALL_PLATFORMS = PLATFORM_GROUPS.flatMap((g) => g.platforms);

const TIME_RANGES = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
] as const;

const DEPTH_PRESETS = [
  { id: 'quick', label: 'Quick', limit: 25, description: 'Fast overview (~100 posts)' },
  { id: 'standard', label: 'Standard', limit: 100, description: 'Good coverage (~400 posts)' },
  { id: 'deep', label: 'Deep', limit: 250, description: 'Comprehensive (~1000 posts)' },
  { id: 'exhaustive', label: 'Exhaustive', limit: 500, description: 'Maximum coverage (~2000+ posts)' },
] as const;

const TIPS = [
  'Use quotes for exact phrases',
  '@handle to include specific accounts',
  'Combine topics with AND / OR',
  'Prefix with NOT to exclude terms',
  'Try broad topics first, then narrow',
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
  const [caseTitle, setCaseTitle] = useState('');
  const [query, setQuery] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['twitter', 'reddit', 'youtube', 'rss', 'farcaster']);
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

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load recent investigations
  useEffect(() => {
    let cancelled = false;
    fetchInvestigations()
      .then((data) => { if (!cancelled) setInvestigations(data.slice(0, 8)); })
      .catch(() => { if (!cancelled) setInvestigations([]); })
      .finally(() => { if (!cancelled) setLoadingInv(false); });
    return () => { cancelled = true; };
  }, []);

  const togglePlatform = useCallback((id: string) => {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  const handleScan = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    const trimmedCaseTitle = caseTitle.trim();
    const resolvedInvestigationId = selectedInvestigationId.trim();

    // Build URL params for the investigation workspace
    const params = new URLSearchParams({ q });
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
        name: trimmedCaseTitle || undefined,
        platforms: platforms.length > 0 ? platforms : undefined,
        timeRange: timeRange === 'custom' ? `${customStart}_${customEnd}` : timeRange,
        limit,
      });
      const investigationId = inv._id ?? inv.id;
      router.push(`/investigate/${investigationId}?${params.toString()}`);
    } catch {
      // Fallback to results page if investigation creation fails
      router.push(`/results?${params.toString()}`);
    }
  }, [query, caseTitle, caseMode, selectedInvestigationId, platforms, limit, timeRange, customStart, customEnd, usernames, hashtags, wallets, subreddits, router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleScan();
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col items-center justify-start px-4 pt-[8vh] overflow-y-auto">
      {/* ── SCAN PANEL ── */}
      <div className="w-full max-w-3xl">
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
                      onClick={() => setCaseMode(mode.id as 'new' | 'existing')}
                      className={[
                        'px-3 py-1.5 text-[9px] font-mono uppercase tracking-widest border rounded-sm transition-all',
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
                  <label className="text-[10px] uppercase tracking-[0.15em] text-nerv-text-muted font-display block mb-1.5">
                    Case Title
                  </label>
                  <input
                    type="text"
                    value={caseTitle}
                    onChange={(e) => setCaseTitle(e.target.value)}
                    placeholder="Rexas Finance Scam Investigation"
                    className="w-full px-3 py-2.5 font-mono text-sm bg-nerv-bg border border-nerv-border text-nerv-text placeholder:text-nerv-text-muted focus:outline-none focus:border-nerv-orange/50 transition-all"
                  />
                  <span className="block mt-1 text-[8px] font-mono text-nerv-text-muted">
                    Case title for the investigation container. The query below is just the first scan inside that case.
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.15em] text-nerv-text-muted font-display block mb-1.5">
                      Target Case
                    </label>
                    <select
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
              <label className="text-[10px] uppercase tracking-[0.15em] text-nerv-text-muted font-display block mb-1.5">
                Scan Query
              </label>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter narrative topic..."
                  className="flex-1 px-3 py-2.5 font-mono text-sm bg-nerv-bg border border-nerv-border text-nerv-green placeholder:text-nerv-text-muted focus:outline-none focus:border-nerv-green/50 focus:shadow-[0_0_8px_rgba(0,255,65,0.15)] transition-all"
                />
                <button
                  onClick={handleScan}
                  disabled={!query.trim() || (caseMode === 'existing' && !selectedInvestigationId)}
                  className="px-6 py-2.5 bg-nerv-orange/20 border border-nerv-orange/50 text-nerv-orange text-[11px] font-mono uppercase tracking-widest hover:bg-nerv-orange/30 hover:border-nerv-orange disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  {caseMode === 'existing' ? 'Append Scan' : 'Create Case'}
                </button>
              </div>
            </div>

            {/* Advanced toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted hover:text-nerv-text-secondary transition-colors"
            >
              {showAdvanced ? '\u25B4' : '\u25BE'} Advanced Filters
            </button>

            {/* Advanced filters */}
            {showAdvanced && (
              <div className="grid grid-cols-2 gap-3 p-3 border border-nerv-border/50 rounded-sm bg-nerv-bg-panel/30">
                <div>
                  <label className="text-[9px] uppercase tracking-widest text-nerv-text-muted block mb-1">
                    Usernames
                  </label>
                  <input
                    type="text"
                    value={usernames}
                    onChange={(e) => setUsernames(e.target.value)}
                    placeholder="@handle1, @handle2"
                    className="w-full px-2 py-1.5 text-xs font-mono bg-nerv-bg border border-nerv-border text-nerv-text placeholder:text-nerv-text-muted/50 focus:outline-none focus:border-nerv-blue/50 transition-all"
                  />
                  <span className="text-[7px] font-mono text-nerv-text-muted">Fetch timelines for these users</span>
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-widest text-nerv-text-muted block mb-1">
                    Hashtags
                  </label>
                  <input
                    type="text"
                    value={hashtags}
                    onChange={(e) => setHashtags(e.target.value)}
                    placeholder="#tag1, #tag2"
                    className="w-full px-2 py-1.5 text-xs font-mono bg-nerv-bg border border-nerv-border text-nerv-text placeholder:text-nerv-text-muted/50 focus:outline-none focus:border-nerv-blue/50 transition-all"
                  />
                  <span className="text-[7px] font-mono text-nerv-text-muted">Add to search terms</span>
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-widest text-nerv-text-muted block mb-1">
                    Wallet / Contract
                  </label>
                  <input
                    type="text"
                    value={wallets}
                    onChange={(e) => setWallets(e.target.value)}
                    placeholder="0x1234... or contract address"
                    className="w-full px-2 py-1.5 text-xs font-mono bg-nerv-bg border border-nerv-border text-nerv-text placeholder:text-nerv-text-muted/50 focus:outline-none focus:border-nerv-blue/50 transition-all"
                  />
                  <span className="text-[7px] font-mono text-nerv-text-muted">Triggers on-chain evidence lookup</span>
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-widest text-nerv-text-muted block mb-1">
                    Subreddits
                  </label>
                  <input
                    type="text"
                    value={subreddits}
                    onChange={(e) => setSubreddits(e.target.value)}
                    placeholder="r/cryptocurrency, r/bitcoin"
                    className="w-full px-2 py-1.5 text-xs font-mono bg-nerv-bg border border-nerv-border text-nerv-text placeholder:text-nerv-text-muted/50 focus:outline-none focus:border-nerv-blue/50 transition-all"
                  />
                  <span className="text-[7px] font-mono text-nerv-text-muted">Scope Reddit search to specific subs</span>
                </div>
              </div>
            )}

            {/* Options row */}
            <div className="grid grid-cols-3 gap-4">
              {/* Data Sources */}
              <div>
                <label className="text-[10px] uppercase tracking-[0.15em] text-nerv-text-muted font-display block mb-2">
                  Data Sources
                </label>
                <div className="space-y-3">
                  {PLATFORM_GROUPS.map((group) => (
                    <div key={group.label}>
                      <div className="text-[8px] uppercase tracking-widest text-nerv-text-muted mb-1">
                        {group.label}
                      </div>
                      <div className="space-y-1">
                        {group.platforms.map((p) => {
                          const checked = platforms.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className="flex items-center gap-2 cursor-pointer group"
                              onClick={() => togglePlatform(p.id)}
                            >
                              <span
                                className={[
                                  'w-3.5 h-3.5 border flex items-center justify-center text-[8px] font-mono transition-all',
                                  checked
                                    ? 'border-nerv-green bg-nerv-green/15 text-nerv-green'
                                    : 'border-nerv-border text-transparent hover:border-nerv-text-muted',
                                ].join(' ')}
                              >
                                {checked ? '\u2713' : ''}
                              </span>
                              <span
                                className={[
                                  'text-[11px] font-mono transition-colors',
                                  checked ? 'text-nerv-text' : 'text-nerv-text-muted',
                                ].join(' ')}
                              >
                                {p.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setPlatforms(ALL_PLATFORMS.map((p) => p.id))}
                      className="text-[8px] font-mono uppercase text-nerv-green hover:underline"
                    >
                      All
                    </button>
                    <button
                      onClick={() => setPlatforms([])}
                      className="text-[8px] font-mono uppercase text-nerv-text-muted hover:underline"
                    >
                      None
                    </button>
                  </div>
                </div>
              </div>

              {/* Time Range */}
              <div>
                <label className="text-[10px] uppercase tracking-[0.15em] text-nerv-text-muted font-display block mb-2">
                  Time Range
                </label>
                <div className="space-y-1.5">
                  {[...TIME_RANGES, { value: 'custom' as const, label: 'Custom' }].map((t) => {
                    const selected = timeRange === t.value;
                    return (
                      <label
                        key={t.value}
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
                          {selected && (
                            <span className="w-1.5 h-1.5 rounded-full bg-nerv-orange" />
                          )}
                        </span>
                        <span
                          className={[
                            'text-xs font-mono transition-colors',
                            selected ? 'text-nerv-orange' : 'text-nerv-text-muted',
                          ].join(' ')}
                        >
                          {t.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {timeRange === 'custom' && (
                  <div className="mt-2 space-y-1.5 pl-5">
                    <div>
                      <label className="text-[8px] uppercase tracking-widest text-nerv-text-muted block mb-0.5">From</label>
                      <input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="w-full px-2 py-1 text-xs font-mono bg-nerv-bg border border-nerv-border text-nerv-text focus:outline-none focus:border-nerv-orange/50 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] uppercase tracking-widest text-nerv-text-muted block mb-0.5">To</label>
                      <input
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
                <label className="text-[10px] uppercase tracking-[0.15em] text-nerv-text-muted font-display block mb-2">
                  Depth
                </label>
                <div className="space-y-1.5">
                  {DEPTH_PRESETS.map((preset) => {
                    const selected = depthPreset === preset.id;
                    return (
                      <label
                        key={preset.id}
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
                          {selected && (
                            <span className="w-1.5 h-1.5 rounded-full bg-nerv-orange" />
                          )}
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
                          <span className="text-[8px] font-mono text-nerv-text-muted leading-tight">
                            {preset.description}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </NervPanel>
      </div>

      {/* ── BOTTOM ROW: Recent + Tips ── */}
      <div className="w-full max-w-3xl mt-4 grid grid-cols-5 gap-4 pb-8">
        {/* Recent Investigations */}
        <div className="col-span-3">
          <NervPanel title="Recent Investigations" accent="blue" corners>
            <div className="divide-y divide-nerv-border">
              {loadingInv ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-3 text-nerv-text-muted">
                    <div className="w-4 h-4 border-2 border-nerv-border border-t-nerv-blue rounded-full animate-spin" />
                    <span className="text-[10px] font-mono uppercase tracking-widest">
                      Loading...
                    </span>
                  </div>
                </div>
              ) : investigations.length === 0 ? (
                <div className="px-3 py-6 text-center">
                  <span className="text-[10px] font-mono text-nerv-text-muted uppercase tracking-widest">
                    No previous investigations
                  </span>
                </div>
              ) : (
                investigations.map((inv) => (
                  <button
                    key={inv._id ?? inv.id ?? inv.query}
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
                      <span className="text-[10px] font-mono text-nerv-text-muted">
                        {formatDate(inv.updatedAt)}
                      </span>
                      <span className="text-[10px] font-mono text-nerv-orange opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest">
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
        <div className="col-span-2">
          <NervPanel title="Quick Tips" accent="green" corners>
            <div className="px-3 py-2 space-y-2">
              {TIPS.map((tip) => (
                <div key={tip} className="flex items-start gap-2">
                  <span className="text-nerv-green text-[10px] mt-0.5 shrink-0">
                    &gt;
                  </span>
                  <span className="text-[11px] font-mono text-nerv-text-secondary leading-snug">
                    {tip}
                  </span>
                </div>
              ))}
            </div>
          </NervPanel>
        </div>
      </div>
    </div>
  );
}
