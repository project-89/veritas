import { ConfigService } from '@nestjs/config';
import {
  CLAIM_VERIFICATION_PROMPT_VERSION,
  ClaimVerificationService,
  GROUNDING_DOWNGRADE_CAVEAT,
} from './claim-verification.service';
import type { ExtractedClaim } from './propaganda.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfigService(geminiKey?: string): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'GEMINI_API_KEY') return geminiKey;
      return undefined;
    },
  } as unknown as ConfigService;
}

function makeClaim(overrides: Partial<ExtractedClaim> = {}): ExtractedClaim {
  return {
    claim: overrides.claim ?? 'The Earth orbits the Sun',
    type: overrides.type ?? 'factual',
    sources: overrides.sources ?? ['@user1'],
    firstSeen: overrides.firstSeen ?? '2025-01-01T00:00:00Z',
    frequency: overrides.frequency ?? 5,
    verifiability: overrides.verifiability ?? 'verifiable',
  };
}

// Minimal Wikipedia API response
function wikiResponse(results: Array<{ title: string; snippet: string }>) {
  return {
    query: {
      search: results.map((r, i) => ({
        title: r.title,
        snippet: r.snippet,
        pageid: 1000 + i,
      })),
    },
  };
}

// Minimal GDELT API response
function gdeltResponse(articles: Array<{ title: string; url?: string; domain?: string }>) {
  return {
    articles: articles.map((a) => ({
      title: a.title,
      url: a.url ?? `https://example.com/${a.title.replace(/ /g, '-')}`,
      domain: a.domain ?? 'example.com',
    })),
  };
}

/** Route mocked fetch to canned Wikipedia/GDELT payloads. */
function mockEvidenceFetch(
  fetchSpy: jest.SpyInstance,
  wiki: Array<{ title: string; snippet: string }>,
  gdelt: Array<{ title: string; url?: string; domain?: string }>,
): void {
  fetchSpy.mockImplementation((url: string | URL) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    if (urlStr.includes('wikipedia.org')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(wikiResponse(wiki)),
      });
    }

    if (urlStr.includes('gdeltproject.org')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(gdeltResponse(gdelt)),
      });
    }

    return Promise.resolve({ ok: false, status: 404 });
  });
}

/**
 * Replace the service's private Gemini client with a stub that returns the
 * given JSON payload and optionally captures the prompt it was sent.
 */
function installMockLlm(
  service: ClaimVerificationService,
  responseJson: unknown,
  capture?: { prompt?: string },
): void {
  const mockGenAI = {
    getGenerativeModel: () => ({
      generateContent: (prompt: string) => {
        if (capture) capture.prompt = prompt;
        return Promise.resolve({
          response: { text: () => JSON.stringify(responseJson) },
        });
      },
    }),
  };

  (service as unknown as { genAI: unknown }).genAI = mockGenAI;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClaimVerificationService', () => {
  let service: ClaimVerificationService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create service without Gemini key (heuristic mode)
    service = new ClaimVerificationService(makeConfigService());

    // Mock global fetch
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Filter non-verifiable claims
  // -------------------------------------------------------------------------

  it('should skip non-verifiable claims', async () => {
    const claims: ExtractedClaim[] = [
      makeClaim({ claim: 'Freedom is important', verifiability: 'subjective' }),
      makeClaim({
        claim: 'The future will be better',
        verifiability: 'unfalsifiable',
      }),
    ];

    const result = await service.verifyBatch(claims);

    expect(result.results).toHaveLength(0);
    expect(result.verifiedCount).toBe(0);
    expect(result.disputedCount).toBe(0);
    expect(result.unverifiedCount).toBe(0);
    expect(result.summary).toContain('No verifiable claims');
  });

  // -------------------------------------------------------------------------
  // Claim with supporting evidence
  // -------------------------------------------------------------------------

  it('should find supporting evidence from Wikipedia and GDELT', async () => {
    const claim = makeClaim({
      claim: 'The Earth orbits the Sun',
    });

    fetchSpy.mockImplementation((url: string | URL) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('wikipedia.org')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              wikiResponse([
                {
                  title: "Earth's orbit",
                  snippet:
                    'The <span class="searchmatch">Earth</span> completes one <span class="searchmatch">orbit</span> around the <span class="searchmatch">Sun</span> every 365.25 days.',
                },
                {
                  title: 'Heliocentrism',
                  snippet:
                    'Heliocentrism is the model where the Earth and planets revolve around the Sun.',
                },
              ]),
            ),
        });
      }

      if (urlStr.includes('gdeltproject.org')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              gdeltResponse([
                {
                  title: 'Earth orbit around Sun confirmed by NASA measurements',
                  domain: 'nasa.gov',
                },
              ]),
            ),
        });
      }

      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await service.verifyBatch([claim]);

    expect(result.results).toHaveLength(1);
    const first = result.results[0]!;
    expect(first.evidence.supporting.length).toBeGreaterThan(0);
    expect(first.sourcesChecked).toContain('Wikipedia');
    expect(first.sourcesChecked).toContain('GDELT Global News');
  });

  // -------------------------------------------------------------------------
  // Claim with no evidence
  // -------------------------------------------------------------------------

  it('should handle claim with no evidence found', async () => {
    const claim = makeClaim({
      claim: 'Zorbglax invented the flibbertigibbet in 2025',
    });

    fetchSpy.mockImplementation((url: string | URL) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('wikipedia.org')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(wikiResponse([])),
        });
      }

      if (urlStr.includes('gdeltproject.org')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(gdeltResponse([])),
        });
      }

      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await service.verifyBatch([claim]);

    expect(result.results).toHaveLength(1);
    const first = result.results[0]!;
    expect(first.status).toBe('unverified');
    expect(first.evidence.supporting).toHaveLength(0);
    expect(first.evidence.contradicting).toHaveLength(0);
    expect(result.unverifiedCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Wikipedia API parsing
  // -------------------------------------------------------------------------

  it('should correctly parse Wikipedia search results', async () => {
    await service.searchWikipedia('climate change');

    // We mock fetch below, so let's test the actual parsing logic
    fetchSpy.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            wikiResponse([
              {
                title: 'Climate change',
                snippet:
                  '<span class="searchmatch">Climate</span> <span class="searchmatch">change</span> refers to long-term shifts in temperatures.',
              },
            ]),
          ),
      }),
    );

    const result = await service.searchWikipedia('climate change');
    expect(result).toHaveLength(1);
    const group = result[0]!;
    expect(group.source).toBe('Wikipedia');
    expect(group.items).toHaveLength(1);
    expect(group.items[0]!.title).toBe('Climate change');
  });

  // -------------------------------------------------------------------------
  // Graceful handling of API failures
  // -------------------------------------------------------------------------

  it('should handle Wikipedia API failure gracefully', async () => {
    fetchSpy.mockImplementation((url: string | URL) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('wikipedia.org')) {
        return Promise.reject(new Error('Network error'));
      }

      if (urlStr.includes('gdeltproject.org')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(gdeltResponse([])),
        });
      }

      return Promise.resolve({ ok: false, status: 404 });
    });

    const claim = makeClaim({ claim: 'Test claim for error handling' });
    const result = await service.verifyBatch([claim]);

    // Should not throw, should return unverified
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.status).toBe('unverified');
  });

  it('should handle GDELT API failure gracefully', async () => {
    fetchSpy.mockImplementation((url: string | URL) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('wikipedia.org')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(wikiResponse([])),
        });
      }

      if (urlStr.includes('gdeltproject.org')) {
        return Promise.resolve({ ok: false, status: 500 });
      }

      return Promise.resolve({ ok: false, status: 404 });
    });

    const claim = makeClaim({ claim: 'Test claim for GDELT error' });
    const result = await service.verifyBatch([claim]);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.status).toBe('unverified');
  });

  it('should handle both APIs failing gracefully', async () => {
    fetchSpy.mockImplementation(() => Promise.reject(new Error('Network error')));

    const claim = makeClaim({ claim: 'Test claim for total failure' });
    const result = await service.verifyBatch([claim]);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.status).toBe('unverified');
    expect(result.results[0]!.confidence).toBeLessThanOrEqual(0.1);
  });

  // -------------------------------------------------------------------------
  // Heuristic verification logic
  // -------------------------------------------------------------------------

  it('should use heuristic when no Gemini key is set', async () => {
    const claim = makeClaim({
      claim: 'The Earth orbits around the Sun',
    });

    fetchSpy.mockImplementation((url: string | URL) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('wikipedia.org')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              wikiResponse([
                {
                  title: "Earth's orbit",
                  snippet: 'The Earth orbits the Sun at a distance of about 150 million km.',
                },
                {
                  title: 'Orbital mechanics',
                  snippet: 'Earth orbit around Sun follows Kepler laws of planetary motion.',
                },
              ]),
            ),
        });
      }

      if (urlStr.includes('gdeltproject.org')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              gdeltResponse([
                { title: 'Earth orbit Sun distance measured precisely', domain: 'science.org' },
              ]),
            ),
        });
      }

      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await service.verifyBatch([claim]);

    expect(result.results).toHaveLength(1);
    const first = result.results[0]!;
    // With supporting evidence from Wikipedia and GDELT, heuristic should find support
    expect(first.evidence.supporting.length).toBeGreaterThan(0);
    expect(first.reasoning.toLowerCase()).toContain('heuristic');
    // Caveats should mention heuristic
    expect(first.caveats.some((c) => c.toLowerCase().includes('heuristic'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Helper methods
  // -------------------------------------------------------------------------

  it('should extract meaningful search terms from claims', () => {
    const terms = service.extractSearchTerms(
      'The president of the United States visited France in 2024',
    );
    // Should strip stop words like "the", "of", "in"
    expect(terms).not.toContain(' the ');
    expect(terms.length).toBeGreaterThan(0);
  });

  it('should strip HTML from Wikipedia snippets', () => {
    const result = service.stripHtml(
      '<span class="searchmatch">Climate</span> <span class="searchmatch">change</span> refers to &amp; shifts.',
    );
    expect(result).not.toContain('<span');
    expect(result).not.toContain('</span>');
    expect(result).toContain('Climate');
    expect(result).toContain('change');
  });

  // -------------------------------------------------------------------------
  // Batch summary
  // -------------------------------------------------------------------------

  it('should generate a meaningful batch summary', async () => {
    const claims: ExtractedClaim[] = [
      makeClaim({ claim: 'Verifiable claim A', verifiability: 'verifiable' }),
      makeClaim({ claim: 'Subjective claim B', verifiability: 'subjective' }),
    ];

    fetchSpy.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(wikiResponse([])),
      }),
    );

    const result = await service.verifyBatch(claims);

    expect(result.summary).toContain('1 verifiable claim');
    expect(result.summary).toContain('1 non-verifiable');
    expect(result.summary).toContain('preliminary');
  });

  // -------------------------------------------------------------------------
  // Mixed verifiable + non-verifiable batch
  // -------------------------------------------------------------------------

  it('should process mixed batch correctly', async () => {
    const claims: ExtractedClaim[] = [
      makeClaim({
        claim: 'The population of Tokyo exceeds 13 million',
        verifiability: 'verifiable',
      }),
      makeClaim({
        claim: 'Democracy is the best system',
        verifiability: 'subjective',
      }),
      makeClaim({
        claim: 'A god exists somewhere',
        verifiability: 'unfalsifiable',
      }),
      makeClaim({
        claim: 'The Olympics were held in Paris in 2024',
        verifiability: 'verifiable',
      }),
    ];

    fetchSpy.mockImplementation((url: string | URL) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('wikipedia.org')) {
        if (urlStr.includes('Tokyo') || urlStr.includes('population')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve(
                wikiResponse([
                  {
                    title: 'Tokyo',
                    snippet: 'Tokyo has a population of over 13 million in the city proper.',
                  },
                  {
                    title: 'Demographics of Tokyo',
                    snippet: 'The population of Tokyo exceeded 13 million residents.',
                  },
                ]),
              ),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              wikiResponse([
                {
                  title: '2024 Summer Olympics',
                  snippet: 'The 2024 Summer Olympics were held in Paris, France.',
                },
              ]),
            ),
        });
      }

      if (urlStr.includes('gdeltproject.org')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(gdeltResponse([])),
        });
      }

      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await service.verifyBatch(claims);

    // Should only process the 2 verifiable claims
    expect(result.results).toHaveLength(2);
    expect(result.summary).toContain('2 verifiable');
    expect(result.summary).toContain('2 non-verifiable');
  });

  // -------------------------------------------------------------------------
  // Citation grounding (LLM mode)
  // -------------------------------------------------------------------------

  describe('citation grounding', () => {
    const wikiSnippet = 'The Earth completes one orbit around the Sun every 365.25 days.';

    function makeLlmService(responseJson: unknown, capture?: { prompt?: string }) {
      const llmService = new ClaimVerificationService(makeConfigService('test-key'));
      installMockLlm(llmService, responseJson, capture);
      return llmService;
    }

    it('should drop fabricated excerpts and downgrade the verdict to unverified', async () => {
      const llmService = makeLlmService({
        status: 'verified',
        confidence: 0.9,
        supporting: [
          {
            source: 'Wikipedia',
            excerpt: 'NASA officially confirmed heliocentrism in a landmark 2019 press conference',
            credibility: 'high',
          },
        ],
        contradicting: [],
        reasoning: 'Evidence suggests the claim is accurate.',
        caveats: ['Automated assessment.'],
      });

      mockEvidenceFetch(fetchSpy, [{ title: "Earth's orbit", snippet: wikiSnippet }], []);

      const result = await llmService.verifySingleClaim(makeClaim());

      // The fabricated citation must be dropped and the verdict downgraded.
      expect(result.analysisMode).toBe('llm');
      expect(result.evidence.supporting).toHaveLength(0);
      expect(result.status).toBe('unverified');
      expect(result.confidence).toBeLessThanOrEqual(0.3);
      expect(result.caveats).toContain(GROUNDING_DOWNGRADE_CAVEAT);
      expect(result.droppedUngroundedCitations).toBe(1);
      expect(result.groundingScore).toBe(0);
    });

    it('should keep verbatim excerpts grounded and let the verdict stand', async () => {
      const llmService = makeLlmService({
        status: 'verified',
        confidence: 0.85,
        supporting: [
          {
            source: 'Wikipedia',
            excerpt: wikiSnippet,
            credibility: 'high',
          },
        ],
        contradicting: [],
        reasoning: 'Evidence suggests the claim is accurate.',
        caveats: ['Automated assessment.'],
      });

      mockEvidenceFetch(fetchSpy, [{ title: "Earth's orbit", snippet: wikiSnippet }], []);

      const result = await llmService.verifySingleClaim(makeClaim());

      expect(result.analysisMode).toBe('llm');
      expect(result.status).toBe('verified');
      expect(result.confidence).toBeCloseTo(0.85);
      expect(result.evidence.supporting).toHaveLength(1);
      expect(result.evidence.supporting[0]!.excerpt).toBe(wikiSnippet);
      expect(result.caveats).not.toContain(GROUNDING_DOWNGRADE_CAVEAT);
      expect(result.droppedUngroundedCitations).toBe(0);
      expect(result.groundingScore).toBe(1);
    });

    it('should rank claim-relevant snippets into the prompt over irrelevant ones', async () => {
      const capture: { prompt?: string } = {};
      const llmService = makeLlmService(
        {
          status: 'unverified',
          confidence: 0.2,
          supporting: [],
          contradicting: [],
          reasoning: 'Insufficient evidence.',
          caveats: ['Automated assessment.'],
        },
        capture,
      );

      // 15 snippets total (5 wiki + 10 GDELT), only 12 fit in the prompt.
      // The 3 relevant ones arrive LAST, so naive first-come ordering would drop them.
      const irrelevantWiki = [
        {
          title: 'Quantum computing',
          snippet: 'Quantum computing breakthrough announced yesterday',
        },
        { title: 'Archaeology', snippet: 'Ancient pottery discovered near coastal village' },
        { title: 'Entomology', snippet: 'New species of beetle described by entomologists' },
        { title: 'Music', snippet: 'Symphony orchestra premieres modern composition' },
        { title: 'Geology', snippet: 'Volcanic activity monitored near remote island' },
      ];
      const gdeltArticles = [
        { title: 'Football transfer window gossip roundup alphamarker' },
        { title: 'Celebrity chef opens restaurant bravomarker' },
        { title: 'Vintage car auction draws crowds charliemarker' },
        { title: 'Gardening tips for spring deltamarker' },
        { title: 'Knitting festival attracts hobbyists golfmarker' },
        { title: 'Surfing championship postponed hotelmarker' },
        { title: 'Cheese rolling contest winners indiamarker' },
        { title: 'Tokyo population exceeds 13 million residents says census' },
        { title: 'Census data shows Tokyo population above 13 million' },
        { title: 'Tokyo residents number more than 13 million people' },
      ];

      mockEvidenceFetch(fetchSpy, irrelevantWiki, gdeltArticles);

      await llmService.verifySingleClaim(
        makeClaim({ claim: 'The population of Tokyo exceeds 13 million residents' }),
      );

      expect(capture.prompt).toBeDefined();
      const prompt = capture.prompt!;

      // All three relevant snippets survive the cut...
      expect(prompt).toContain('Tokyo population exceeds 13 million residents says census');
      expect(prompt).toContain('Census data shows Tokyo population above 13 million');
      expect(prompt).toContain('Tokyo residents number more than 13 million people');

      // ...displacing the lowest-ranked irrelevant snippets.
      expect(prompt).not.toContain('golfmarker');
      expect(prompt).not.toContain('hotelmarker');
      expect(prompt).not.toContain('indiamarker');
    });

    it('should stamp promptVersion and model on LLM results', async () => {
      const llmService = makeLlmService({
        status: 'unverified',
        confidence: 0.2,
        supporting: [],
        contradicting: [],
        reasoning: 'Insufficient evidence.',
        caveats: ['Automated assessment.'],
      });

      mockEvidenceFetch(fetchSpy, [{ title: "Earth's orbit", snippet: wikiSnippet }], []);

      const result = await llmService.verifySingleClaim(makeClaim());

      expect(CLAIM_VERIFICATION_PROMPT_VERSION).toBe(2);
      expect(result.promptVersion).toBe(CLAIM_VERIFICATION_PROMPT_VERSION);
      expect(typeof result.model).toBe('string');
      expect(result.model!.length).toBeGreaterThan(0);
      expect(result.model).not.toBe('heuristic');
    });

    it('should stamp promptVersion, model and groundingScore on heuristic results', async () => {
      // `service` from beforeEach has no Gemini key -> heuristic path.
      mockEvidenceFetch(
        fetchSpy,
        [
          {
            title: "Earth's orbit",
            snippet: 'The Earth orbits the Sun at a distance of about 150 million km.',
          },
          {
            title: 'Orbital mechanics',
            snippet: 'Earth orbit around Sun follows Kepler laws of planetary motion.',
          },
        ],
        [],
      );

      const result = await service.verifySingleClaim(
        makeClaim({ claim: 'The Earth orbits around the Sun' }),
      );

      expect(result.analysisMode).toBe('heuristic');
      expect(result.promptVersion).toBe(CLAIM_VERIFICATION_PROMPT_VERSION);
      expect(result.model).toBe('heuristic');
      // Heuristic citations are retrieved snippets, so grounded by construction.
      expect(result.evidence.supporting.length).toBeGreaterThan(0);
      expect(result.groundingScore).toBe(1);
      expect(result.droppedUngroundedCitations).toBe(0);
    });
  });
});
