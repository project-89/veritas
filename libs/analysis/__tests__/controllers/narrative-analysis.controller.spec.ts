import { Test, TestingModule } from '@nestjs/testing';
import { NarrativeAnalysisController } from '../../src/lib/controllers/narrative-analysis.controller';
import { ClaimVerificationService } from '../../src/lib/services/claim-verification.service';
import { ComparisonService } from '../../src/lib/services/comparison.service';
import { CoverageProbeService } from '../../src/lib/services/coverage-probe.service';
import { FailureExampleService } from '../../src/lib/services/failure-example.service';
import { DeviationService } from '../../src/lib/services/deviation.service';
import { DownstreamEffectsService } from '../../src/lib/services/downstream-effects.service';
import { EntityAnalysisService } from '../../src/lib/services/entity-analysis.service';
import { NarrativeGenealogyService } from '../../src/lib/services/genealogy.service';
import { IntelligenceEngineService } from '../../src/lib/services/intelligence-engine.service';
import {
  AnalyzeResult,
  NarrativeAnalysisService,
} from '../../src/lib/services/narrative-analysis.service';
import { PropagandaAnalysisService } from '../../src/lib/services/propaganda.service';
import { ReportService } from '../../src/lib/services/report.service';

describe('NarrativeAnalysisController', () => {
  let controller: NarrativeAnalysisController;
  let service: NarrativeAnalysisService;

  const mockAnalyzeResult: AnalyzeResult = {
    narratives: [
      {
        id: 'narrative-0',
        summary: 'Test narrative about climate change',
        postIndices: [0, 1, 2],
        avgSentiment: 0.3,
        sentimentTrajectory: [
          { timestamp: '2025-01-01T00:00:00Z', score: 0.2 },
          { timestamp: '2025-01-02T00:00:00Z', score: 0.4 },
        ],
        platforms: { twitter: 2, reddit: 1 },
        authors: [{ name: 'User A', handle: 'usera', postCount: 2 }],
        firstSeen: '2025-01-01T00:00:00Z',
        lastSeen: '2025-01-02T00:00:00Z',
        totalEngagement: 150,
        velocity: { postsPerHour: 0.125, acceleration: 0.1, trend: 'steady' },
        centroidEmbedding: [0.1, 0.2, 0.3],
      },
    ],
    unclustered: [3],
    embeddingSource: 'gemini',
    summarySource: 'llm',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NarrativeAnalysisController],
      providers: [
        {
          provide: NarrativeAnalysisService,
          useValue: {
            analyze: jest.fn().mockResolvedValue(mockAnalyzeResult),
          },
        },
        {
          provide: DeviationService,
          useValue: {
            computeDeviations: jest.fn().mockReturnValue([]),
            toRealityTunnelData: jest.fn().mockReturnValue([]),
            toEnhancedTunnelData: jest.fn().mockReturnValue({}),
          },
        },
        {
          provide: ReportService,
          useValue: {
            generateReport: jest
              .fn()
              .mockResolvedValue({ content: '# Report', generatedAt: new Date().toISOString() }),
          },
        },
        {
          provide: PropagandaAnalysisService,
          useValue: {
            analyze: jest.fn().mockResolvedValue({
              techniques: [],
              claims: [],
              frames: [],
              overallAssessment: {
                manipulationLikelihood: 'low',
                confidence: 0,
                reasoning: '',
                caveats: [],
              },
            }),
          },
        },
        {
          provide: ComparisonService,
          useValue: {
            compareNarratives: jest.fn().mockReturnValue({}),
            compareTimePeriods: jest.fn().mockReturnValue({}),
            comparePlatforms: jest.fn().mockReturnValue({}),
          },
        },
        {
          provide: EntityAnalysisService,
          useValue: {
            buildEntityDossiers: jest.fn().mockReturnValue([]),
            buildCoOccurrenceNetwork: jest.fn().mockReturnValue({ nodes: [], edges: [] }),
          },
        },
        {
          provide: NarrativeGenealogyService,
          useValue: {
            traceLineage: jest.fn().mockReturnValue([]),
            buildFullGenealogy: jest.fn().mockReturnValue([]),
          },
        },
        {
          provide: DownstreamEffectsService,
          useValue: {
            analyze: jest
              .fn()
              .mockResolvedValue({ narrativeCorrelations: [], externalSignals: [], summary: '' }),
            toMyceliumData: jest.fn().mockReturnValue({ nodes: [], branches: [], clusters: [] }),
          },
        },
        {
          provide: ClaimVerificationService,
          useValue: {
            verifyClaims: jest.fn().mockResolvedValue({
              results: [],
              summary: '',
              verifiedCount: 0,
              disputedCount: 0,
              unverifiedCount: 0,
            }),
          },
        },
        {
          provide: IntelligenceEngineService,
          useValue: {
            detectCoordinatedCampaign: jest.fn().mockReturnValue({
              detected: false,
              confidence: 0,
              signals: [],
              actors: [],
              timeline: [],
              summary: '',
            }),
            detectMarketManipulation: jest.fn().mockReturnValue({
              detected: false,
              confidence: 0,
              patterns: [],
              affectedAssets: [],
              timeline: [],
              summary: '',
            }),
            assessCrisisRisk: jest.fn().mockReturnValue({ alerts: [], regions: [], summary: '' }),
            attributeInfluenceOperation: jest.fn().mockReturnValue({
              detected: false,
              confidence: 0,
              originators: [],
              amplificationNetwork: [],
              beneficiaries: [],
              techniques: [],
              timeline: [],
              summary: '',
            }),
            scoreNarrativeLegitimacy: jest.fn().mockReturnValue({
              narrativeId: '',
              narrativeSummary: '',
              legitimacyScore: 0.5,
              verdict: 'uncertain',
              factualClaims: [],
              platformBreakdown: [],
              sourceQuality: 0.5,
              evidenceBalance: { supporting: 0, contradicting: 0, neutral: 0 },
              investigativeLeads: [],
              summary: '',
            }),
          },
        },
        {
          provide: CoverageProbeService,
          useValue: {
            probe: jest.fn().mockResolvedValue({
              probed: false,
              source: 'gdelt-timelinevol',
              timeline: [],
              totalVolume: 0,
            }),
          },
        },
        {
          provide: FailureExampleService,
          useValue: {
            extract: jest.fn().mockResolvedValue({
              status: 'skipped',
              subject: '',
              examples: [],
              vagueComplaintCount: 0,
              ungroundedDropped: 0,
              postsScanned: 0,
              modelUsed: null,
              promptVersion: 1,
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<NarrativeAnalysisController>(NarrativeAnalysisController);
    service = module.get<NarrativeAnalysisService>(NarrativeAnalysisService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /narratives/analyze', () => {
    it('should call service.analyze with posts', async () => {
      const posts = [
        {
          text: 'test post',
          platform: 'twitter',
          authorName: 'Test',
          authorHandle: 'test',
          timestamp: '2025-01-01T00:00:00Z',
        },
      ];

      const result = await controller.analyze({ posts });

      expect(service.analyze).toHaveBeenCalledWith(posts);
      expect(result).toEqual(mockAnalyzeResult);
    });

    it('should handle empty posts array', async () => {
      (service.analyze as jest.Mock).mockResolvedValue({
        narratives: [],
        unclustered: [],
      });

      const result = await controller.analyze({ posts: [] });

      expect(service.analyze).toHaveBeenCalledWith([]);
      expect(result.narratives).toEqual([]);
      expect(result.unclustered).toEqual([]);
    });

    it('should handle undefined posts gracefully', async () => {
      (service.analyze as jest.Mock).mockResolvedValue({
        narratives: [],
        unclustered: [],
      });

      await controller.analyze({ posts: undefined as any });

      expect(service.analyze).toHaveBeenCalledWith([]);
    });

    it('should return narratives with all required fields', async () => {
      const result = await controller.analyze({
        posts: [
          {
            text: 'test',
            platform: 'twitter',
            authorName: 'T',
            authorHandle: 't',
            timestamp: '2025-01-01T00:00:00Z',
          },
        ],
      });

      const narrative = result.narratives[0]!;
      expect(narrative.id).toBeDefined();
      expect(narrative.summary).toBeDefined();
      expect(narrative.postIndices).toBeDefined();
      expect(narrative.avgSentiment).toBeDefined();
      expect(narrative.sentimentTrajectory).toBeDefined();
      expect(narrative.platforms).toBeDefined();
      expect(narrative.authors).toBeDefined();
      expect(narrative.velocity).toBeDefined();
      expect(narrative.velocity.trend).toBeDefined();
    });
  });
});
