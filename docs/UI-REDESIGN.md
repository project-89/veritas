# UI Redesign: Monitor Mode + Investigation Mode

## Problem

The current UI was designed for browsing narratives and looking at charts. But the system has evolved into a full intelligence platform with:
- 7 social connectors + 177 RSS feeds + 8 signal adapters + 5 evidence adapters
- Persistent identity records with psychological profiling
- 3-tier social graph intelligence
- Evidence-based claim verification with investigative leads
- Cross-investigation accumulation of relationship data

The single `/results` page tries to do everything: browse narratives, investigate actors, verify claims, view evidence, compare platforms. It treats each scan as isolated, losing investigation context on navigation.

**The fundamental shift:** The UI was built for analysts browsing data, but the system now supports analysts conducting investigations. Those are different workflows.

## Solution: Two Modes

### Monitor Mode (`/monitor`)
**Purpose:** Passive surveillance — watch the landscape, spot emerging threats, track ongoing narratives.

**Layout:**
- Top bar: key metrics (active investigations, narratives detected, alerts in 24h, platform health)
- Left panel: investigation list with alert badges, status indicators
- Center panel: temporal heatmap showing all active investigations or selected investigation
- Right panel: alert feed with severity filtering, mark-read
- Bottom: NervTicker with latest alerts

**Interactions:**
- Click narrative → lightweight summary flyout (not full detail panel)
- Click "INVESTIGATE" → navigate to Investigation Mode
- Auto-refresh integration (from existing monitor config)
- Quick scan trigger for new topics

### Investigation Mode (`/investigate/[id]`)
**Purpose:** Focused deep-dive into a specific narrative, actor, or claim. Building a case with evidence.

**Layout:** Same 3-panel layout as current results page, but:
- Investigation target clearly displayed in header (the narrative/query being investigated)
- Breadcrumb: `MONITOR > [Investigation Name]`
- 12 visualization modes (temporal, actors, claims, effects, globe, entities, genealogy, flow, evidence, graph, radar, platforms)
- Session state persists to MongoDB — come back and your investigation is where you left it

**Key difference from current:** Scoped to one investigation by MongoDB `_id`, not query params. Stable URLs, bookmarkable, session-persistent.

## Route Structure

```
Before:
  /          → Command center (investigations + alerts)
  /search    → Scan initiation
  /results   → Everything (query-param driven, fragile)
  /monitor   → Alert scheduling only

After:
  /          → Command center (redirects to /monitor or landing)
  /search    → Scan initiation → creates investigation → redirects to /investigate/:id
  /monitor   → Full Monitor Mode workspace
  /investigate/[id] → Investigation Mode workspace (replaces /results)
```

## Data Flow Changes

### Search → Investigation
Before: `/search` → `/results?q=query&fresh=1` (query-param driven)
After: `/search` → create/update Investigation doc → `/investigate/:id` (ID driven)

### Session Persistence
New `sessionState` field on Investigation document:
```typescript
{
  centerMode: string;
  selectedNarrativeId: string | null;
  selectedActorHandle: string | null;
  selectedClaimIndex: number | null;
  leftPanelWidth: number;
  rightPanelWidth: number;
}
```
Saved on navigation away, restored on return.

### State Management
- `investigation-context.tsx` wraps only `/investigate/[id]` (not the whole app)
- New `monitor-context.tsx` for Monitor Mode (investigations list, alerts, metrics)
- Context destruction on navigation away is OK because session state is in MongoDB

## Component Ownership

### Shared (both modes)
- NervPanel, NervStatus, NervMetric, NervBadge, NervSparkline, NervBar, NervAlert, NervTicker, NervProgress
- NarrativeList (read-only in Monitor, interactive in Investigation)
- TemporalHeatmap (primary in Monitor, one of 12 in Investigation)
- SaturationIndicator

### Monitor Mode only
- MonitorDashboard (new composite: metrics + alerts + overview)
- InvestigationCard (from current command center)
- ScheduleConfig (from current monitor page)

### Investigation Mode only
- ActorsMatrix, ClaimsMatrix, EffectsChain, EntityPanel, GenealogyPanel, PropagationFlow
- NarrativeRadar, EvidenceChainPanel, SocialGraphPanel, PlatformComparisonPanel
- NarrativeComparisonPanel, NarrativeGlobe
- AnalysisQueuePanel, ScanProgress, ScanHistoryBar
- IdentityDossier, DetailPanel

## Implementation Phases

### Phase 1: Route restructure
- Create `/investigate/[id]/page.tsx` from current results workspace
- Change data loading from query params to investigation ID
- Update NervNav with new routes + breadcrumb

### Phase 2: Monitor Mode
- Rebuild `/monitor/page.tsx` as full surveillance workspace
- Create `monitor-context.tsx`
- Absorb command center content + alert scheduling

### Phase 3: Session persistence
- Add `sessionState` to Investigation schema
- Add `PATCH /api/investigations/:id/session` endpoint
- Save/restore UI state on mount/unmount

### Phase 4: Search flow update
- Search page creates Investigation → navigates to `/investigate/:id`
- Remove `/results` route
- Update all `router.push('/results?...')` calls

### Phase 5: Polish
- Navigation transitions
- Loading states between modes
- Keyboard shortcuts (Esc to return to Monitor)
- Tests for new routes and state persistence

## API Changes

### New endpoints
- `PATCH /api/investigations/:id/session` — save UI session state

### Modified endpoints
- `GET /api/investigations/:id` — include sessionState in response

### Removed
- Nothing removed — `/results` route is client-side only
