import { measureCampaignSignals, type PostForSignals } from './campaign-signals';

const MIN = 60 * 1000;
const base = Date.UTC(2026, 5, 1, 12, 0, 0);

function post(overrides: Partial<PostForSignals> & { minute?: number } = {}): PostForSignals {
  const { minute, ...rest } = overrides;
  return {
    text: 'a perfectly ordinary remark about the events of the day in question',
    authorHandle: 'someone',
    platform: 'twitter',
    timestamp: new Date(base + (minute ?? 0) * MIN).toISOString(),
    ...rest,
  };
}

/** An organic-looking corpus: varied authors, texts, spread-out timing. */
function organicCorpus(n = 20): PostForSignals[] {
  const texts = [
    'I think the new reactor policy deserves a much closer look honestly',
    'Interesting reporting today on the energy grid situation in Europe',
    'My take is that cooling water constraints will keep getting worse',
    'Not convinced by the coverage — the operator statement says otherwise',
    'Went through the regulator filings tonight and the numbers are stark',
    'The drought angle is underrated in most of the analysis I have read',
    'Somebody should map which plants sit on which rivers, seriously',
    'Grid operators planned for this years ago according to the archives',
    'The local reporting from Romania has been better than the wires',
    'Curious whether the maintenance schedule explains part of the dip',
  ];
  // Cycle base texts but prepend a distinct clause per post — recycling the
  // same sentence verbatim WOULD be near-duplication, and the detector rightly
  // flagged an earlier version of this fixture for exactly that.
  const openers = [
    'From what I saw earlier,', 'Speaking as a bystander,', 'For the record,',
    'On reflection tonight,', 'Having read the thread,', 'After the briefing,',
    'In my own experience,', 'Judging by the replies,', 'Per the local news,',
    'Watching this unfold,', 'As someone nearby,', 'Counter to the mood,',
    'Despite the noise,', 'Reading between lines,', 'Beyond the headline,',
    'Since this morning,', 'Given the history,', 'Setting hype aside,',
    'With some caution,', 'To be quite fair,',
  ];
  return Array.from({ length: n }, (_, i) =>
    post({
      text: `${openers[i % openers.length]} ${texts[i % texts.length]}`,
      authorHandle: `user${i}`,
      minute: i * 47, // irregular-ish spread over many hours
    }),
  );
}

/** A campaign-shaped corpus: copy-paste, few authors, one burst, one domain. */
function campaignCorpus(n = 20): PostForSignals[] {
  return Array.from({ length: n }, (_, i) =>
    post({
      text: `URGENT share this everyone the truth about the reactor coverup https://truth-portal.example/expose ${i % 3}`,
      authorHandle: `amplifier${i % 3}`,
      minute: Math.floor(i / 10), // all inside two minutes
    }),
  );
}

describe('measureCampaignSignals', () => {
  it('stays quiet on an organic corpus', () => {
    const r = measureCampaignSignals(organicCorpus());

    expect(r.elevatedCount).toBe(0);
    expect(r.repetition.elevated).toBe(false);
    expect(r.concentration.elevated).toBe(false);
  });

  it('lights up on a campaign-shaped corpus, with quotable evidence', () => {
    const r = measureCampaignSignals(campaignCorpus());

    expect(r.repetition.elevated).toBe(true);
    expect(r.synchrony.elevated).toBe(true);
    expect(r.concentration.elevated).toBe(true);
    expect(r.infrastructure.elevated).toBe(true);
    expect(r.elevatedCount).toBe(4);

    // Evidence must be numeric and specific, not adjectives.
    expect(r.repetition.evidence).toMatch(/\d+% of \d+ posts/);
    expect(r.concentration.evidence).toMatch(/HHI=/);
    expect(r.infrastructure.evidence).toMatch(/truth-portal\.example/);
  });

  it('abstains per-signal on a tiny corpus instead of guessing', () => {
    const r = measureCampaignSignals(organicCorpus(3));

    expect(r.repetition.measured).toBe(false);
    expect(r.synchrony.measured).toBe(false);
    expect(r.concentration.measured).toBe(false);
    expect(r.measurableCount).toBe(0);
    expect(r.repetition.evidence).toMatch(/unmeasured/);
  });

  it('reports cross-platform propagation order as provenance, never elevation', () => {
    const posts = [
      post({ platform: 'telegram', minute: 0, authorHandle: 'a1' }),
      post({ platform: 'telegram', minute: 5, authorHandle: 'a2' }),
      post({ platform: 'twitter', minute: 60, authorHandle: 'a3' }),
      post({ platform: 'rss', minute: 240, authorHandle: 'a4' }),
    ];
    const r = measureCampaignSignals(posts);

    expect(r.crossPlatform.measured).toBe(true);
    expect(r.crossPlatform.elevated).toBe(false);
    expect(r.crossPlatform.detail[0]?.platform).toBe('telegram');
    expect(r.crossPlatform.evidence).toMatch(/appeared first on telegram/);
  });

  it('does not count links twice from one post when measuring domains', () => {
    const linky = Array.from({ length: 12 }, (_, i) =>
      post({
        text: `look https://same.example/a and https://same.example/b plus text ${i} which is long enough to shingle`,
        authorHandle: `u${i}`,
        minute: i * 30,
      }),
    );
    const r = measureCampaignSignals(linky);

    // 12 posts, each referencing same.example once (deduped within post).
    expect(r.infrastructure.detail.domains[0]).toMatchObject({
      domain: 'same.example',
      count: 12,
    });
  });

  it('handles a single-platform corpus without inventing propagation', () => {
    const r = measureCampaignSignals(organicCorpus(10));
    expect(r.crossPlatform.measured).toBe(false);
    expect(r.crossPlatform.evidence).toMatch(/single-platform/);
  });
});
