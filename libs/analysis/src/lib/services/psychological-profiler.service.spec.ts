import { ConfigService } from '@nestjs/config';
import { PsychologicalProfilerService } from './psychological-profiler.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    text: 'I think decentralized systems are the future of governance. The old institutions have failed us.',
    timestamp: '2026-03-15T14:00:00Z',
    platform: 'twitter',
    engagement: { likes: 12, comments: 3, shares: 5 },
    sentiment: { score: 0.3, label: 'positive' },
    ...overrides,
  };
}

function makePosts(count: number): ReturnType<typeof makePost>[] {
  const topics = [
    'Decentralization is the only path forward for fair governance.',
    'Another day, another centralized exchange hack. When will people learn?',
    'Just read an amazing paper on zero-knowledge proofs. The math is beautiful.',
    'The regulatory crackdown is coming and most projects are not prepared.',
    'Why do people still trust banks? They literally created the 2008 crisis.',
    'Building something new today. Cant share details yet but its going to change everything.',
    'The community around this project is incredible. Real builders, not speculators.',
    'Tired of influencers pumping garbage. Do your own research.',
    'Privacy is a human right. Full stop.',
    'If you dont understand the tech, you shouldnt be investing in it.',
  ];

  return Array.from({ length: count }, (_, i) => makePost({
    text: topics[i % topics.length],
    timestamp: new Date(2026, 2, 1 + i, 10 + (i % 12), 0, 0).toISOString(),
    engagement: { likes: 5 + i * 2, comments: 1 + i, shares: i },
  }));
}

function createService(geminiKey?: string): PsychologicalProfilerService {
  const savedKey = process.env['GEMINI_API_KEY'];
  delete process.env['GEMINI_API_KEY'];

  const configService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'GEMINI_API_KEY') return geminiKey;
      return undefined;
    }),
  } as unknown as ConfigService;

  const service = new PsychologicalProfilerService(configService);

  if (savedKey) process.env['GEMINI_API_KEY'] = savedKey;

  return service;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PsychologicalProfilerService', () => {
  describe('generateProfile()', () => {
    it('throws when no Gemini API key is configured', async () => {
      const service = createService(undefined);
      await expect(
        service.generateProfile({
          handle: 'testuser',
          platform: 'twitter',
          posts: makePosts(10),
        }),
      ).rejects.toThrow('GEMINI_API_KEY not configured');
    });

    it('throws when no posts are provided', async () => {
      const service = createService('fake-key');
      // Mock genAI so it doesn't actually call the API
      (service as any).genAI = { getGenerativeModel: jest.fn() };

      await expect(
        service.generateProfile({
          handle: 'testuser',
          platform: 'twitter',
          posts: [],
        }),
      ).rejects.toThrow('No posts available');
    });

    it('generates a profile with valid structure from mocked LLM', async () => {
      const service = createService('fake-key');

      const mockResponse = {
        communicationStyle: {
          formality: 'casual',
          tone: 'analytical',
          complexity: 'moderate',
          evidence: ['"Decentralization is the only path forward"'],
        },
        coreBeliefs: [
          { belief: 'Decentralized governance is superior to centralized institutions', confidence: 0.9, evidence: ['Post 0', 'Post 4'] },
          { belief: 'Privacy is a fundamental right', confidence: 0.85, evidence: ['Post 8'] },
        ],
        interestDomains: [
          { domain: 'Crypto/Blockchain', engagementLevel: 'primary', postCount: 7 },
          { domain: 'Privacy/Security', engagementLevel: 'secondary', postCount: 3 },
        ],
        emotionalTriggers: {
          anger: ['centralized exchanges', 'regulatory overreach'],
          excitement: ['new technology', 'community building'],
          fear: ['regulatory crackdown'],
          evidence: { anger: ['"Another day, another centralized exchange hack"'] },
        },
        engagementPatterns: {
          likelyToEngageWith: ['technical discussions', 'governance debates'],
          likelyToShare: ['research papers', 'project updates'],
          likelyToCreate: ['opinion pieces', 'technical analysis'],
          contentPreferences: ['long-form analysis', 'data-driven arguments'],
        },
        influenceSusceptibility: {
          vulnerableTo: ['appeals to decentralization ideology'],
          resistantTo: ['mainstream financial advice', 'authority-based arguments'],
          echoChamberDepth: 'moderate',
          evidence: ['Consistently dismisses centralized systems without engaging counterarguments'],
        },
        persuasionStyle: {
          primaryTechniques: ['appeal to principle', 'technical authority'],
          targetAudience: 'crypto-native community',
          effectiveness: 'moderate',
          evidence: ['"If you dont understand the tech, you shouldnt be investing"'],
        },
        riskIndicators: {
          radicalizationSignals: [],
          manipulationVulnerability: 'low',
          echoChamberDepth: 'moderate',
          flags: [],
          evidence: [],
        },
        socialRole: {
          primary: 'analyst',
          confidence: 0.8,
          evidence: ['Focuses on explaining technology and principles rather than promoting specific projects'],
        },
        summary: 'This user is a technically-minded crypto advocate who values decentralization and privacy as core principles. Their posting pattern suggests an analytical mindset with strong ideological convictions about the failure of centralized institutions.',
      };

      // Mock the LLM
      (service as any).genAI = {
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockResolvedValue({
            response: { text: () => JSON.stringify(mockResponse) },
          }),
        }),
      };

      const profile = await service.generateProfile({
        handle: 'testuser',
        platform: 'twitter',
        posts: makePosts(15),
        authorProfile: { followersCount: 5000, followingCount: 200, isVerified: false },
      });

      // Verify structure
      expect(profile.version).toBe(1);
      expect(profile.modelUsed).toBe('gemini-3.1-pro-preview');
      expect(profile.postCountAnalyzed).toBe(15);

      // Verify dimensions
      expect(profile.communicationStyle.tone).toBe('analytical');
      expect(profile.coreBeliefs.length).toBeGreaterThan(0);
      expect(profile.coreBeliefs[0]!.confidence).toBe(0.9);
      expect(profile.interestDomains.length).toBeGreaterThan(0);
      expect(profile.emotionalTriggers.anger.length).toBeGreaterThan(0);
      expect(profile.socialRole.primary).toBe('analyst');
      expect(profile.summary).toBeTruthy();
    });

    it('increments version when updating existing profile', async () => {
      const service = createService('fake-key');

      const mockResponse = {
        communicationStyle: { formality: 'casual', tone: 'mixed', complexity: 'moderate', evidence: [] },
        coreBeliefs: [],
        interestDomains: [],
        emotionalTriggers: { anger: [], excitement: [], fear: [], evidence: {} },
        engagementPatterns: { likelyToEngageWith: [], likelyToShare: [], likelyToCreate: [], contentPreferences: [] },
        influenceSusceptibility: { vulnerableTo: [], resistantTo: [], echoChamberDepth: 'none', evidence: [] },
        persuasionStyle: { primaryTechniques: [], targetAudience: '', effectiveness: 'low', evidence: [] },
        riskIndicators: { radicalizationSignals: [], manipulationVulnerability: 'low', echoChamberDepth: 'none', flags: [], evidence: [] },
        socialRole: { primary: 'follower', confidence: 0.5, evidence: [] },
        summary: 'Updated profile.',
      };

      (service as any).genAI = {
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockResolvedValue({
            response: { text: () => JSON.stringify(mockResponse) },
          }),
        }),
      };

      const existingProfile = {
        version: 2,
        generatedAt: new Date(),
        modelUsed: 'gemini-3.1-pro-preview',
        postCountAnalyzed: 50,
        communicationStyle: { formality: 'casual', tone: 'analytical', complexity: 'moderate', evidence: [] },
        coreBeliefs: [],
        interestDomains: [],
        emotionalTriggers: { anger: [], excitement: [], fear: [], evidence: {} },
        engagementPatterns: { likelyToEngageWith: [], likelyToShare: [], likelyToCreate: [], contentPreferences: [] },
        influenceSusceptibility: { vulnerableTo: [], resistantTo: [], echoChamberDepth: 'none', evidence: [] },
        persuasionStyle: { primaryTechniques: [], targetAudience: '', effectiveness: 'low', evidence: [] },
        riskIndicators: { radicalizationSignals: [], manipulationVulnerability: 'low', echoChamberDepth: 'none', flags: [], evidence: [] },
        socialRole: { primary: 'analyst', confidence: 0.7, evidence: [] },
        summary: 'Previous summary.',
      };

      const profile = await service.generateProfile({
        handle: 'testuser',
        platform: 'twitter',
        posts: makePosts(10),
        existingProfile: existingProfile as any,
      });

      expect(profile.version).toBe(3); // v2 + 1
    });

    it('handles LLM returning malformed JSON gracefully', async () => {
      const service = createService('fake-key');

      (service as any).genAI = {
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockResolvedValue({
            response: { text: () => 'This is not valid JSON at all.' },
          }),
        }),
      };

      await expect(
        service.generateProfile({
          handle: 'testuser',
          platform: 'twitter',
          posts: makePosts(5),
        }),
      ).rejects.toThrow();
    });
  });
});
