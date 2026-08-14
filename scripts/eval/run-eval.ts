#!/usr/bin/env npx tsx
/**
 * Ground-truth evaluation harness.
 *
 * Runs each capability against a labelled corpus and reports precision /
 * recall / F1. Exists because this system's characteristic failure is being
 * CONFIDENTLY WRONG: the two real relevance bugs found in 2026-08 both
 * produced plausible-looking output and passed the unit suite. Unit tests
 * check that code does what it was written to do; this checks whether the
 * behaviour is actually correct against cases a human labelled.
 *
 * Usage:
 *   pnpm eval                 # run all suites, print a report
 *   pnpm eval --json          # machine-readable output
 *   pnpm eval --check         # exit 1 if any suite regressed vs baseline.json
 *   pnpm eval --update-baseline
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeMetrics, failures, formatPct, type Metrics } from './metrics';
import { SUITES } from './suites';

const BASELINE_PATH = join(__dirname, 'baseline.json');

interface SuiteResult {
  name: string;
  positiveMeans: string;
  metrics: Metrics;
  failed: Array<{ id: string; expected: boolean; actual: boolean; note?: string }>;
  /** True when the suite could not run here (e.g. no API key). */
  skipped?: boolean;
  skipReason?: string;
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const results: SuiteResult[] = [];

  for (const suite of SUITES) {
    if (suite.available && !suite.available()) {
      results.push({
        name: suite.name,
        positiveMeans: suite.positiveMeans,
        metrics: computeMetrics([]),
        failed: [],
        skipped: true,
        skipReason: suite.unavailableReason ?? 'unavailable in this environment',
      });
      continue;
    }
    const predictions = await suite.run();
    results.push({
      name: suite.name,
      positiveMeans: suite.positiveMeans,
      metrics: computeMetrics(predictions),
      failed: failures(predictions).map((f) => ({
        id: f.id,
        expected: f.expected,
        actual: f.actual,
        note: f.note,
      })),
    });
  }

  if (args.has('--json')) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    report(results);
  }

  if (args.has('--update-baseline')) {
    const baseline = Object.fromEntries(
      results
        .filter((r) => !r.skipped)
        .map((r) => [r.name, { f1: r.metrics.f1, accuracy: r.metrics.accuracy }]),
    );
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`\nBaseline written to ${BASELINE_PATH}`);
    return;
  }

  if (args.has('--check')) {
    process.exitCode = checkAgainstBaseline(results) ? 0 : 1;
  }
}

function report(results: SuiteResult[]): void {
  console.log('\nGround-truth evaluation\n');
  const head = `${'suite'.padEnd(24)}${'cases'.padStart(6)}${'prec'.padStart(8)}${'recall'.padStart(8)}${'F1'.padStart(8)}${'acc'.padStart(8)}`;
  console.log(head);
  console.log('-'.repeat(head.length));

  for (const r of results) {
    if (r.skipped) {
      console.log(`${r.name.padEnd(24)}${'SKIPPED'.padStart(6)}   ${r.skipReason}`);
      continue;
    }
    const m = r.metrics;
    console.log(
      r.name.padEnd(24) +
        String(m.total).padStart(6) +
        formatPct(m.precision).padStart(8) +
        formatPct(m.recall).padStart(8) +
        formatPct(m.f1).padStart(8) +
        formatPct(m.accuracy).padStart(8),
    );
  }

  for (const r of results) {
    if (r.failed.length === 0) continue;
    console.log(`\n  ${r.name} — ${r.failed.length} incorrect (positive = ${r.positiveMeans}):`);
    for (const f of r.failed) {
      console.log(`    ✗ ${f.id}: expected ${f.expected}, got ${f.actual}`);
      if (f.note) console.log(`        ${f.note}`);
    }
  }

  const skipped = results.filter((r) => r.skipped);
  if (skipped.length > 0) {
    console.log(
      `\n${skipped.length} suite(s) skipped — those capabilities are NOT verified by this run.`,
    );
  }

  const totalFailed = results.reduce((n, r) => n + r.failed.length, 0);
  console.log(
    totalFailed === 0
      ? '\nAll labelled cases correct.\n'
      : `\n${totalFailed} labelled case(s) incorrect.\n`,
  );
}

/** True when nothing regressed. A tolerance avoids float-noise flapping. */
function checkAgainstBaseline(results: SuiteResult[]): boolean {
  let baseline: Record<string, { f1: number; accuracy: number }>;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    console.error('No baseline.json — run with --update-baseline first.');
    return false;
  }

  let ok = true;
  const TOLERANCE = 1e-9;
  for (const r of results) {
    if (r.skipped) continue;
    const prior = baseline[r.name];
    if (!prior) {
      console.log(`  (new suite "${r.name}" — not in baseline)`);
      continue;
    }
    // NaN F1 (no positive labels) falls back to accuracy.
    const now = Number.isNaN(r.metrics.f1) ? r.metrics.accuracy : r.metrics.f1;
    const was = Number.isNaN(prior.f1) ? prior.accuracy : prior.f1;
    if (now + TOLERANCE < was) {
      console.error(
        `REGRESSION in ${r.name}: ${(was * 100).toFixed(1)}% -> ${(now * 100).toFixed(1)}%`,
      );
      ok = false;
    }
  }
  if (ok) console.log('No regressions against baseline.');
  return ok;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
