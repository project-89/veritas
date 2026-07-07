# Veritas Remediation Plan — Professional-Grade Intel System

**Created:** 2026-07-06 · **Status:** Active working document
**Goal:** Take Veritas from a working prototype to a professional-grade, reliable intelligence system: unified patterns, no dead code, secure by default, honest about what each capability actually does, and respectful of every data source.

This doc is the single source of truth for the cleanup/hardening program. Check items off as they land. Findings come from a full-repo audit (connectors, analysis methods, DB layer, API, client, dead code) on 2026-07-06.

---

## Guiding principles

1. **Never spam a source.** Every outbound fetch goes through a shared per-source rate limiter with caching and cross-scan dedup. Backoff always has jitter.
2. **Honest capabilities.** No feature may silently return empty/fake results and look like a real finding. If a connector can't search, it's labeled monitoring-only. If an analysis is a single LLM prompt, its confidence scores must say so.
3. **One pattern each** for: HTTP fetching, config access, error handling, logging, caching, connector structure.
4. **Secure by default.** Auth on every endpoint, explicit CORS, validated env, bounded input.
5. **Delete dead code on sight.** If it's not imported, it's gone (git history is the archive).

---

## Workstream 1 — Ingestion pipeline reliability (TOP PRIORITY)

The system is ingestion-heavy and currently has no system-level protection against hammering sources.

### 1.1 Concurrency & queueing
- [x] **Scan processor concurrency limit** — `libs/ingestion/src/lib/queue/scan.processor.ts:41` declares `@Processor('scan')` with no limit; N queued scans × 12 connectors fire at once. Set `{ concurrency: 2–3 }`. *(done 2026-07-06: concurrency 3)*
- [x] **`searchAndTransformAll` Promise.all** — mitigated 2026-07-06: the shared rate limiter now paces every connector's outbound requests regardless of how many run "in parallel". A bounded connector pool remains a nice-to-have.
- [x] **Jittered backoff on all queues** — *(done 2026-07-06: `jitteredBackoff()` util used by scan/analysis/profile enqueues)*

### 1.2 Shared per-source rate limiter
- [x] `SourceRateLimiter` (per-platform pacing + concurrency caps + platform-wide 429 cooldowns, env-tunable via `SOURCE_RATE_LIMITS`) — ALL 9 HTTP/subprocess connectors route through it *(done 2026-07-06: `services/utils/source-rate-limiter.ts`)*
- [x] `Retry-After` parsing + proactive platform cooldown on 429 (Reddit, Bluesky, Farcaster, Telegram, 4chan) *(done 2026-07-06)*
- [ ] Persist RSS feed-failure suppression state (currently in-memory `rss.connector.ts:75` — resets on restart). Move to Mongo.

### 1.3 Cross-scan dedup & caching
- [x] **Cross-scan fetch cache**: identical (platform, query, mode, window, limit) fetches within a TTL (default 30 min, `CONNECTOR_CACHE_TTL_MINUTES`) are served from Mongo instead of re-hitting sources *(done 2026-07-06: `connector-fetch-cache` schema/repo + scan processor integration)*
- [ ] Per-URL fetched-content ledger (~24h) for finer-grained dedup across DIFFERENT queries that surface the same posts.
- [ ] Improve within-scan dedup: `post-dedup.util.ts:37` uses hour-level time buckets + 240-char prefix; fine, but document its misses and add cross-scan layer above.

### 1.4 Connector unification (pattern consistency)
- [ ] All connectors extend/compose one base (`base-social-media.connector.ts`) — today only Twitter uses it; the rest reimplement connect/retry/transform ad hoc.
- [x] **Consistent error surface** — every connector now THROWS on total failure (auth dead, all sub-requests failed, binary/config missing) instead of returning `[]`; partial failures keep results + warn; genuine empties still return `[]`. Failures flow to the scan job and the client's existing per-connector FAILED display. Every connector has total-failure + genuine-empty tests *(done 2026-07-07)*
- [ ] Per-connector Zod-validated env config at startup; log a startup capability table (which connectors are live, degraded, disabled and why).
- [ ] "Streaming" methods poll on intervals (Twitter/Reddit every 60s per stream) — either implement real streaming or rename and consolidate the polling.

### 1.5 Connector-by-connector verdicts & actions
Audit ranked them (out of the box, only 5 work with zero config: Reddit, RSS, Bluesky, Wikipedia, 4chan):

| Connector | Verdict | Action |
|---|---|---|
| Reddit | ✅ Solid (public JSON, real metrics, real search + timelines) | Move onto shared base/limiter |
| RSS | ✅ Solid (smart feed selection, cache, backoff) | Persist failure state; keep as reference pattern |
| Bluesky | ✅ Solid (AT Proto public API, real metrics) | Add rate limiter |
| 4chan | ✅ Solid, niche (1 req/s enforced) | Keep |
| Wikipedia events | ⚠️ Works but current-events page only; no `searchWithRawData` | Implement `searchWithRawData`; label scope honestly |
| YouTube (yt-dlp) | ⚠️ Works if binary installed; temp files `/tmp/veritas-yt-*` never cleaned | Health-check binary at startup; clean temp files |
| Twitter | ⚠️ Fragile: depends on private local fork `@haruhunab1320/twitter-scraper` (`file:` dep), needs cookies/creds | Decide: maintain fork with pinned plan, or add fallback; surface auth failure loudly |
| Farcaster (Neynar) | ⚠️ Fine but needs API key; disabled by default | Document; keep |
| Telegram | ❌ **Search is fake** — fetches curated channels then filters; query doesn't drive discovery | ✅ *(done 2026-07-07)*: channels configurable via `TELEGRAM_CHANNELS`, class labeled CHANNEL-MONITORING, per-search honesty log |
| Facebook (Jina) | ❌ Not a search connector: monitors configured page URLs, timestamps hardcoded to now, metrics all 0 | ✅ *(done 2026-07-07)*: labeled PAGE-MONITORING w/ retrieval-time caveat; throws when `FACEBOOK_PAGE_URLS` unset |
| TruthSocial (truthbrush) | ❌ Disabled; subprocess + creds; unmaintained upstream | Remove or park behind explicit opt-in |
| Web scraper | ❌ Placeholder (example.com selectors), fake search | Remove default config; make config-driven only, or delete |

- [x] Per-connector unit tests for failure semantics — every connector has at least one total-failure-throw test and one genuine-empty test *(done 2026-07-07)*. Still todo: on-demand LIVE smoke tests against real sources.
- [ ] Surface engagement-metric provenance: mark each metric real / inferred / unavailable (many are hardcoded 0 today, which poisons analytics downstream).

---

## Workstream 2 — Analysis capability hardening (honest intel)

Audit verdict: uneven. Clustering and bot detection are real; several "detections" are single LLM prompts with fabricated confidence.

| Capability | Reality today | Verdict |
|---|---|---|
| Narrative clustering | Real agglomerative clustering on Gemini embeddings, retry/fallback chains | ✅ Strongest piece |
| Bot detection | Real behavioral heuristics (burst, interval regularity, 24h coverage) + optional Memgraph graph patterns | ✅ Solid, needs ground-truth validation |
| Deviation analysis | Simple centroid math | ✅ Basic but honest |
| Saturation metrics | Heuristics | ✅ OK |
| Propaganda detection | **One Gemini prompt** with a 17-item technique list, first-10-posts sample, LLM-invented confidence, no temperature control (`propaganda.service.ts:129-189`) | ❌ Super basic — your suspicion confirmed |
| Claim verification | Wikipedia (5 results) + GDELT (10) keyword retrieval → LLM verdict; heuristic fallback caps confidence at 0.6 by counting sources; no grounding check that evidence supports verdict (`claim-verification.service.ts:416-466,561-644`) | ❌ Dangerous — can mark claims "verified" without real evidence |
| Entity analysis | Aggregates `insights.entities[]` that **nothing populates** | ❌ Effectively a stub |
| Causal reasoning | Agentic Gemini loop, good skeptical system prompt, bounded iterations — but consumes the LLM-Hypothesis adapter | ⚠️ Promising, contaminated input |
| LLM-Hypothesis signal adapter | Asks Gemini to invent plausible signals, feeds them into causal pipeline | ❌ Confabulation by design — quarantine |
| Deep investigation | LLM user-profiling wrapper | ⚠️ Thin |
| Report generation | LLM summary + templates | ✅ Fine for what it is |
| Signal adapters (GDELT, CoinGecko, FRED, WorldBank, Yahoo) | Real APIs, cached | ✅ Good |

### Actions
- [x] **Fail loudly, not emptily** — `analysisMode: 'llm'|'heuristic'|'skipped'|'unavailable'` now on propaganda + claim-verification results; client renders "ANALYSIS UNAVAILABLE" banner instead of "low manipulation", and a ⚠ heuristic tag on keyword-matched verdicts *(done 2026-07-06)*. Still todo: same treatment for deep-investigation/downstream/report.
- [x] **Quarantine LLM-Hypothesis adapter** — now opt-in only via `ENABLE_LLM_HYPOTHESIS_SIGNALS=true` *(done 2026-07-06)*
- [ ] **Propaganda detection v2**: adopt a real taxonomy (SemEval-style techniques), per-post span evidence, temperature 0 + structured output, sampling strategy better than first-10-posts, and calibration against a labeled corpus.
- [ ] **Claim verification v2**: semantic (not keyword) evidence retrieval; require verdicts cite specific retrieved passages; add a grounding check (does cited evidence actually entail the verdict); widen sources (fact-check APIs); replace count-based heuristic confidence.
- [ ] **Fix or remove entity analysis** — wire real NER/extraction upstream, or delete the service until it has inputs.
- [ ] **Determinism & versioning**: temperature 0 everywhere JSON is parsed; move hardcoded model names (`gemini-2.0-flash` ×6 services, `gemini-3.1-pro-preview` in causal) to config; stamp results with model+prompt version so historical results are comparable.
- [ ] **LLM cost control**: per-investigation token budget, LLM-output cache keyed (input-hash, model, prompt-version), semaphore on concurrent Gemini calls. A single 100-post investigation can currently trigger 100+ calls.
- [ ] **Ground-truth evaluation harness**: small labeled sets per capability (bot/no-bot, propaganda/normal, fact-checked claims) + a script reporting precision/recall so quality claims are measurable. Validate bot detection against a public bot dataset.

---

## Workstream 3 — Database & query layer

- [x] **ScanJob posts array** — posts now live in the `scan_posts` collection (one doc per post, indexed by scanId+seq); appends are bulk inserts, no more full-array rewrites or 16MB ceiling. Legacy embedded arrays still readable as fallback *(done 2026-07-06)*
- [x] **N+1s** — `listAtlasLenses` now 2 batch queries via `findByIds`/`findByInvestigationIds`; alert repo uses `updateMany`/`count`/`createMany` *(done 2026-07-06)*
- [x] **Cache upserts** — embedding/rss caches now update-then-insert; signal cache uses `deleteMany` *(done 2026-07-06)*
- [ ] **Indexes**: text index for handle search (regex scan today at `identity-record.repository.ts:90`), compound `{status, investigationId, createdAt}` on scan jobs. (`lastInvestigatedAt` index already existed — audit overcall.)
- [x] **In-memory vector search** — hard-capped at 10k docs with loud partial-results warning *(done 2026-07-06)*
- [ ] **Redis repository** uses blocking `KEYS` + client-side filtering (`redis-repository.ts:41-111`) — restrict Redis to real KV caching or use `SCAN`.
- [x] **Connection hygiene** — explicit pool sizes + timeouts in `mongodb-provider.ts` *(done 2026-07-06)*
- [ ] **Analysis cache size guard** (`scan-job.repository.ts:247-285`): enforce hard limit after trimming; surface write failures.

## Workstream 4 — Security & production readiness

- [x] **Auth** — global `ApiKeyGuard`: when `VERITAS_API_KEY` is set every request needs `x-api-key` (or Bearer, or `?apiKey=` for SSE); production refuses to start without it; client sends `NEXT_PUBLIC_VERITAS_API_KEY` *(done 2026-07-07)*. Real per-user auth remains future work.
- [x] **CORS** — explicit origin list from `CORS_ORIGIN`; dev defaults to localhost:4200/3000; production startup fails on wildcard/unset *(done 2026-07-07)*
- [x] **Env validation** — `validateEnv()` at bootstrap: malformed MONGODB_URI / missing prod requirements fail fast; missing optional keys log capability warnings *(done 2026-07-07)*
- [ ] **Input bounds**: class-validator DTOs — query length, `limit ≤ 1000`, `userHandles ≤ 100`, timeRange whitelist (scan processor currently accepts anything).
- [ ] **Rate limiting**: `@nestjs/throttler` on `/investigate` and scan-triggering endpoints.
- [x] **Health endpoint** — `GET /health` (auth-exempt) reporting mongo connectivity + uptime *(done 2026-07-07)*
- [ ] Move `DeepInvestigationService.investigate()` off the synchronous HTTP path onto the queue.

## Workstream 5 — Client (dashboard)

- [ ] **Kill polling storms**: `results/page.tsx` runs scan-status (2s) + analysis-jobs (2s) + profile (3s, no timeout) loops concurrently. Replace with SSE (an `use-event-stream.ts` exists — wire it up) or at minimum: single coordinated poller, backoff, hard timeout.
- [ ] **Adopt SWR/React Query** for all fetches (dedup, cache, stale-while-revalidate); add AbortController + timeout to `lib/api.ts` `request()`.
- [x] **Bound profile polling**: stale-closure interval polled forever if generation stalled — now capped at 5 min *(done 2026-07-06)*
- [x] **Fix refresh race**: `handleRefresh` could start a scan while one runs — now guarded *(done 2026-07-06)*
- [ ] **Client typecheck in CI**: 33 pre-existing strict TS errors in client components (nerv/*) — `tsc --noEmit` isn't enforced anywhere.
- [ ] **Decompose `results/page.tsx`** (2,433 lines) into panel components; add error boundaries.
- [ ] **Share types with backend**: `lib/api.ts` hand-duplicates ~350 lines of DTOs — move to `libs/shared/types`.
- [ ] Surface honesty signals in UI: connector failures, `unavailable` analysis states, hypothesized-signal labels, saturation report (already computed, never shown).

## Workstream 6 — Dead code, consistency, hygiene

**Confirmed dead (deleted 2026-07-06):**
- [x] `libs/sources/` — zero imports anywhere (path alias removed from `tsconfig.base.json` too)
- [x] `apps/api/src/app/app.service.ts` + `app.controller.ts` (+ their specs) — not registered in AppModule
- [x] `package.json.original` — pre-Nx leftover

**Decide (owner call):**
- [ ] `libs/visualization` — 22+ components, zero imports from the client, zero tests. Wire into dashboard or delete. (Deferred — revisit during the Phase 4 client rework, since dashboard redesign may want these.)
- [x] **GraphQL layer** — DECIDED 2026-07-06 (owner) and REMOVED 2026-07-07: resolvers, GraphQL-only DTOs, schema.gql, and all 7 graphql/apollo dependencies deleted; shared classes kept with decorators stripped. Client was 100% REST; this closes an unauthenticated duplicate mutation surface.
- [ ] k8s/terraform — templates reference Kafka (doesn't exist in code) and placeholder image registries. Update or mark as reference-only.

**Pattern unification:**
- [ ] Error handling: 132 plain `throw new Error` vs 19 `HttpException` — services throw domain errors, controllers map to HTTP; add a global exception filter.
- [ ] Config: migrate remaining direct `process.env` reads (`main.ts`, `app.module.ts`) to ConfigService.
- [ ] Logging: replace `console.*` with NestJS Logger; add request-correlated structured logging.
- [x] Plugin codegen: `plugins:sync` now runs before `build` and `dev` *(done 2026-07-06)*; still todo: CI check that generated files are clean.
- [ ] Update `docs/LIBRARIES-REVIEW.md` (lists dead/nonexistent libs as "Active") and README (claims Kafka streaming; describes 11 viz modes the client doesn't render).

**Test gaps:**
- [x] Fix 2 stale `createOrGet` tests (searchMode default) — *done 2026-07-06*
- [ ] veritas-client: 0 tests; visualization: 0 tests; atlas-plugin: 0 tests — add smoke coverage after refactors land.

---

## Execution phases

**Phase 1 — Stop the bleeding (days):** scan concurrency limit · connector error surfacing (no silent `[]`) · LLM `unavailable` status instead of empty results · client null-guard + refresh race · alert `updateMany` · delete confirmed-dead code · plugin codegen in build.

**Phase 2 — Ingestion backbone (1–2 weeks):** shared rate limiter + header parsing + jitter · cross-scan fetch ledger · connector base-class unification + Zod env config · Telegram/Facebook honesty labels · scan-posts collection migration · missing indexes + cache upserts.

**Phase 3 — Intel quality (2–4 weeks):** claim-verification grounding v2 · propaganda v2 with real taxonomy · quarantine hypothesis adapter · entity analysis fix-or-delete · determinism + model config + LLM cache/budget · ground-truth eval harness.

**Phase 4 — Product hardening:** auth + CORS + env validation + throttler + health · SSE/SWR client rework · results-page decomposition · shared types · GraphQL/visualization decision · docs refresh.

---

*Full audit transcripts: see session memory `project_audit_2026_07`. Related vision docs: `project_veritas_vision`, `project_deep_investigation_agents`.*
