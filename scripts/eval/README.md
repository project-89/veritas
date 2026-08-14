# Ground-truth evaluation harness

Measures whether analysis capabilities are actually **correct**, against cases a
human labelled — as opposed to the unit suite, which checks that code does what
it was written to do.

That distinction is the whole point. This system's characteristic failure is
being *confidently wrong*: producing plausible, well-formed, entirely incorrect
output. Two real relevance bugs found in August 2026 both passed the full unit
suite while silently corrupting results:

- `extractTopics` shattered `"préférentiels"` into `pr` / `f` / `rentiels` and
  surfaced the fragments as topics; non-Latin text produced *zero* topics while
  looking like a successful classification.
- `matchesQuery` extracted zero terms from any non-Latin query, and since "no
  significant terms" means "match everything", relevance filtering was silently
  **disabled** in four connectors.

Neither was catchable by a unit test, because the code did exactly what it said.

## Usage

```bash
pnpm eval                 # run all suites, print precision / recall / F1
pnpm eval:check           # exit 1 if any suite regressed against baseline.json
tsx scripts/eval/run-eval.ts --json
tsx scripts/eval/run-eval.ts --update-baseline
```

`--check` is the CI-facing entry point. It compares F1 (falling back to accuracy
when F1 is undefined) against `baseline.json` and fails on any drop.

## Layout

```
scripts/eval/
  run-eval.ts       runner, reporting, baseline comparison
  metrics.ts        precision / recall / F1 (pure, dependency-free)
  suites.ts         one entry per capability
  baseline.json     recorded scores, regenerate with --update-baseline
  corpora/*.jsonl   labelled cases, one JSON object per line
```

## Adding a case

Append a line to the relevant corpus. Every case needs a stable `id` and a
`note` explaining *why* it is labelled that way — a corpus without rationale
rots into unjustifiable expectations. Cases drawn from real incidents should say
so; several here are verbatim posts from the contaminated 2026-07-10 scan.

## Adding a suite

Export a `Suite` from `suites.ts` with a `run()` returning `Prediction[]`, and
add it to `SUITES`.

Prefer **offline and deterministic** suites — no network, no API keys — because
only those can gate CI unconditionally. A suite that needs a key must declare
`available()` and `unavailableReason` so it reports SKIPPED rather than
silently passing (see *LLM-backed suites* below).

## Coverage, and what is deliberately missing

| Capability | Status |
|---|---|
| Query relevance (`matchesQuery`) | ✅ 18 cases, offline |
| Language abstention (topic/entity extraction) | ✅ 9 cases, offline |
| Stance classification | ✅ 22 cases, **needs `GEMINI_API_KEY`** — skipped without one |
| Stance opposition (the split decision) | ✅ 46 pairs, **needs `GEMINI_API_KEY`** — skipped without one |
| Bot detection | ❌ not covered |
| Propaganda detection | ❌ not covered |
| Claim verification | ❌ not covered |
| Causal inference | ❌ blocked — layer not built (see `docs/development/causal-inference-layer.md` §7) |

The first two are deterministic and offline, which is why they exist first:
they gate CI at zero cost, and they are where the known bugs were. The stance
suites need a key and are skipped without one.

The three uncovered capabilities are all LLM-dependent. Bot detection in
particular should be validated against a public labelled dataset rather than
hand-written cases, since calibration is the goal there (see the analysis
quality plan, Phase F). **Do not read a green run as "analysis quality is
verified."** It means the capabilities that actually ran did not regress —
check the SKIPPED lines before concluding anything else.

## A caution, learned here

The first version of the language suite stubbed the `franc-min` module
directly. That stub **silently did nothing** — an ESM namespace object is
frozen, so the assignment was a no-op and the forced-misdetection cases were
passing for the wrong reason. A measurement tool that is quietly broken is
worse than no tool, because it manufactures confidence.

The suite now overrides the service's own `detectLanguage` method, which is a
seam we control. Prefer seams you own over patching third-party modules, and
verify a stub actually took effect before trusting a green result.

## LLM-backed suites

The stance suites call Gemini and are SKIPPED without an API key — reported as
`SKIPPED`, never silently passed, so a green CI run without a key does not
imply they were verified. `--check` compares only suites that actually ran.

They are stable in practice (temperature 0, verified identical across three
consecutive fresh-process runs) but they cost tokens and need network, so they
cannot gate CI the way the offline suites do.

## Findings so far

- **Malformed LLM JSON silently voiding whole batches** — gemini-3.x JSON mode
  intermittently emits a truncated object (missing the outer `}`) or an extra
  trailing `}`, *with `finishReason: STOP`*, so nothing signals an error.
  `extractFirstJsonObject` requires balance, found none, and returned null —
  which the stance service could not distinguish from "the model found
  nothing". Every post in the batch became `unclear`, silently reverting
  clustering to similarity-only. This is why stance scored 100% on one run and
  68% on the next. Fixed with `parseLlmJsonObject` (repairs both shapes) plus a
  `stanceSource: 'unavailable'` flag so the degradation is visible.
  **The intermittency is the lesson: a single green run proves nothing about a
  non-deterministic dependency.**

- **`ru-forced-en`** — non-Latin script was only checked *after* the detector
  returned a non-English verdict. Since `detectLanguage()` returns `'en'` for
  any text under 10 characters, short Cyrillic posts reached the English
  pipeline and emitted Cyrillic tokens as "topics" while reporting language
  `'en'`. Fixed by making script evidence stand on its own.
