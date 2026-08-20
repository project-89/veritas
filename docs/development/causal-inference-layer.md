# Causal Inference Layer — Design & Development Plan

**Status:** Phase 0 shipped (2026-08-06, `c873f32`); Phases 1-5 not started
**Owner decision required:** yes — see [Open Decisions](#open-decisions)
**Governed by:** [`detection-methodology.md`](./detection-methodology.md)
**Related:** [`REMEDIATION-PLAN.md`](../REMEDIATION-PLAN.md) · [`forensic-intelligence-roadmap.md`](./forensic-intelligence-roadmap.md)

---

## 1. Summary

Veritas can already say *"this narrative and this real-world signal happened near each other."*
It cannot yet say *"this co-occurrence is more than chance"* — but it currently **speaks as if it can**, emitting `caused` / `caused_by` labels and confidence numbers with no statistical grounding.

This document specifies the work to turn the downstream-effects layer from **assertion** into **inference**: a system that quantifies how surprising a narrative↔signal co-occurrence is against a measured baseline, and abstains when the evidence does not clear the bar.

The guiding principle is the one already established elsewhere in this codebase: **degrade honestly, never silently**. Bot detection returns `botProbability: null` rather than a confident `0` on thin data. Propaganda analysis stamps `analysisMode`. Translation records `translated: false`. The causal layer is the last major analysis surface that still manufactures confidence it has not earned.

---

## 2. Why this is needed

### 2.1 The deterministic path asserts causation from ordering alone

`libs/analysis/src/lib/services/downstream-effects.service.ts:617-623`:

```ts
let possibleRelationship: 'caused_by' | 'caused' | 'coincident' | 'amplified';
if (Math.abs(offsetDays) < 1) {
  possibleRelationship = 'coincident';
} else if (offsetDays > 0) {
  possibleRelationship = 'caused';     // signal came after narrative
} else {
  possibleRelationship = 'caused_by';  // signal came before narrative
}
```

A signal is labelled `caused` **purely because it happened afterwards**. This is *post hoc ergo propter hoc* encoded as a branch. Any event following any narrative earns a causal label.

### 2.2 The ranking score is not a correlation

`downstream-effects.service.ts:609-610`:

```ts
const correlationStrength =
  temporalScore * 0.4 + keywordScore * 0.3 + signal.magnitude * 0.3;
```

`signal.magnitude` — the size of an earthquake, the size of a price move — contributes **30% of "correlation strength"**. A large earthquake therefore scores as *more correlated* with an arbitrary narrative than a small one, though magnitude carries no information about the relationship. The weights are hand-chosen and unvalidated. The quantity is named `correlationStrength` but is not a correlation by any statistical definition.

### 2.3 The filter admits nearly everything

`downstream-effects.service.ts:641`:

```ts
.filter((c) => c.correlationStrength > 0.1)
```

Magnitude alone (`0.34 × 0.3 ≈ 0.1`) clears this bar with zero keyword overlap and zero temporal proximity. Combined with a ±7-day proximity window (`:595`) and a candidate pool of ~21k archived global events, "a signal near this narrative" is guaranteed rather than informative.

### 2.4 No base rate, no multiple-comparison control

Every narrative is scored against every signal, and the top hits are kept. With N narratives × M signals and no correction, the strongest apparent correlation is spurious *by construction* — it is the maximum of a large set of noise draws. Nothing measures how often a given signal co-occurs with **unrelated** narratives, which is the only thing that makes co-occurrence meaningful.

This is the same defect the July 2026 audit recorded for coordination detection ("over-detects with no base rate"). It is a systemic pattern, not a one-off.

### 2.5 The agentic path is better but is still an opinion

`CausalReasoningService` (`causal-reasoning.service.ts`) is a genuine improvement: a Gemini function-calling loop with `fetch_signals`, `search_historical_signals`, `submit_causal_chain`, and — importantly — `reject_correlation`. It can look back months, reason about direction, and discard weak links.

But its output confidence is `overall_confidence`, **self-reported by the model** (`causal-tool-definitions.ts:160`). An LLM asked "how confident are you?" produces a plausible number, not a calibrated one. It can reject the obviously silly; it cannot tell you that a co-occurrence is two standard deviations outside the historical baseline, because it has never measured the baseline.

The agent is the right *interface*. It needs a statistical *instrument* to hold.

### 2.6 Why it matters for the product

Veritas's stated purpose is to be an intelligence-grade tool — "no fake/pretend/cosplay half-baked ideas." A causal claim is the highest-stakes output the system produces: it is the thing a user would act on, cite, or be misled by. Emitting `caused` on temporal ordering is the single largest credibility liability in the analysis stack, and it is invisible to the user because the output *looks* rigorous.

---

## 3. What the system does when this is complete

When a scan produces narratives and the causal layer runs, the user gets one of three outcomes per narrative↔signal pair — never a bare assertion:

| Outcome | Meaning | Shown as |
|---|---|---|
| **Supported** | Co-occurrence is stronger than the measured baseline, survives lag and multiple-comparison correction | Effect size + how unusual, with the baseline stated |
| **Not distinguishable from chance** | The pair co-occurred, but no more than similar pairs normally do | Listed, explicitly marked as unremarkable |
| **Insufficient data** | Too few observations to say anything | Abstains, states what was missing |

Concretely, a supported finding reads like:

> Narrative *"CBDC rollout is surveillance"* precedes a Bitcoin drawdown by 2–4 days.
> Observed co-occurrence: **6 of 7** narrative episodes.
> Baseline for drawdowns of this size in matched windows: **1.4 of 7 expected**.
> Effect size 0.61, q = 0.03 after correction across 340 tested pairs.
> Direction constrained to narrative→signal by a pre-declared 1–7 day lag.
> **This is an association, not a demonstrated mechanism.**

And a rejected one is equally visible:

> Narrative *"AI consciousness debate"* vs. M4.6 earthquake, Honshu.
> Co-occurred within 3 days. Baseline: earthquakes of this magnitude occur in **89%** of randomly chosen 7-day windows. **Not distinguishable from chance.**

The second is arguably more valuable than the first — today the system would render it as `caused`.

**Success criteria:**

1. No output labelled `caused` / `caused_by` without a directional lag constraint *and* a baseline comparison.
2. Every quantitative claim carries the reference distribution it was measured against.
3. Below-threshold pairs are shown as *tested and unremarkable*, not hidden — a null result is a finding.
4. Insufficient-data abstention is a first-class result, matching the `botProbability: null` pattern.
5. Precision/recall measurable against a labelled corpus (§7), so "it works" is a number, not a claim.

---

## 4. Design

### 4.1 The core idea

A co-occurrence is only informative relative to how often it happens anyway. Every claim must answer: **"compared to what?"**

The owner's framing captures it exactly — *Bitcoin crashing means little on its own; it means something if the other chains did not follow, or if drawdowns of that size are rare in comparable windows.* That comparison set is the base rate, and building it is the bulk of this work.

### 4.2 We already have the substrate

This is the enabling asset, and it is why the work is feasible now:

- **`global_event_archive`** — ~21k slim, **no-TTL** rows: `eventId, title, source, category, severity, ownership, lat, lng, label, timestamp`. Purpose-built for longitudinal analysis.
- **`global_event_history`** — ~54k append-only rows (built for stealth-edit detection, usable as an event-frequency record).
- **13 signal adapters** — ACLED, CoinGecko, EONET, FRED, GDACS, GDELT, GFW-maritime, NWS, USGS, Weather, WorldBank, Yahoo Finance (+ the opt-in LLM-hypothesis adapter, which must be **excluded** from baselines — it invents signals).

Historical frequency by `category` × `severity` × time window is directly computable from the archive. No new ingestion is required for v1.

### 4.3 Statistical components

**(a) Null distribution / base rate.**
For a candidate pair, sample many matched control windows where the narrative was *not* active, and measure how often a signal of that class and magnitude occurs. This yields the expected rate. Two viable estimators:

- *Empirical* — draw K random matched windows from the archive (simple, assumption-light, preferred for v1).
- *Circular block permutation* — shift the narrative's activity series against the signal series to preserve autocorrelation (better, needed once series are dense).

Signals have wildly different base rates (earthquakes are near-continuous; a WorldBank release is not), so **baselines must be per-adapter and per-severity band**, never global.

**(b) Directional constraint with a pre-declared lag.**
Replace the ordering branch (§2.1). A direction is only claimed if the effect falls inside a lag window declared *before* testing, per signal class (e.g. markets 0–5 days, conflict 1–30 days). Post-hoc lag selection is how spurious findings are manufactured; the window must be config, not a search result.

**(c) Multiple-comparison control.**
Every run tests N narratives × M signals. Apply Benjamini–Hochberg FDR across the full tested set and report **q-values**, not raw p-values. The count of tests performed is part of the output — hiding it makes the surviving finding look stronger than it is.

**(d) Effect size, reported separately from significance.**
A tiny effect can be significant with enough data and is usually uninteresting. Report both, and rank by effect size.

**(e) Data-sufficiency gate.**
Minimum episode counts and minimum baseline sample before any test runs. Below the floor: `insufficient-data`, with the specific shortfall named. Reuses the established abstention pattern.

**(f) Confounder awareness (v1: disclosure, not correction).**
Two narratives peaking together may share an upstream cause. Full deconfounding is out of scope; v1 must at minimum flag when multiple narratives in the same run correlate with the same signal, since that pattern usually indicates a common driver rather than N independent effects.

### 4.4 How this composes with the agent

The statistical engine does not replace `CausalReasoningService` — it **arms** it.

```
  signals + narratives
          │
          ▼
  ┌───────────────────────┐
  │ CausalStatisticsService│  base rates, lag-constrained tests,
  │  (new, deterministic)  │  FDR correction, effect sizes, abstention
  └───────────┬───────────┘
              │  survivors only, each with q, effect size, baseline
              ▼
  ┌───────────────────────┐
  │ CausalReasoningService │  mechanism, plausibility, direction sanity,
  │   (existing, agentic)  │  rejection with reasoning
  └───────────┬───────────┘
              ▼
     narrative correlations
```

Statistics gate *what is worth reasoning about*; the agent explains *what it might mean* and can still reject. Two independent failure modes must both pass. This also cuts LLM spend — the agent stops reasoning over hundreds of noise pairs.

New agent tool: `get_base_rate(signalClass, window)`, so the model can consult the baseline rather than intuit it.

### 4.5 Output contract

Extend `NarrativeCorrelation.correlatedSignals[]`:

```ts
interface CausalEvidence {
  verdict: 'supported' | 'not-distinguishable' | 'insufficient-data';
  effectSize: number;                 // standardized
  qValue: number | null;              // null when not tested
  testsPerformed: number;             // multiple-comparison denominator
  baseline: {
    expectedRate: number;
    method: 'empirical-matched-window' | 'circular-block-permutation';
    sampleSize: number;
  } | null;
  lagWindow: { minDays: number; maxDays: number; preDeclared: true };
  insufficientReason?: string;        // populated only when abstaining
  caveat: 'association-not-mechanism'; // always present; the UI must render it
}
```

`possibleRelationship` keeps its name for compatibility but may only be set to `caused`/`caused_by` when `verdict === 'supported'`. Otherwise `coincident`.

---

## 5. Implementation phases

Each phase ships independently and leaves the system in a better state than it found it.

**Phase 0 — Stop asserting (small, do first, unblocks nothing else). ✅ SHIPPED `c873f32`.**
Remove the ordering-based causal labels (§2.1). Everything becomes `coincident` until earned. Drop `signal.magnitude` from the ranking score. Raise/remove the `> 0.1` filter. Surface `analysisMode: 'heuristic'` on this path so the client can mark it unvalidated. *This alone removes the credibility liability, before any statistics exist.*

**Phase 1 — Baseline engine.**
`CausalStatisticsService` + `BaseRateRepository` over `global_event_archive`. Per-adapter, per-severity empirical base rates with caching (they change slowly; recompute daily). Pure functions, heavily unit-tested with synthetic series of known ground truth.

**Phase 2 — Hypothesis testing.**
Lag windows as declared config per signal class. Test execution, effect sizes, BH-FDR correction, sufficiency gates. Emit the §4.5 contract.

**Phase 3 — Agent integration.**
Gate `CausalReasoningService` on survivors. Add `get_base_rate`. Update prompts so the agent reasons about mechanism given statistics, rather than re-deriving confidence.

**Phase 4 — Client surfacing.**
Render all three verdicts. Show the baseline, the test count, and the association-not-mechanism caveat. Make "not distinguishable from chance" visible rather than filtered away.

**Phase 5 — Validation.** See §7.

---

## 6. Non-goals

- **Proving mechanism.** This layer produces *calibrated association*. The caveat field is permanent, not transitional.
- **Real-time causal inference.** Baselines are batch-computed.
- **Deconfounding.** v1 discloses shared-driver patterns; it does not adjust for them.
- **Replacing the agent.** The LLM stays; it stops being the sole arbiter.
- **Cross-lingual signal ingestion.** Out of scope by owner decision — English-only.

---

## 7. Validation

This layer cannot be validated by unit tests alone: the failure mode is *confidently wrong*, which passes tests. It requires the **ground-truth evaluation harness** already on the remediation plan.

1. **Synthetic ground truth** — generate series with *known* injected causal relationships plus known-null pairs. The engine must find the former and reject the latter. Precision/recall reportable.
2. **Negative controls** — pairs that must never be flagged (e.g. narrative vs. a signal with a deliberately shuffled timeline). Any hit is a bug.
3. **Historical corroboration** — a small labelled set of well-documented real events where the relationship is independently established, checked against system output.
4. **Calibration check** — of everything reported at q < 0.05, roughly 5% should be false on the labelled set. Miscalibration here is the whole failure mode.

**A regression in negative-control precision should fail CI.**

---

## 8. Open decisions

1. **Significance threshold.** q < 0.05 by convention, or stricter given the intelligence context and the cost of a false causal claim?
2. **Lag windows per signal class.** Needs domain input — markets, conflict, disaster, macro all differ. Must be declared before testing.
3. **Sufficiency floors.** Minimum narrative episodes and baseline sample size. Trades coverage against reliability; likely tuned empirically in Phase 5.
4. **Phase 0 timing.** Ship the honesty fix immediately as its own change, or hold it to land with Phase 1? *Recommendation: immediately — it is small and removes an active liability.*
5. **Client treatment of null results.** Equal billing, collapsed-by-default, or a separate "tested and rejected" panel?

---

## 9. Related work in this codebase

- **Honesty patterns to follow:** `botProbability: number | null` (`graph-bot-detection.service.ts`), `analysisMode` on propaganda/claim results, `translated` on `NarrativeInsight`, `probed: false` on `CoverageProbeService`.
- **Same defect elsewhere:** coordination detection over-detects with no base rate (July 2026 audit). The base-rate engine from Phase 1 should be reusable there — likely the highest-leverage reuse of this work.
- **Excluded from baselines:** `llm-hypothesis.adapter.ts` synthesizes signals and is opt-in via `ENABLE_LLM_HYPOTHESIS_SIGNALS`. It must never contribute to a baseline or a test — that would be circular.
