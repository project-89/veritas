# Analysis Quality Plan

**Status:** Phases A, B and D shipped (D 2026-08-26: permutation-tested co-activity coordination, wired into bot detection); C, E, F not started
**Scope:** every interpretive layer — bot/coordination detection, narrative grouping, credibility, causal suggestion
**Governed by:** [`detection-methodology.md`](./detection-methodology.md)
**Related:** [`causal-inference-layer.md`](./causal-inference-layer.md) · [`../../scripts/eval/README.md`](../../scripts/eval/README.md) · [`../REMEDIATION-PLAN.md`](../REMEDIATION-PLAN.md)

---

## 1. Why this exists

Veritas's analysis layers work. They are also, almost without exception, built on **hand-tuned constants that nobody has validated against ground truth**. The mechanisms are reasonable; the numbers are guesses wearing the costume of measurement.

This is one disease with many symptoms:

| Service | Uncalibrated constants |
|---|---|
| `graph-bot-detection` | temporal `0.3/0.3/0.2/0.2` (`:313-330`), behavioral `0.4/0.3/0.3` (`:421-437`), combination `0.3/0.3/0.4` (`:727-738`) |
| `narrative-analysis` | similarity threshold `0.75` (`:244`), facet multipliers `0.72 / 1.08 / 0.68` and a `0.35` sentiment gate (`:765-790`) |
| `source-credibility` | `heuristic*0.7 + graph*0.3` (`:140`), flag penalty `0.1` each capped `0.3` (`:144`) |
| `downstream-effects` | addressed by Phase 0; see the causal doc |
| plus `social-graph-intelligence`, `intelligence-engine`, `deviation`, `platform-credibility`, `entity-analysis` | same pattern |

None of these numbers is *wrong* exactly — they are unfalsifiable. There is no experiment in the repo that would tell us if `0.75` should be `0.68`, and no output that tells a user how much the answer depends on that choice.

Two consequences drive everything below:

1. **We cannot claim accuracy we have not measured.** Every number a user might act on needs a stated basis.
2. **Where a parameter is genuinely a judgement call, the user should be able to see and move it** — not have it frozen at whatever seemed right one afternoon.

---

## 2. Bot detection

### 2.1 What exists

`GraphBotDetectionService` (739 lines) is more substantial than "underbuilt" suggests. It computes three score families:

- **Temporal** — burstiness, machine-like fixed intervals, 24h coverage, weekend/weekday uniformity
- **Behavioral** — content repetition, engagement anomalies, sentiment uniformity
- **Structural** — graph patterns via Memgraph, when available

It also already does the single most important honest thing: `combineProbabilities` returns `null` on insufficient data rather than laundering "unknown" into a confident `0`.

### 2.2 What is actually wrong

**(a) The output is not a probability.** `botProbability` is a weighted average of heuristic scores on a 0–1 scale. Nothing maps it to *"of accounts scoring 0.8, what fraction are actually bots?"* — which is what a probability means and what a user will assume. It is an **anomaly score**, and calling it a probability is the same category error as calling temporal proximity a correlation.

**(b) The question is wrong.** "Is this account a bot?" is close to unanswerable from outside a platform, and the user identified exactly why: *a bot and a coordinated team produce the same trace.* Burst posting, repetition, and synchrony are all achievable by twenty paid humans with a shared script.

The field largely abandoned this question. Platform enforcement (Meta's "Coordinated Inauthentic Behavior") targets **coordination** and **inauthenticity**, not automation, precisely because automation is unobservable and legally irrelevant while coordination is measurable. We should follow: report two separate, differently-evidenced things —

- **Coordination evidence** — behavioural synchrony beyond chance across a *set* of accounts. Well-posed, measurable, robust.
- **Automation indicators** — machine-like regularity, 24h coverage, template reuse at the *individual* level. Weaker, always uncertain, never conclusive alone.

Reporting one blended `botProbability` destroys the distinction that matters. A twenty-account network posting identical text within 30 seconds is a *finding* whether or not any of them is scripted.

**(c) No base rate — again.** Co-activity within a short window looks damning until you ask how often it happens by chance at a given posting volume. Without a null model, coordination detection over-fires (the July audit already recorded this). The standard treatment is to build the co-activity similarity distribution across all account pairs and threshold on its tail, not on an absolute constant.

**(d) Missing signal families.** Relative to the literature (Botometer-style feature sets span roughly account metadata, friends/network, temporal, content/language, and sentiment), we have temporal, partial content, and partial network. Absent:

- **Account metadata** — creation-date clustering (networks are provisioned in batches), handle patterns (`Name` + 8 digits), follower/following ratios, default or missing profile fields, account age vs. activity volume.
- **Linguistic fingerprinting** — the user's "bots often sound the same." This is stylometry: function-word distributions, punctuation and emoji habits, sentence-length variance, template detection. Crucially it works on *style*, which survives paraphrase, where our current `detectContentRepetition` only catches near-duplicate *strings*. LLM-driven bots defeat string matching trivially and stylometry much less so.
- **Profile imagery** — the MAGA example is a real, well-formed signal: **visual template clustering**. Perceptual hashing (pHash) catches reused and lightly-edited avatars; a small image-embedding model catches *thematic* sameness (flag / eagle / weapon motifs) without anyone hand-labelling ideology. Also: GAN-generated face detection, since synthetic avatars remain common.
- **Infrastructure reuse** — shared URL shorteners, link domains, redirect chains. Cheap, high-precision, and already partly reachable from data we ingest.

**(e) Graph methods are underused.** The BotSim finding recorded in our own notes — heterogeneous graphs substantially outperform text and metadata approaches for LLM-driven bots — argues for structural signal getting *more* weight, not the 0.4 it currently gets when Memgraph happens to be up.

### 2.3 Strategy

1. **Split the output.** Replace `botProbability` with `coordinationEvidence` (network-level) and `automationIndicators` (account-level), each carrying its own evidence and uncertainty. Keep abstention.
2. **Build coordination properly.** Co-activity networks over multiple edge types — co-retweet, co-hashtag, co-URL, co-timing, near-duplicate text, shared avatar hash — then cluster and threshold against a null model derived from the observed distribution.
3. **Add the missing families**, cheapest-first: account metadata → infrastructure reuse → stylometry → imagery.
4. **Calibrate.** Fit and validate against a public labelled bot dataset, then report calibrated probabilities with intervals, or report ranked anomaly scores and stop calling them probabilities.
5. **Never label ideology.** The MAGA-avatar example is a *visual template cluster*, and that is exactly how it must be described. "These 40 accounts share a near-identical avatar motif and posted within 90 seconds" is evidence. "These are right-wing bots" is an accusation we cannot support and must not make. This follows the bloc-agnostic principle already applied to feed ownership.

---

## 3. Narrative grouping and the stance problem

### 3.1 The user's case is the central one

> if 75 percent of the words in a post are similar, but then the outcome is the difference between being for something or against something that really matters

This is precisely correct and is the sharpest known limitation of embedding-similarity clustering. *"We must ban assault weapons"* and *"Banning assault weapons is tyranny"* share topic, entities, and most vocabulary. Cosine similarity puts them close together. They are opposite narratives, and merging them destroys the very thing the platform exists to see.

### 3.2 What exists

The architecture already anticipates this. `adjustNarrativeSimilarity` (`:765-790`) penalises pairs whose *claim facets* oppose:

```ts
const isAccusation = (f) => f.has('scam') || f.has('investigation') || f.has('onchain');
const isPromotion  = (f) => f.has('promotion') || f.has('legitimacy');
// opposing facets + sentiment gap >= 0.35  ->  similarity *= 0.68
```

The idea is right. The implementation generalises to nothing:

- `extractClaimFacets` (`:794-818`) is **six hardcoded crypto regexes** — scam, promotion, analysis, onchain, legitimacy, investigation. A political, health, or conflict narrative produces zero facets, so the opposition rule never fires and the penalty never applies.
- The multipliers `0.72 / 1.08 / 0.68` and the `0.35` gate are unvalidated.
- It uses **sentiment as a proxy for stance**, which is a known confusion. Sentiment is about tone; stance is about *position relative to a target*. "This is a disaster for gun-control advocates" is negative in sentiment and pro-gun in stance. Any mechanism keyed on sentiment will mis-split and mis-merge.

### 3.3 Strategy

**Add stance as a first-class axis, target-relative.** Stance detection is a well-defined task (SemEval-2016 Task 6 framed it as favor / against / none *toward a stated target*), and the target here is naturally the scan query or the cluster's dominant entity.

Practical shape:

- Extract a **target** per cluster (query, or dominant entity).
- Classify each post's stance toward that target — three-way, with an explicit `unclear`. Zero-shot NLI or a small LLM call both work; this is one of the places an LLM is genuinely well-suited.
- Make clustering **stance-aware**: opposing stance toward the same target is a hard split, not a soft multiplier. That is the user's "a boolean is massively powerful" instinct, and it is right — for a *strong, well-measured* signal, a hard constraint beats a fudge factor. It must be gated on confident stance, with `unclear` never forcing a split.
- Retire the crypto facets, or demote them to one domain-specific signal among several.

This changes what a "narrative" means, in the right direction: *a shared claim and position*, not merely a shared topic.

---

## 4. Interactive parameter control

### 4.1 The idea is sound, and cheaper than it looks

> as you move the sliders you could see the system shrinking results into smaller grouped narratives or watch as overly broad groupings expand

The key economics: **re-clustering does not require re-embedding.** Embeddings are the expensive part (Gemini), they are already cached (`EmbeddingCacheStore`), and cluster centroids are already persisted (`centroidEmbedding`). `agglomerativeCluster(posts, similarityThreshold)` already takes the threshold as a parameter — it is simply hardcoded at the call site (`:244`).

So a live threshold slider needs: thread the parameter through `analyze()` and the controller DTO, return embeddings (or keep them server-side keyed by scan), and re-run clustering on demand. Re-clustering a few hundred cached vectors is milliseconds. It is genuinely real-time.

### 4.2 What to expose

- **Similarity threshold** — the headline slider; watch narratives merge and split.
- **Stance split** — on/off toggle; the clearest demonstration of why it matters.
- **Minimum cluster size** — what counts as a narrative vs. noise.
- **Signal weights** for bot/coordination scoring — temporal / behavioural / structural.

### 4.3 The guardrail this needs

Exposed weights without accountability are a way to obtain whatever answer you wanted. A slider that lets an analyst tune until the output agrees with their prior is worse than a fixed constant, because it launders motivated reasoning as configuration.

So parameter control must be paired with the **ground-truth harness**: when a parameter moves, show its effect on labelled-set precision/recall alongside the visual regrouping. Tuning then has a cost function instead of an aesthetic. Defaults ship as the harness-optimal values, and deviation from default is recorded in the output.

This also gives the harness a second job: not just regression-gating, but **parameter selection**. Sweep the threshold against the labelled corpus and pick the optimum rather than guessing 0.75.

---

## 5. Metrics and verification

Nothing in this plan is worth building without measurement, and the measurement infrastructure now exists (`scripts/eval`). Extensions required:

| Capability | Corpus | Notes |
|---|---|---|
| Stance detection | labelled favor/against/none toward a target | Bootstrap from SemEval-style public data, plus in-domain cases |
| Clustering quality | labelled "should these two posts be one narrative?" pairs | Pairwise judgements are far easier to label than whole clusterings; supports threshold sweeps directly |
| Coordination detection | synthetic injected networks + negative controls | Synthetic gives known ground truth; negative controls must never fire |
| Automation indicators | public labelled bot dataset | The only path to genuine calibration |
| Causal inference | per the causal doc §7 | Blocked on that layer |

**Calibration is the acceptance test for anything reported as a probability**: of everything reported at 0.8, roughly 80% should be positive. Until that holds, report ranked scores and say so.

---

## 6. Phases

Ordered so each phase is independently shippable and earlier phases de-risk later ones.

**Phase A — Stop over-claiming (small). ✅ SHIPPED.**
Rename `botProbability` to an honest anomaly score, or split into coordination/automation with the existing signals. Surface `analysisMode`-style provenance on bot, credibility and deviation outputs, matching propaganda and claims. No new detection, just honest labelling. *Removes the credibility liability immediately.*

**Phase B — Stance axis. ✅ SHIPPED.**
Target extraction, stance classification, stance-aware clustering, retire crypto facets. Add the stance and clustering-pair corpora. Highest user-visible quality gain in the plan.

**Phase C — Parameter control.**
Thread clustering parameters through the API, build the live re-clustering endpoint, ship the slider UI with harness feedback attached. Depends on B being in place so the stance toggle has something to toggle.

**Phase D — Coordination detection. ✅ SHIPPED (corpus co-activity + label-permutation null; graph-edge expansion pending interaction capture).**
Co-activity graph over multiple edge types, null-model thresholding, network-level output. Reuses the base-rate machinery the causal layer needs — build once, use twice.

**Phase E — Signal families.**
Account metadata → infrastructure reuse → stylometry → profile imagery, cheapest and highest-precision first.

**Phase F — Calibration.**
Public labelled dataset, fit, validate, report calibrated probabilities with intervals. Only after E supplies enough signal to be worth calibrating.

---

## 7. Non-goals

- **Ideological labelling.** We describe patterns, never allegiance. Structural and bloc-agnostic, exactly as with feed ownership.
- **Claiming automation.** We report coordination and inauthenticity indicators. "This is a bot" is not a claim we can support from outside a platform.
- **Unbounded parameter freedom.** Sliders exist to make judgement calls visible and accountable, not to let anyone dial in a preferred conclusion.
- **Replacing LLM judgement with statistics, or vice versa.** Statistics gate what is worth reasoning about; the LLM reasons about mechanism. Both, in that order.

---

## 8. Open decisions

1. **Do we keep a single headline bot number?** Splitting into coordination + automation is more honest but harder to render. Recommendation: split, and let the UI show the stronger of the two with the other one click away.
2. ~~**Stance classifier: zero-shot NLI or LLM call?**~~ **RESOLVED (Phase B): LLM**, batched 20/call, through the now-durable response cache. No NLI fallback yet — unavailable means `unclear`, which never splits.
3. ~~**Hard stance split, or steep penalty?**~~ **RESOLVED (Phase B): hard split.** A multiplier is insufficient — at cosine 0.95 even a 0.68 penalty leaves 0.65, which still merges under a low enough threshold. Gated on confidence >= 0.6; `unclear` and `neutral` never split.
4. **Which public bot dataset?** Determines what "calibrated" means and how much it transfers to our platforms.
5. **Do tuned parameters persist per investigation, or reset to harness-optimal defaults?** Persisting aids reproducibility; resetting resists motivated tuning.
