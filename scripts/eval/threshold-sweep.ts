#!/usr/bin/env npx tsx
/**
 * Sweep the narrative clustering similarity threshold against real scan data.
 *
 * The threshold was an inline `0.75` with a comment asserting it produced good
 * clusters. Nothing measured that. This prints the actual curve — how cluster
 * count, average cluster size and the unclustered share move as the threshold
 * changes — so the default is a choice with evidence behind it.
 *
 * It deliberately reports the SHAPE rather than declaring a winner. There is
 * no labelled "these two posts belong together" corpus yet, so this cannot say
 * which threshold is most correct; it can only show where the behaviour
 * changes sharply and where it is flat. Read it as a diagnostic, not an
 * optimiser.
 *
 * Usage:
 *   tsx scripts/eval/threshold-sweep.ts <scanId> [stanceTarget]
 */

import { ConfigService } from '@nestjs/config';
import { NarrativeAnalysisService } from '../../libs/analysis/src/lib/services/narrative-analysis.service';

const THRESHOLDS = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9];

interface StoredPost {
  text: string;
  platform: string;
  authorName?: string;
  authorHandle?: string;
  timestamp: string;
  sentiment?: { score: number; label: string };
  engagement?: { likes: number; comments: number; shares: number };
}

async function loadPosts(scanId: string): Promise<StoredPost[]> {
  const { MongoClient } = await import('mongodb');
  const uri = process.env['MONGODB_URI'];
  if (!uri) throw new Error('MONGODB_URI not set');
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const docs = await client
      .db()
      .collection('scan_posts')
      .find({ scanId })
      .sort({ seq: 1 })
      .toArray();
    return docs.map((d) => {
      const p = (d as unknown as { post: Record<string, unknown> }).post;
      return {
        text: String(p['text'] ?? ''),
        platform: String(p['platform'] ?? 'unknown'),
        authorName: String(p['authorName'] ?? 'a'),
        authorHandle: String(p['authorHandle'] ?? 'a'),
        timestamp: String(p['timestamp'] ?? new Date().toISOString()),
        sentiment: p['sentiment'] as StoredPost['sentiment'],
        engagement: p['engagement'] as StoredPost['engagement'],
      };
    });
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  const scanId = process.argv[2];
  const stanceTarget = process.argv[3];
  if (!scanId) {
    console.error('Usage: tsx scripts/eval/threshold-sweep.ts <scanId> [stanceTarget]');
    process.exitCode = 1;
    return;
  }

  const posts = await loadPosts(scanId);
  console.log(`\nScan ${scanId}: ${posts.length} posts`);
  if (stanceTarget) console.log(`Stance target: "${stanceTarget}"`);

  const service = new NarrativeAnalysisService({
    get: (k: string) => process.env[k],
  } as unknown as ConfigService);

  console.log(
    `\n${'thresh'.padStart(7)}${'narratives'.padStart(12)}${'clustered'.padStart(11)}${'unclustered'.padStart(13)}${'avg size'.padStart(10)}`,
  );
  console.log('-'.repeat(53));

  for (const t of THRESHOLDS) {
    const result = await service.analyze(posts, {
      similarityThreshold: t,
      ...(stanceTarget ? { stanceTarget } : {}),
    });
    const n = result.narratives.length;
    const clustered = result.narratives.reduce((sum, x) => sum + x.postIndices.length, 0);
    const unclustered = result.unclustered.length;
    const avg = n === 0 ? 0 : clustered / n;
    console.log(
      `${t.toFixed(2).padStart(7)}${String(n).padStart(12)}${String(clustered).padStart(11)}${String(unclustered).padStart(13)}${avg.toFixed(1).padStart(10)}`,
    );
  }

  console.log(
    '\nRead the shape, not a winner: look for where cluster count changes sharply\n' +
      '(over-merging below, fragmentation above) and prefer a flat region.\n' +
      'A labelled same-narrative pair corpus is what would turn this into a\n' +
      'real optimisation — see docs/development/analysis-quality-plan.md §5.\n',
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
