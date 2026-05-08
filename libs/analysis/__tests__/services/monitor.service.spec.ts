import { Test, TestingModule } from '@nestjs/testing';
import { MonitorService } from '../../src/lib/services/monitor.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(
  overrides: {
    postCount?: number;
    narrativeCount?: number;
    narratives?: Array<{
      summary?: string;
      postIndices?: number[];
      avgSentiment?: number;
      platforms?: Record<string, number>;
      velocity?: { postsPerHour: number; acceleration?: number; trend?: string };
    }>;
    summary?: {
      total: number;
      positive: number;
      negative: number;
      neutral: number;
      byPlatform: Record<string, number>;
    };
  } = {},
) {
  const narratives = overrides.narratives ?? [];
  return {
    postCount: overrides.postCount ?? 10,
    narrativeCount: overrides.narrativeCount ?? narratives.length,
    summary: overrides.summary ?? {
      total: overrides.postCount ?? 10,
      positive: 3,
      negative: 3,
      neutral: 4,
      byPlatform: { twitter: 5, reddit: 5 },
    },
    narratives,
  };
}

const DEFAULT_THRESHOLDS = {
  velocityMultiplier: 2.0,
  sentimentShift: 0.3,
  minNewNarrativePosts: 3,
};

const INVESTIGATION_ID = 'inv-123';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MonitorService', () => {
  let service: MonitorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MonitorService],
    }).compile();

    service = module.get(MonitorService);
  });

  // -------------------------------------------------------------------------
  // compareSnapshots — new narratives
  // -------------------------------------------------------------------------

  describe('new narrative detection', () => {
    it('should detect a new narrative that was not in the previous snapshot', () => {
      const previous = makeSnapshot({
        narratives: [
          {
            summary: 'Climate change is accelerating',
            postIndices: [0, 1, 2],
            avgSentiment: -0.3,
            platforms: { twitter: 3 },
            velocity: { postsPerHour: 5 },
          },
        ],
      });

      const current = makeSnapshot({
        narratives: [
          {
            summary: 'Climate change is accelerating',
            postIndices: [0, 1, 2],
            avgSentiment: -0.3,
            platforms: { twitter: 3 },
            velocity: { postsPerHour: 5 },
          },
          {
            summary: 'New carbon capture technology announced',
            postIndices: [3, 4, 5],
            avgSentiment: 0.5,
            platforms: { reddit: 3 },
            velocity: { postsPerHour: 3 },
          },
        ],
      });

      const alerts = service.compareSnapshots(
        previous,
        current,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      const newNarrativeAlerts = alerts.filter((a) => a.type === 'new_narrative');
      expect(newNarrativeAlerts).toHaveLength(1);
      expect(newNarrativeAlerts[0]!.description).toContain(
        'New carbon capture technology announced',
      );
    });

    it('should not alert for narratives below the minNewNarrativePosts threshold', () => {
      const previous = makeSnapshot({ narratives: [] });
      const current = makeSnapshot({
        narratives: [
          {
            summary: 'Tiny narrative',
            postIndices: [0, 1], // only 2, threshold is 3
            avgSentiment: 0,
            platforms: { twitter: 2 },
            velocity: { postsPerHour: 1 },
          },
        ],
      });

      const alerts = service.compareSnapshots(
        previous,
        current,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      expect(alerts.filter((a) => a.type === 'new_narrative')).toHaveLength(0);
    });

    it('should not alert for narratives that already existed', () => {
      const narrative = {
        summary: 'Same old narrative',
        postIndices: [0, 1, 2, 3],
        avgSentiment: 0.1,
        platforms: { twitter: 4 },
        velocity: { postsPerHour: 2 },
      };

      const previous = makeSnapshot({ narratives: [narrative] });
      const current = makeSnapshot({ narratives: [narrative] });

      const alerts = service.compareSnapshots(
        previous,
        current,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      expect(alerts.filter((a) => a.type === 'new_narrative')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // compareSnapshots — velocity spikes
  // -------------------------------------------------------------------------

  describe('velocity spike detection', () => {
    it('should detect a velocity spike above the multiplier threshold', () => {
      const previous = makeSnapshot({
        narratives: [
          {
            summary: 'Trending topic',
            postIndices: [0, 1, 2],
            avgSentiment: 0.1,
            platforms: { twitter: 3 },
            velocity: { postsPerHour: 5 },
          },
        ],
      });

      const current = makeSnapshot({
        narratives: [
          {
            summary: 'Trending topic',
            postIndices: [0, 1, 2, 3, 4, 5],
            avgSentiment: 0.1,
            platforms: { twitter: 6 },
            velocity: { postsPerHour: 15 }, // 3x the previous
          },
        ],
      });

      const alerts = service.compareSnapshots(
        previous,
        current,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      const spikeAlerts = alerts.filter((a) => a.type === 'velocity_spike');
      expect(spikeAlerts).toHaveLength(1);
      expect(spikeAlerts[0]!.severity).toBe('warning');
    });

    it('should mark extreme velocity spikes as critical', () => {
      const previous = makeSnapshot({
        narratives: [
          {
            summary: 'Breaking news',
            postIndices: [0],
            avgSentiment: 0,
            platforms: { twitter: 1 },
            velocity: { postsPerHour: 2 },
          },
        ],
      });

      const current = makeSnapshot({
        narratives: [
          {
            summary: 'Breaking news',
            postIndices: [0, 1, 2, 3, 4, 5, 6, 7],
            avgSentiment: 0,
            platforms: { twitter: 8 },
            velocity: { postsPerHour: 10 }, // 5x = above 2 * multiplier(2) = 4
          },
        ],
      });

      const alerts = service.compareSnapshots(
        previous,
        current,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      const spikeAlerts = alerts.filter((a) => a.type === 'velocity_spike');
      expect(spikeAlerts).toHaveLength(1);
      expect(spikeAlerts[0]!.severity).toBe('critical');
    });

    it('should not alert when velocity increase is below threshold', () => {
      const previous = makeSnapshot({
        narratives: [
          {
            summary: 'Steady topic',
            postIndices: [0, 1, 2],
            avgSentiment: 0,
            platforms: { twitter: 3 },
            velocity: { postsPerHour: 10 },
          },
        ],
      });

      const current = makeSnapshot({
        narratives: [
          {
            summary: 'Steady topic',
            postIndices: [0, 1, 2, 3],
            avgSentiment: 0,
            platforms: { twitter: 4 },
            velocity: { postsPerHour: 12 }, // 1.2x, below 2x threshold
          },
        ],
      });

      const alerts = service.compareSnapshots(
        previous,
        current,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      expect(alerts.filter((a) => a.type === 'velocity_spike')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // compareSnapshots — sentiment reversals
  // -------------------------------------------------------------------------

  describe('sentiment reversal detection', () => {
    it('should detect a sentiment reversal (positive to negative)', () => {
      const previous = makeSnapshot({
        narratives: [
          {
            summary: 'Opinion on policy X',
            postIndices: [0, 1, 2],
            avgSentiment: 0.5,
            platforms: { twitter: 3 },
            velocity: { postsPerHour: 3 },
          },
        ],
      });

      const current = makeSnapshot({
        narratives: [
          {
            summary: 'Opinion on policy X',
            postIndices: [0, 1, 2, 3],
            avgSentiment: -0.4,
            platforms: { twitter: 4 },
            velocity: { postsPerHour: 3 },
          },
        ],
      });

      const alerts = service.compareSnapshots(
        previous,
        current,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      const reversalAlerts = alerts.filter((a) => a.type === 'sentiment_reversal');
      expect(reversalAlerts).toHaveLength(1);
      expect(reversalAlerts[0]!.title).toContain('reversal');
      expect(reversalAlerts[0]!.severity).toBe('warning');
    });

    it('should detect a large shift even without sign change', () => {
      const previous = makeSnapshot({
        narratives: [
          {
            summary: 'Neutral topic',
            postIndices: [0, 1, 2],
            avgSentiment: 0.1,
            platforms: { twitter: 3 },
            velocity: { postsPerHour: 3 },
          },
        ],
      });

      const current = makeSnapshot({
        narratives: [
          {
            summary: 'Neutral topic',
            postIndices: [0, 1, 2],
            avgSentiment: 0.8, // shift of 0.7, above 2 * 0.3 = 0.6
            platforms: { twitter: 3 },
            velocity: { postsPerHour: 3 },
          },
        ],
      });

      const alerts = service.compareSnapshots(
        previous,
        current,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      const sentimentAlerts = alerts.filter((a) => a.type === 'sentiment_reversal');
      expect(sentimentAlerts).toHaveLength(1);
      expect(sentimentAlerts[0]!.title).toContain('shift');
    });

    it('should not alert when sentiment change is small', () => {
      const previous = makeSnapshot({
        narratives: [
          {
            summary: 'Stable topic',
            postIndices: [0, 1, 2],
            avgSentiment: 0.2,
            platforms: { twitter: 3 },
            velocity: { postsPerHour: 3 },
          },
        ],
      });

      const current = makeSnapshot({
        narratives: [
          {
            summary: 'Stable topic',
            postIndices: [0, 1, 2],
            avgSentiment: 0.3, // shift of 0.1, below threshold
            platforms: { twitter: 3 },
            velocity: { postsPerHour: 3 },
          },
        ],
      });

      const alerts = service.compareSnapshots(
        previous,
        current,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      expect(alerts.filter((a) => a.type === 'sentiment_reversal')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // compareSnapshots — new platform
  // -------------------------------------------------------------------------

  describe('new platform detection', () => {
    it('should detect when a narrative spreads to a new platform', () => {
      const previous = makeSnapshot({
        narratives: [
          {
            summary: 'Cross-platform story',
            postIndices: [0, 1, 2],
            avgSentiment: 0,
            platforms: { twitter: 3 },
            velocity: { postsPerHour: 2 },
          },
        ],
      });

      const current = makeSnapshot({
        narratives: [
          {
            summary: 'Cross-platform story',
            postIndices: [0, 1, 2, 3, 4],
            avgSentiment: 0,
            platforms: { twitter: 3, reddit: 2 },
            velocity: { postsPerHour: 3 },
          },
        ],
      });

      const alerts = service.compareSnapshots(
        previous,
        current,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      const platformAlerts = alerts.filter((a) => a.type === 'new_platform');
      expect(platformAlerts).toHaveLength(1);
      expect(platformAlerts[0]!.description).toContain('reddit');
    });
  });

  // -------------------------------------------------------------------------
  // compareSnapshots — volume surge
  // -------------------------------------------------------------------------

  describe('volume surge detection', () => {
    it('should detect a volume surge when post count more than doubles', () => {
      const previous = makeSnapshot({ postCount: 10 });
      const current = makeSnapshot({ postCount: 25 });

      const alerts = service.compareSnapshots(
        previous,
        current,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      const surgeAlerts = alerts.filter((a) => a.type === 'volume_surge');
      expect(surgeAlerts).toHaveLength(1);
      expect(surgeAlerts[0]!.severity).toBe('warning');
    });

    it('should mark 3x+ volume surge as critical', () => {
      const previous = makeSnapshot({ postCount: 10 });
      const current = makeSnapshot({ postCount: 35 });

      const alerts = service.compareSnapshots(
        previous,
        current,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      const surgeAlerts = alerts.filter((a) => a.type === 'volume_surge');
      expect(surgeAlerts).toHaveLength(1);
      expect(surgeAlerts[0]!.severity).toBe('critical');
    });

    it('should not alert when volume increase is under 50%', () => {
      const previous = makeSnapshot({ postCount: 10 });
      const current = makeSnapshot({ postCount: 14 });

      const alerts = service.compareSnapshots(
        previous,
        current,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      expect(alerts.filter((a) => a.type === 'volume_surge')).toHaveLength(0);
    });

    it('should not alert when previous post count is zero', () => {
      const previous = makeSnapshot({ postCount: 0 });
      const current = makeSnapshot({ postCount: 50 });

      const alerts = service.compareSnapshots(
        previous,
        current,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      expect(alerts.filter((a) => a.type === 'volume_surge')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // compareSnapshots — combined scenario
  // -------------------------------------------------------------------------

  describe('combined scenarios', () => {
    it('should generate multiple alert types from a single comparison', () => {
      const previous = makeSnapshot({
        postCount: 10,
        narratives: [
          {
            summary: 'Hot topic',
            postIndices: [0, 1, 2],
            avgSentiment: 0.6,
            platforms: { twitter: 3 },
            velocity: { postsPerHour: 5 },
          },
        ],
      });

      const current = makeSnapshot({
        postCount: 30, // 3x surge
        narratives: [
          {
            summary: 'Hot topic',
            postIndices: [0, 1, 2, 3, 4, 5, 6, 7],
            avgSentiment: -0.5, // reversal
            platforms: { twitter: 5, youtube: 3 }, // new platform
            velocity: { postsPerHour: 15 }, // 3x spike
          },
          {
            summary: 'Brand new narrative',
            postIndices: [8, 9, 10],
            avgSentiment: 0,
            platforms: { reddit: 3 },
            velocity: { postsPerHour: 2 },
          },
        ],
      });

      const alerts = service.compareSnapshots(
        previous,
        current,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      const types = new Set(alerts.map((a) => a.type));
      expect(types.has('volume_surge')).toBe(true);
      expect(types.has('velocity_spike')).toBe(true);
      expect(types.has('sentiment_reversal')).toBe(true);
      expect(types.has('new_platform')).toBe(true);
      expect(types.has('new_narrative')).toBe(true);
      expect(alerts.length).toBeGreaterThanOrEqual(5);
    });

    it('should return no alerts when nothing changed', () => {
      const snapshot = makeSnapshot({
        postCount: 10,
        narratives: [
          {
            summary: 'Stable narrative',
            postIndices: [0, 1, 2],
            avgSentiment: 0.1,
            platforms: { twitter: 3 },
            velocity: { postsPerHour: 5 },
          },
        ],
      });

      const alerts = service.compareSnapshots(
        snapshot,
        snapshot,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      expect(alerts).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getDueConfigs
  // -------------------------------------------------------------------------

  describe('getDueConfigs', () => {
    it('should return configs where nextRunAt is in the past', () => {
      const past = new Date(Date.now() - 60_000);
      const future = new Date(Date.now() + 60_000);

      const configs = [
        { enabled: true, nextRunAt: past, id: 'due' },
        { enabled: true, nextRunAt: future, id: 'not-due' },
        { enabled: false, nextRunAt: past, id: 'disabled' },
        { enabled: true, nextRunAt: null, id: 'no-next-run' },
      ];

      const due = service.getDueConfigs(configs);
      expect(due).toHaveLength(1);
      expect(due[0]!.id).toBe('due');
    });

    it('should return empty array when no configs are due', () => {
      const future = new Date(Date.now() + 60_000);
      const configs = [
        { enabled: true, nextRunAt: future },
        { enabled: false, nextRunAt: new Date(Date.now() - 60_000) },
      ];

      const due = service.getDueConfigs(configs);
      expect(due).toHaveLength(0);
    });

    it('should return empty array for empty input', () => {
      expect(service.getDueConfigs([])).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Alert metadata
  // -------------------------------------------------------------------------

  describe('alert metadata', () => {
    it('should include correct investigation ID in all generated alerts', () => {
      const previous = makeSnapshot({ postCount: 10, narratives: [] });
      const current = makeSnapshot({ postCount: 20, narratives: [] });

      const alerts = service.compareSnapshots(previous, current, 'inv-abc-123', DEFAULT_THRESHOLDS);

      for (const alert of alerts) {
        expect(alert.investigationId).toBe('inv-abc-123');
      }
    });

    it('should set read to false for all generated alerts', () => {
      const previous = makeSnapshot({ postCount: 5 });
      const current = makeSnapshot({ postCount: 20 });

      const alerts = service.compareSnapshots(
        previous,
        current,
        INVESTIGATION_ID,
        DEFAULT_THRESHOLDS,
      );

      for (const alert of alerts) {
        expect(alert.read).toBe(false);
      }
    });
  });
});
