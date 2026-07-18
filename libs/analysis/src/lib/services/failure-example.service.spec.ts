import type { ConfigService } from '@nestjs/config';
import {
  type ExamplePost,
  FailureExampleService,
  groundFailureExample,
  normalizeForGrounding,
} from './failure-example.service';

function makePost(overrides: Partial<ExamplePost> = {}): ExamplePost {
  return {
    id: overrides.id ?? 'p1',
    text:
      overrides.text ??
      'I asked Gemini to summarize a PDF and it invented three citations that do not exist.',
    platform: overrides.platform ?? 'twitter',
    authorName: overrides.authorName ?? 'Test User',
    authorHandle: overrides.authorHandle ?? 'testuser',
    timestamp: overrides.timestamp ?? '2026-07-15T12:00:00.000Z',
    engagement: overrides.engagement ?? { likes: 10, shares: 2, comments: 3 },
    url: overrides.url,
  };
}

describe('normalizeForGrounding', () => {
  it('collapses whitespace and case', () => {
    expect(normalizeForGrounding('  It   INVENTED\nthree  citations ')).toBe(
      'it invented three citations',
    );
  });
});

describe('groundFailureExample', () => {
  const posts = [makePost({ url: 'https://x.com/testuser/status/1' })];

  const validRaw = {
    postRef: 0,
    model: 'Gemini',
    modality: 'text',
    failureCategory: 'hallucination',
    quotedPrompt: null,
    description: 'Invented citations when summarizing a PDF.',
    evidenceExcerpt: 'it invented three citations that do not exist',
    confidence: 'high',
  };

  it('accepts an example whose excerpt appears in the cited post', () => {
    const grounded = groundFailureExample(validRaw, posts);
    expect(grounded).not.toBeNull();
    expect(grounded?.platform).toBe('twitter');
    expect(grounded?.url).toBe('https://x.com/testuser/status/1');
    expect(grounded?.engagement.likes).toBe(10);
  });

  it('rejects an example whose excerpt is not in the post (fabricated evidence)', () => {
    expect(
      groundFailureExample(
        { ...validRaw, evidenceExcerpt: 'it refused to answer entirely' },
        posts,
      ),
    ).toBeNull();
  });

  it('grounds excerpts across whitespace and case differences', () => {
    expect(
      groundFailureExample(
        { ...validRaw, evidenceExcerpt: 'It  Invented three\ncitations' },
        posts,
      ),
    ).not.toBeNull();
  });

  it('rejects out-of-range and missing postRefs', () => {
    expect(groundFailureExample({ ...validRaw, postRef: 5 }, posts)).toBeNull();
    expect(groundFailureExample({ ...validRaw, postRef: undefined }, posts)).toBeNull();
  });

  it('rejects examples missing a description or excerpt', () => {
    expect(groundFailureExample({ ...validRaw, description: ' ' }, posts)).toBeNull();
    expect(groundFailureExample({ ...validRaw, evidenceExcerpt: '' }, posts)).toBeNull();
  });

  it('normalizes unknown modality/confidence instead of trusting the LLM', () => {
    const grounded = groundFailureExample(
      { ...validRaw, modality: 'hologram', confidence: 'certain' },
      posts,
    );
    expect(grounded?.modality).toBe('unspecified');
    expect(grounded?.confidence).toBe('low');
  });

  it('takes provenance from the post, never the LLM payload', () => {
    const grounded = groundFailureExample(validRaw, posts);
    expect(grounded?.authorHandle).toBe('testuser');
    expect(grounded?.timestamp).toBe('2026-07-15T12:00:00.000Z');
  });
});

describe('FailureExampleService', () => {
  const noKeyConfig = { get: () => undefined } as unknown as ConfigService;

  function withoutEnvKey<T>(fn: () => T): T {
    const prev = process.env['GEMINI_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
    try {
      return fn();
    } finally {
      if (prev !== undefined) process.env['GEMINI_API_KEY'] = prev;
    }
  }

  it('returns skipped for an empty subject', async () => {
    const result = await withoutEnvKey(() =>
      new FailureExampleService(noKeyConfig).extract('  ', [makePost()]),
    );
    expect(result.status).toBe('skipped');
    expect(result.examples).toHaveLength(0);
  });

  it('returns skipped when no post has enough text', async () => {
    const result = await withoutEnvKey(() =>
      new FailureExampleService(noKeyConfig).extract('Google Gemini', [makePost({ text: 'meh' })]),
    );
    expect(result.status).toBe('skipped');
  });

  it('returns unavailable (never fabricates) without a Gemini key', async () => {
    const result = await withoutEnvKey(() =>
      new FailureExampleService(noKeyConfig).extract('Google Gemini', [makePost()]),
    );
    expect(result.status).toBe('unavailable');
    expect(result.examples).toHaveLength(0);
    expect(result.modelUsed).toBeNull();
  });
});
