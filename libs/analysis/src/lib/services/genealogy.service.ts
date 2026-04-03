import { Injectable, Logger } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NarrativeLineage {
  currentId: string;
  currentSummary: string;
  /** History of this narrative across snapshots */
  history: Array<{
    snapshotId: string;
    snapshotTimestamp: string;
    narrativeId: string;
    summary: string;
    postCount: number;
    avgSentiment: number;
    similarity: number; // how similar to current (1.0 = same narrative)
  }>;
  /** Evolution events */
  events: Array<{
    timestamp: string;
    type: 'emerged' | 'grew' | 'shrank' | 'split' | 'merged' | 'died';
    description: string;
  }>;
  /** Status */
  status: 'active' | 'growing' | 'stable' | 'fading' | 'died';
}

export interface SnapshotNarrative {
  id: string;
  summary: string;
  centroidEmbedding: number[];
  postCount: number;
  avgSentiment: number;
}

export interface NarrativeSnapshot {
  id: string;
  timestamp: string;
  narratives: SnapshotNarrative[];
}

export interface GenealogyResponse {
  lineages: NarrativeLineage[];
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const SAME_NARRATIVE_THRESHOLD = 0.7;
const POSSIBLE_BRANCH_THRESHOLD = 0.4;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class NarrativeGenealogyService {
  private readonly logger = new Logger(NarrativeGenealogyService.name);

  /**
   * Compare narratives across two snapshots using centroid embedding similarity.
   * - Similarity > 0.7 = same narrative evolved
   * - Similarity 0.4-0.7 = possible branch/merge
   * - Below 0.4 = new/died
   */
  traceLineage(
    previousNarratives: SnapshotNarrative[],
    currentNarratives: SnapshotNarrative[],
    snapshotTimestamp: string,
  ): NarrativeLineage[] {
    const lineages: NarrativeLineage[] = [];
    const matchedPrevious = new Set<string>();

    for (const current of currentNarratives) {
      // Find best match in previous snapshot
      let bestMatch: SnapshotNarrative | null = null;
      let bestSimilarity = -1;

      for (const prev of previousNarratives) {
        if (matchedPrevious.has(prev.id)) continue;
        const sim = this.cosineSimilarity(current.centroidEmbedding, prev.centroidEmbedding);
        if (sim > bestSimilarity) {
          bestSimilarity = sim;
          bestMatch = prev;
        }
      }

      const events: NarrativeLineage['events'] = [];
      const history: NarrativeLineage['history'] = [];

      if (bestMatch && bestSimilarity >= SAME_NARRATIVE_THRESHOLD) {
        // Strong match: same narrative evolved
        matchedPrevious.add(bestMatch.id);
        history.push({
          snapshotId: 'previous',
          snapshotTimestamp,
          narrativeId: bestMatch.id,
          summary: bestMatch.summary,
          postCount: bestMatch.postCount,
          avgSentiment: bestMatch.avgSentiment,
          similarity: bestSimilarity,
        });

        // Detect evolution events
        if (current.postCount > bestMatch.postCount * 1.3) {
          events.push({
            timestamp: snapshotTimestamp,
            type: 'grew',
            description: `Post count increased from ${bestMatch.postCount} to ${current.postCount}`,
          });
        } else if (current.postCount < bestMatch.postCount * 0.7) {
          events.push({
            timestamp: snapshotTimestamp,
            type: 'shrank',
            description: `Post count decreased from ${bestMatch.postCount} to ${current.postCount}`,
          });
        }
      } else if (bestMatch && bestSimilarity >= POSSIBLE_BRANCH_THRESHOLD) {
        // Possible branch/merge
        matchedPrevious.add(bestMatch.id);
        history.push({
          snapshotId: 'previous',
          snapshotTimestamp,
          narrativeId: bestMatch.id,
          summary: bestMatch.summary,
          postCount: bestMatch.postCount,
          avgSentiment: bestMatch.avgSentiment,
          similarity: bestSimilarity,
        });
        events.push({
          timestamp: snapshotTimestamp,
          type: 'split',
          description: `Narrative diverged from "${bestMatch.summary}" (similarity: ${bestSimilarity.toFixed(2)})`,
        });
      } else {
        // New narrative
        events.push({
          timestamp: snapshotTimestamp,
          type: 'emerged',
          description: `New narrative emerged: "${current.summary}"`,
        });
      }

      const status = this.determineStatus(current, bestMatch, bestSimilarity);

      lineages.push({
        currentId: current.id,
        currentSummary: current.summary,
        history,
        events,
        status,
      });
    }

    // Check for died narratives (previous with no match)
    for (const prev of previousNarratives) {
      if (!matchedPrevious.has(prev.id)) {
        lineages.push({
          currentId: prev.id,
          currentSummary: prev.summary,
          history: [
            {
              snapshotId: 'previous',
              snapshotTimestamp,
              narrativeId: prev.id,
              summary: prev.summary,
              postCount: prev.postCount,
              avgSentiment: prev.avgSentiment,
              similarity: 1.0,
            },
          ],
          events: [
            {
              timestamp: snapshotTimestamp,
              type: 'died',
              description: `Narrative no longer detected: "${prev.summary}"`,
            },
          ],
          status: 'died',
        });
      }
    }

    return lineages;
  }

  /**
   * Build full genealogy from multiple snapshots.
   * Processes snapshots in chronological order, chaining lineage across pairs.
   */
  buildFullGenealogy(snapshots: NarrativeSnapshot[]): NarrativeLineage[] {
    if (snapshots.length === 0) return [];
    if (snapshots.length === 1) {
      // Single snapshot: all narratives are newly emerged
      return snapshots[0]!.narratives.map((n) => ({
        currentId: n.id,
        currentSummary: n.summary,
        history: [
          {
            snapshotId: snapshots[0]!.id,
            snapshotTimestamp: snapshots[0]!.timestamp,
            narrativeId: n.id,
            summary: n.summary,
            postCount: n.postCount,
            avgSentiment: n.avgSentiment,
            similarity: 1.0,
          },
        ],
        events: [
          {
            timestamp: snapshots[0]!.timestamp,
            type: 'emerged' as const,
            description: `Narrative first seen: "${n.summary}"`,
          },
        ],
        status: 'active' as const,
      }));
    }

    // Sort snapshots chronologically
    const sorted = [...snapshots].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    // Start from the first snapshot
    // Track lineage chains: narrative key -> accumulated lineage
    // Key is the current narrative id in the latest processed snapshot
    let activeLineages = new Map<string, NarrativeLineage>();

    // Initialize from first snapshot
    const firstSnap = sorted[0]!;
    for (const n of firstSnap.narratives) {
      activeLineages.set(n.id, {
        currentId: n.id,
        currentSummary: n.summary,
        history: [
          {
            snapshotId: firstSnap.id,
            snapshotTimestamp: firstSnap.timestamp,
            narrativeId: n.id,
            summary: n.summary,
            postCount: n.postCount,
            avgSentiment: n.avgSentiment,
            similarity: 1.0,
          },
        ],
        events: [
          {
            timestamp: firstSnap.timestamp,
            type: 'emerged',
            description: `Narrative first seen: "${n.summary}"`,
          },
        ],
        status: 'active',
      });
    }

    // Process subsequent snapshots
    for (let s = 1; s < sorted.length; s++) {
      const prevSnap = sorted[s - 1]!;
      const currSnap = sorted[s]!;

      const newActiveLineages = new Map<string, NarrativeLineage>();
      const matchedPrevIds = new Set<string>();

      // For each current narrative, find best match in previous
      for (const current of currSnap.narratives) {
        let bestPrevId: string | null = null;
        let bestSimilarity = -1;

        for (const prev of prevSnap.narratives) {
          if (matchedPrevIds.has(prev.id)) continue;
          const sim = this.cosineSimilarity(current.centroidEmbedding, prev.centroidEmbedding);
          if (sim > bestSimilarity) {
            bestSimilarity = sim;
            bestPrevId = prev.id;
          }
        }

        if (bestPrevId && bestSimilarity >= SAME_NARRATIVE_THRESHOLD) {
          matchedPrevIds.add(bestPrevId);
          // Continue existing lineage
          const existingLineage = activeLineages.get(bestPrevId);
          const prevNarrative = prevSnap.narratives.find((n) => n.id === bestPrevId);

          const history = existingLineage
            ? [...existingLineage.history]
            : [];

          history.push({
            snapshotId: currSnap.id,
            snapshotTimestamp: currSnap.timestamp,
            narrativeId: current.id,
            summary: current.summary,
            postCount: current.postCount,
            avgSentiment: current.avgSentiment,
            similarity: bestSimilarity,
          });

          const events = existingLineage
            ? [...existingLineage.events]
            : [];

          // Detect evolution
          if (prevNarrative && current.postCount > prevNarrative.postCount * 1.3) {
            events.push({
              timestamp: currSnap.timestamp,
              type: 'grew',
              description: `Post count increased from ${prevNarrative.postCount} to ${current.postCount}`,
            });
          } else if (prevNarrative && current.postCount < prevNarrative.postCount * 0.7) {
            events.push({
              timestamp: currSnap.timestamp,
              type: 'shrank',
              description: `Post count decreased from ${prevNarrative.postCount} to ${current.postCount}`,
            });
          }

          const status = this.determineStatus(current, prevNarrative ?? null, bestSimilarity);

          newActiveLineages.set(current.id, {
            currentId: current.id,
            currentSummary: current.summary,
            history,
            events,
            status,
          });
        } else if (bestPrevId && bestSimilarity >= POSSIBLE_BRANCH_THRESHOLD) {
          matchedPrevIds.add(bestPrevId);
          const existingLineage = activeLineages.get(bestPrevId);
          const prevNarrative = prevSnap.narratives.find((n) => n.id === bestPrevId);

          const history = existingLineage ? [...existingLineage.history] : [];
          history.push({
            snapshotId: currSnap.id,
            snapshotTimestamp: currSnap.timestamp,
            narrativeId: current.id,
            summary: current.summary,
            postCount: current.postCount,
            avgSentiment: current.avgSentiment,
            similarity: bestSimilarity,
          });

          const events = existingLineage ? [...existingLineage.events] : [];
          events.push({
            timestamp: currSnap.timestamp,
            type: 'split',
            description: `Narrative diverged from "${prevNarrative?.summary ?? bestPrevId}" (similarity: ${bestSimilarity.toFixed(2)})`,
          });

          newActiveLineages.set(current.id, {
            currentId: current.id,
            currentSummary: current.summary,
            history,
            events,
            status: 'active',
          });
        } else {
          // New narrative
          newActiveLineages.set(current.id, {
            currentId: current.id,
            currentSummary: current.summary,
            history: [
              {
                snapshotId: currSnap.id,
                snapshotTimestamp: currSnap.timestamp,
                narrativeId: current.id,
                summary: current.summary,
                postCount: current.postCount,
                avgSentiment: current.avgSentiment,
                similarity: 1.0,
              },
            ],
            events: [
              {
                timestamp: currSnap.timestamp,
                type: 'emerged',
                description: `New narrative emerged: "${current.summary}"`,
              },
            ],
            status: 'active',
          });
        }
      }

      // Mark unmatched previous narratives as died (only in final results)
      if (s === sorted.length - 1) {
        for (const prev of prevSnap.narratives) {
          if (!matchedPrevIds.has(prev.id)) {
            const existingLineage = activeLineages.get(prev.id);
            const history = existingLineage ? [...existingLineage.history] : [];
            const events = existingLineage ? [...existingLineage.events] : [];
            events.push({
              timestamp: currSnap.timestamp,
              type: 'died',
              description: `Narrative no longer detected: "${prev.summary}"`,
            });

            newActiveLineages.set(`died-${prev.id}`, {
              currentId: prev.id,
              currentSummary: prev.summary,
              history,
              events,
              status: 'died',
            });
          }
        }
      }

      activeLineages = newActiveLineages;
    }

    const result = Array.from(activeLineages.values());
    this.logger.log(
      `Built genealogy: ${result.length} lineages across ${snapshots.length} snapshots`,
    );
    return result;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private determineStatus(
    current: SnapshotNarrative,
    previous: SnapshotNarrative | null,
    similarity: number,
  ): NarrativeLineage['status'] {
    if (similarity < POSSIBLE_BRANCH_THRESHOLD) return 'active'; // new narrative
    if (!previous) return 'active';

    const growthRatio = current.postCount / Math.max(previous.postCount, 1);

    if (growthRatio > 1.3) return 'growing';
    if (growthRatio < 0.5) return 'fading';
    return 'stable';
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      const ai = a[i] ?? 0;
      const bi = b[i] ?? 0;
      dot += ai * bi;
      normA += ai * ai;
      normB += bi * bi;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
