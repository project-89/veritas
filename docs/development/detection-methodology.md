# Detection Methodology

**Status:** Governing standard — the causal and analysis-quality plans answer to this doc
**Related:** [`causal-inference-layer.md`](./causal-inference-layer.md) · [`analysis-quality-plan.md`](./analysis-quality-plan.md) · [`../../scripts/eval/README.md`](../../scripts/eval/README.md)

---

## 1. The standard

Every detection capability in Veritas must be a **deterministic method over evidence**, grounded in an established technique — statistical or journalistic — and measurable against ground truth.

An LLM may participate. It may not *be* the method.

This is not a stylistic preference. Today eleven capabilities are implemented as a prompt (`propaganda`, `claim-verification`, `causal-reasoning`, `deep-investigation`, `downstream-effects`, `narrative-summaries`, `stance`, `report`, `translation`, `failure-example`, `llm-hypothesis`), and that layer has failed silently three separate times in one month:

- the `gemini-2.0-flash` deprecation degraded **every** LLM capability app-wide, undetected until clustering provenance flags surfaced it;
- truncated JSON silently voided whole stance batches, reverting clustering to similarity-only;
- a greedy array regex silently voided narrative summaries, rendering raw post text as analysis.

A system whose capabilities are prompts is a system whose capabilities can be deleted by a vendor deprecation or a malformed brace. That is the definition of brittle.

### The four questions every detector must answer

1. **What is the evidence?** Specific, quotable, traceable to a source record.
2. **Compared to what?** A base rate. A co-occurrence, a burst, a repetition is meaningless without knowing how often it happens anyway.
3. **How confident, and on what basis?** `observed` / `derived` / `estimated` — never an unqualified number.
4. **How would we know if it were wrong?** A labelled corpus and a measured score.

A capability that cannot answer all four is not shipped as a finding. It is shipped as `insufficient-data`, or not shipped.

---

## 2. Journalistic method, encoded

These are not metaphors. Each maps to something computable over data we already hold.

### 2.1 Corroboration requires INDEPENDENT sources

The newsroom rule is two independent sources. The word doing the work is *independent*: two outlets running the same wire copy are one source, not two, and counting them as two is how a single fabrication becomes "widely reported."

**Computable now.** We have `authorHandle`, `platform`, `feedOwnership`, publication timestamps, and near-duplicate detection over text. Independence is measurable:

- **Textual independence** — near-duplicate or high cosine overlap means shared origin, not corroboration.
- **Ownership independence** — the RSS catalog already tags `independent` / `public-broadcaster` / `state-media` / `state-official`. Two outlets under one owner are one source.
- **Temporal independence** — a report appearing after another, containing no new detail, is downstream of it.

Output: a **corroboration count that discounts derivative sources**, with the discount stated.

### 2.2 Provenance — trace to the earliest appearance

SIFT's "trace claims to the original." A claim's first appearance, and the path it travelled, is often more informative than its content.

**Computable now** from timestamps plus near-duplicate clustering: first-seen record, propagation order, cross-platform jump times. This is also what makes `causedBy` in the Fold emission legitimate — a provenance edge is *observed* ordering with evidence, not an inferred cause.

### 2.3 Primary vs secondary sourcing

An eyewitness account, a court filing, and an aggregator's summary of a summary are not equivalent evidence. Source type must be recorded and must weight the assessment.

### 2.4 Lateral reading

Assess a source by what *other* independent sources say about it, not by its own presentation. Structurally: source credibility should derive from the network position and corroboration record, not from on-page signals.

---

## 3. Data-science method, encoded

### 3.1 Base rates and null models

The single most important requirement, and the one most consistently missing. Every co-occurrence claim needs a reference distribution: shuffle or resample to build the null, then report how far the observation sits from it.

Applies to: causal correlation, coordination detection, burst detection, anomaly scoring. **One engine, four consumers** — see §6.

### 3.2 Effect size, reported separately from significance

With enough data everything is significant. Rank by effect size; report both.

### 3.3 Multiple-comparison control

Testing N narratives × M signals and keeping the best is guaranteed to produce a spurious winner. Benjamini–Hochberg FDR, and the number of tests performed is part of the output.

### 3.4 Intercoder reliability — the rigorous answer to "the LLM said so"

Content analysis has solved this problem for decades. You define a **codebook**, have multiple coders label the same material, and measure agreement (Krippendorff's α, Cohen's κ). Agreement below threshold means the construct is not reliably codable — a finding in itself.

**This is how an LLM becomes legitimate here.** Treat it as *one coder in a coding protocol*, measure its agreement against a human-labelled subset, and report α alongside the labels. That converts "the model asserted scapegoating" into "a coder with measured α = 0.71 against human labels asserted scapegoating." One is an opinion; the other is an instrument.

It also makes model swaps safe: re-run the protocol, compare α. Exactly what the stance corpus already does for stance.

### 3.5 Concentration and distribution measures

Coordination and inauthenticity show up as distributional anomalies, not as any individual post: source concentration (Gini / Herfindahl over authors), inter-arrival time distributions, lexical convergence across a corpus, duplicate rate.

---

## 4. The LLM's proper role

Legitimate:

- **Coder** in a codebook protocol, with measured reliability (§3.4).
- **Extractor** of structured spans — claims, entities, quotes — where output is verified against source text. Grounding already drops fabricated quotes; that pattern is correct and should be universal.
- **Explainer** of a finding the deterministic layer already established.
- **Hypothesis generator** whose suggestions are then tested by the deterministic layer — never surfaced untested. (`llm-hypothesis.adapter` is correctly opt-in for this reason.)

Not legitimate:

- Sole arbiter of whether something *is* propaganda, coordination, or causation.
- Source of a confidence number. Self-reported confidence is not calibrated; `overall_confidence` in the causal tools is exactly this mistake.
- Any path where a malformed response is indistinguishable from a negative finding. Silence must be `unavailable`, never "nothing found."

---

## 5. Worked example: propaganda, rebuilt

### 5.1 What is wrong today

`propaganda.service.ts` samples **12 posts per narrative** (`MAX_POSTS_PER_NARRATIVE`) into a single LLM call.

The sampling is stratified and deterministic, quotes are grounded against source text, and `analysisMode` is stamped — all genuinely good. But the architecture is category-wrong, because **propaganda is a campaign property, not a text property.**

Repetition, coordination, source concentration, synchronised timing, and framing consistency exist in the *distribution over all posts*. Sampling twelve destroys precisely the signal that distinguishes a campaign from a topic people happen to be discussing. No prompt, however good, can recover it — the information is not in the sample.

A single post can exhibit *rhetoric*. Only a corpus can exhibit *propaganda*.

### 5.2 The three-layer replacement

**Layer 1 — deterministic corpus statistics.** Over ALL posts, never a sample. Each with a base-rate comparison:

| Signal | Method | Data available today |
|---|---|---|
| Repetition / template reuse | near-duplicate clustering, TF-IDF cosine | `text` ✅ |
| Lexical convergence | vocabulary overlap vs baseline for topic | `text` ✅ |
| Temporal synchrony | inter-arrival distribution, burst detection | `timestamp` ✅ |
| Source concentration | Gini / Herfindahl over authors | `authorHandle` ✅ |
| Infrastructure reuse | shared domains, shorteners, media URLs | `url`, `media` ✅ |
| Cross-platform propagation | first-seen ordering, jump latency | `platform` + `timestamp` ✅ |
| Framing consistency | entity/theme distribution vs baseline | `themes`, `entities` ✅ |
| Corroboration independence | §2.1 discounting | `feedOwnership` + duplicates ✅ |

Every one is computable from data already stored. None needs an LLM.

**Layer 2 — LLM as coder.** SemEval-2020 Task 11 technique labelling with verbatim-quote grounding (already built), reframed as a coding protocol with measured α against a human-labelled subset.

**Layer 3 — aggregation.** Campaign-level assessment combining Layer 1 statistics with Layer 2 labels, emitting evidence and abstaining when thin. `manipulationLikelihood` becomes a function of measured distributional anomaly, not a model's adjective.

### 5.3 Honest constraint

We have no platform interaction graph today — the only modelled edges are `CO_NARRATIVE` and `CO_TIMED`. Co-activity networks built from co-timing, co-URL and co-duplicate-text are the right substitute, and are what the coordination literature actually uses.

But this is a CAPTURE GAP, not a hard limit, and the first draft of this doc overstated it. We store interaction COUNTS (`repostCount`, `replyCount`) and discard the EDGES — which several platforms do expose: AT Proto returns `reply.parent.uri` on every post, Reddit returns `parent_id`, 4chan has `>>` references, Farcaster casts carry parent refs. `SocialMediaPost` simply has no field to put them in. Real amplification cascades are one capture change away for those four.

Telegram is the genuine exception: forwards are not available via the web-preview approach its connector uses.

---

## 6. Build order

The base-rate engine is the dependency for almost everything above. It is one piece of machinery with four consumers:

1. **Base-rate / null-model engine** — over `global_event_archive` (24.7k no-TTL rows) and scan corpora. Empirical matched-window sampling first; permutation tests when series are dense.
2. **Corpus statistics library** — §5.2 Layer 1. Pure functions, no I/O, trivially testable.
3. **Propaganda rebuild** on 1 + 2.
4. **Coordination detection** on 1 + 2 (analysis-quality-plan Phase D).
5. **Causal inference** on 1 (causal-inference-layer Phases 1–2).
6. **Calibration** of bot/anomaly scores against a labelled dataset (Phase F).

Items 3–6 are the same two components wearing different hats. That is the argument for building them properly once.

---

## 7. What this doc governs

Any new detection capability, and any rewrite of an existing one, must state in its PR:

- the established method it implements (cite it),
- its base rate and how it was computed,
- its evidence output — quotable and traceable,
- its abstention condition,
- its corpus and current score.

"An LLM assessed it" satisfies none of these on its own.
