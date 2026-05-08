import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EvidenceSeed, Investigation } from '../schemas/investigation.schema';
import type { MentalModel } from '../schemas/mental-model.schema';
import type { ProjectDossier } from '../schemas/project-dossier.schema';
import type { InvestigationEvidenceDossier } from './investigation-evidence.service';

type SourceExcerpt = {
  label: string;
  kind: string;
  excerpt: string;
};

const JSON_SCHEMA = `{
  "domain": "short domain label",
  "theses": ["core thesis"],
  "heuristics": [
    { "title": "heuristic name", "description": "what the analyst/model looks for", "evidence": ["source label"] }
  ],
  "decisionRules": ["if/then decision rule"],
  "workflowSteps": ["step"],
  "evidencePreferences": ["preferred evidence type"],
  "blindSpots": ["likely weakness or missing angle"],
  "signaturePhrases": ["repeated phrase or framing pattern"],
  "summary": "2-3 paragraph summary of how this source or investigation corpus reasons"
}`;

@Injectable()
export class MentalModelService {
  private readonly logger = new Logger(MentalModelService.name);
  private readonly genAI: GoogleGenerativeAI | null = null;
  private readonly chatModel = 'gemini-2.0-flash';

  constructor(private readonly configService: ConfigService) {
    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') || process.env['GEMINI_API_KEY'];

    if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
    }
  }

  async buildFromInvestigation(params: {
    investigation: Investigation;
    evidenceDossier: InvestigationEvidenceDossier;
    projectDossier?: ProjectDossier | null;
  }): Promise<Partial<MentalModel>> {
    const { investigation, evidenceDossier, projectDossier } = params;
    const name = `${investigation.name?.trim() || investigation.query.trim()} Mental Model`;
    const sourceSummary = this.buildSourceSummary(
      investigation.evidenceSeeds ?? [],
      evidenceDossier,
    );
    const sourceExcerpts = this.buildSourceExcerpts(investigation.evidenceSeeds ?? []);

    const llmResult = await this.generateWithLLM(
      investigation,
      evidenceDossier,
      projectDossier ?? null,
      sourceExcerpts,
    );

    if (llmResult) {
      return {
        investigationId: investigation._id?.toString() ?? investigation.id,
        name,
        domain: llmResult.domain,
        sourceSummary,
        theses: llmResult.theses,
        heuristics: llmResult.heuristics,
        decisionRules: llmResult.decisionRules,
        workflowSteps: llmResult.workflowSteps,
        evidencePreferences: llmResult.evidencePreferences,
        blindSpots: llmResult.blindSpots,
        signaturePhrases: llmResult.signaturePhrases,
        summary: llmResult.summary,
        status: 'generated',
        modelUsed: this.chatModel,
        generatedAt: new Date(),
      };
    }

    return {
      investigationId: investigation._id?.toString() ?? investigation.id,
      name,
      domain: this.inferDomain(investigation, evidenceDossier),
      sourceSummary,
      theses: this.buildFallbackTheses(investigation, evidenceDossier),
      heuristics: this.buildFallbackHeuristics(investigation, evidenceDossier, sourceExcerpts),
      decisionRules: this.buildFallbackDecisionRules(evidenceDossier),
      workflowSteps: this.buildFallbackWorkflow(evidenceDossier),
      evidencePreferences: this.buildFallbackEvidencePreferences(investigation.evidenceSeeds ?? []),
      blindSpots: this.buildFallbackBlindSpots(evidenceDossier),
      signaturePhrases: this.buildSignaturePhrases(investigation.evidenceSeeds ?? []),
      summary: this.buildFallbackSummary(investigation, evidenceDossier, sourceExcerpts),
      status: 'fallback',
      modelUsed: 'deterministic-fallback',
      generatedAt: new Date(),
    };
  }

  private async generateWithLLM(
    investigation: Investigation,
    evidenceDossier: InvestigationEvidenceDossier,
    projectDossier: ProjectDossier | null,
    sourceExcerpts: SourceExcerpt[],
  ): Promise<{
    domain: string;
    theses: string[];
    heuristics: Array<{ title: string; description: string; evidence: string[] }>;
    decisionRules: string[];
    workflowSteps: string[];
    evidencePreferences: string[];
    blindSpots: string[];
    signaturePhrases: string[];
    summary: string;
  } | null> {
    if (!this.genAI || sourceExcerpts.length === 0) {
      return null;
    }

    const prompt = `You are extracting a reusable domain-specific mental model from an investigation evidence bundle.

The goal is to describe how this corpus reasons, what it looks for, and the repeatable investigative heuristics it suggests.

Investigation:
- Query: ${investigation.query}
- Name: ${investigation.name ?? investigation.query}
- Evidence seeds: ${evidenceDossier.totalSeeds}
- Processed seeds: ${evidenceDossier.processedSeeds}
- Top entity types: ${
      Object.entries(evidenceDossier.entityCounts)
        .map(([key, value]) => `${key}:${value}`)
        .join(', ') || 'none'
    }
- Project dossier entities: ${
      projectDossier?.topEntities
        .slice(0, 8)
        .map((entity) => `${entity.type}:${entity.displayValue}`)
        .join(' | ') ?? 'none'
    }

Source excerpts:
${sourceExcerpts.map((source, index) => `${index + 1}. [${source.kind}] ${source.label}\n${source.excerpt}`).join('\n\n')}

Return ONLY JSON matching this schema:
${JSON_SCHEMA}

Rules:
- Focus on reasoning patterns, heuristics, and workflow rather than biography.
- Do not invent evidence not grounded in the excerpts.
- Prefer compact, reusable statements that could be applied to another investigation.`;

    try {
      const model = this.genAI.getGenerativeModel({ model: this.chatModel });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        return null;
      }

      const parsed = JSON.parse(match[0]) as Record<string, unknown>;
      return {
        domain: this.asString(parsed['domain']) || this.inferDomain(investigation, evidenceDossier),
        theses: this.asStringArray(parsed['theses']).slice(0, 6),
        heuristics: this.asHeuristics(parsed['heuristics']).slice(0, 8),
        decisionRules: this.asStringArray(parsed['decisionRules']).slice(0, 8),
        workflowSteps: this.asStringArray(parsed['workflowSteps']).slice(0, 8),
        evidencePreferences: this.asStringArray(parsed['evidencePreferences']).slice(0, 8),
        blindSpots: this.asStringArray(parsed['blindSpots']).slice(0, 6),
        signaturePhrases: this.asStringArray(parsed['signaturePhrases']).slice(0, 8),
        summary:
          this.asString(parsed['summary']) ||
          this.buildFallbackSummary(investigation, evidenceDossier, sourceExcerpts),
      };
    } catch (error) {
      this.logger.warn(`Mental model generation fell back to deterministic mode: ${error}`);
      return null;
    }
  }

  private buildSourceSummary(seeds: EvidenceSeed[], evidenceDossier: InvestigationEvidenceDossier) {
    return {
      totalSeeds: evidenceDossier.totalSeeds,
      processedSeeds: evidenceDossier.processedSeeds,
      seedKinds: [...new Set(seeds.map((seed) => seed.kind))].sort(),
      evidenceLabels: seeds
        .map((seed) => seed.label?.trim() || seed.value.trim())
        .filter(Boolean)
        .slice(0, 10),
    };
  }

  private buildSourceExcerpts(seeds: EvidenceSeed[]): SourceExcerpt[] {
    const excerpts: SourceExcerpt[] = [];
    for (const seed of seeds) {
      const preview =
        typeof seed.metadata?.['contentPreview'] === 'string'
          ? seed.metadata['contentPreview']
          : '';
      const notes = seed.notes ?? '';
      const excerpt = [notes, preview]
        .map((value) => value.trim())
        .filter(Boolean)
        .join('\n')
        .slice(0, 1800);

      if (!excerpt) {
        continue;
      }

      excerpts.push({
        label: seed.label?.trim() || seed.value.trim(),
        kind: seed.kind,
        excerpt,
      });

      if (excerpts.length >= 8) {
        break;
      }
    }

    return excerpts;
  }

  private inferDomain(
    investigation: Investigation,
    evidenceDossier: InvestigationEvidenceDossier,
  ): string {
    if (
      (evidenceDossier.entityCounts['wallet'] ?? 0) > 0 ||
      (evidenceDossier.entityCounts['contract'] ?? 0) > 0
    ) {
      return 'Crypto / on-chain forensic analysis';
    }
    if (
      (evidenceDossier.entityCounts['domain'] ?? 0) > 0 ||
      (evidenceDossier.entityCounts['handle'] ?? 0) > 0
    ) {
      return 'Open-source infrastructure and account correlation';
    }
    return `Investigation reasoning for ${investigation.name?.trim() || investigation.query.trim()}`;
  }

  private buildFallbackTheses(
    investigation: Investigation,
    evidenceDossier: InvestigationEvidenceDossier,
  ): string[] {
    const theses = [
      'Anchor judgments to explicit source material before escalating a claim.',
      'Treat repeated infrastructure across sources as a stronger signal than isolated mentions.',
    ];

    if (
      (evidenceDossier.entityCounts['wallet'] ?? 0) > 0 ||
      (evidenceDossier.entityCounts['contract'] ?? 0) > 0
    ) {
      theses.push(
        'Use wallet and contract reuse as a practical bridge between narrative claims and operator linkage.',
      );
    }

    if (
      (evidenceDossier.entityCounts['domain'] ?? 0) > 0 ||
      (evidenceDossier.entityCounts['url'] ?? 0) > 0
    ) {
      theses.push(
        'Web infrastructure and outbound links are useful for comparing projects that appear unrelated on the surface.',
      );
    }

    theses.push(
      `Keep the model scoped to the ${investigation.name?.trim() || investigation.query.trim()} evidence bundle and refresh it as new seeds arrive.`,
    );
    return theses.slice(0, 6);
  }

  private buildFallbackHeuristics(
    investigation: Investigation,
    evidenceDossier: InvestigationEvidenceDossier,
    sourceExcerpts: SourceExcerpt[],
  ): Array<{ title: string; description: string; evidence: string[] }> {
    const firstEvidence = sourceExcerpts.slice(0, 2).map((source) => source.label);
    const heuristics = [
      {
        title: 'Start from pinned evidence',
        description:
          'Begin with the attached seeds and analyst notes instead of broad speculation, then expand outward from extracted entities.',
        evidence: firstEvidence,
      },
      {
        title: 'Normalize repeated entities',
        description:
          'Collapse wallets, contracts, domains, handles, and channels into canonical forms before making overlap claims.',
        evidence: sourceExcerpts.slice(0, 3).map((source) => source.label),
      },
    ];

    if (
      (evidenceDossier.entityCounts['wallet'] ?? 0) > 0 ||
      (evidenceDossier.entityCounts['contract'] ?? 0) > 0
    ) {
      heuristics.push({
        title: 'Follow financial touchpoints',
        description:
          'Use recurring addresses, counterparties, and token touchpoints to decide whether separate projects may share operators.',
        evidence: sourceExcerpts
          .filter((source) => ['wallet', 'contract', 'youtube', 'article'].includes(source.kind))
          .slice(0, 3)
          .map((source) => source.label),
      });
    }

    if ((evidenceDossier.entityCounts['domain'] ?? 0) > 0) {
      heuristics.push({
        title: 'Compare infrastructure, not just narrative',
        description:
          'Look for shared domains, URLs, or communication channels before concluding that two campaigns are unrelated.',
        evidence: sourceExcerpts
          .filter((source) => ['url', 'article', 'domain', 'document'].includes(source.kind))
          .slice(0, 3)
          .map((source) => source.label),
      });
    }

    return heuristics.slice(0, 8);
  }

  private buildFallbackDecisionRules(evidenceDossier: InvestigationEvidenceDossier): string[] {
    const rules = [
      'Prefer claims supported by multiple processed seeds over single-source assertions.',
      'Escalate overlap only when the same canonical entity appears across separate sources or dossiers.',
      'Treat new entities as leads until they are linked back to a concrete source excerpt.',
    ];

    if ((evidenceDossier.entityCounts['wallet'] ?? 0) > 0) {
      rules.push(
        'When wallet evidence exists, prioritize on-chain counterparties and repeated token touchpoints over vague social similarity.',
      );
    }

    return rules.slice(0, 8);
  }

  private buildFallbackWorkflow(evidenceDossier: InvestigationEvidenceDossier): string[] {
    const steps = [
      'Review attached evidence and notes for explicit claims or hypotheses.',
      'Extract and normalize wallets, contracts, domains, handles, channels, and URLs.',
      'Promote the highest-signal entities into a durable dossier snapshot.',
      'Compare that dossier against other cases for repeated infrastructure and actors.',
    ];

    if (
      (evidenceDossier.entityCounts['wallet'] ?? 0) > 0 ||
      (evidenceDossier.entityCounts['contract'] ?? 0) > 0
    ) {
      steps.push(
        'Use on-chain enrichment to test whether the dossier addresses share counterparties or token relationships.',
      );
    }

    return steps.slice(0, 8);
  }

  private buildFallbackEvidencePreferences(seeds: EvidenceSeed[]): string[] {
    const preferences = new Set<string>();
    for (const seed of seeds) {
      if (seed.kind === 'youtube')
        preferences.add('Long-form transcript evidence and source walkthroughs');
      if (seed.kind === 'article' || seed.kind === 'document')
        preferences.add('Structured written analysis and published documentation');
      if (seed.kind === 'wallet' || seed.kind === 'contract')
        preferences.add('Direct wallet and contract identifiers');
      if (seed.kind === 'domain' || seed.kind === 'url')
        preferences.add('Infrastructure and outbound-link evidence');
      if (seed.kind === 'note')
        preferences.add('Analyst hypotheses paired with explicit corroboration');
    }
    if (preferences.size === 0) {
      preferences.add('Pinned source excerpts with traceable provenance');
    }
    return [...preferences].slice(0, 8);
  }

  private buildFallbackBlindSpots(evidenceDossier: InvestigationEvidenceDossier): string[] {
    const blindSpots = [
      'This model is only as strong as the attached evidence bundle and may miss external context not yet seeded.',
    ];
    if (
      (evidenceDossier.entityCounts['wallet'] ?? 0) === 0 &&
      (evidenceDossier.entityCounts['contract'] ?? 0) === 0
    ) {
      blindSpots.push(
        'Without wallet or contract evidence, operator linkage remains more inferential than financial.',
      );
    }
    if ((evidenceDossier.entityCounts['domain'] ?? 0) === 0) {
      blindSpots.push('Missing domain or URL evidence weakens infrastructure-level comparison.');
    }
    return blindSpots.slice(0, 6);
  }

  private buildSignaturePhrases(seeds: EvidenceSeed[]): string[] {
    return [
      ...new Set(
        seeds
          .flatMap((seed) => [seed.label, seed.notes])
          .filter((value): value is string => Boolean(value?.trim()))
          .flatMap((value) => value.split(/[.!?\n]/))
          .map((value) => value.trim())
          .filter((value) => value.length >= 24 && value.length <= 96),
      ),
    ].slice(0, 6);
  }

  private buildFallbackSummary(
    investigation: Investigation,
    evidenceDossier: InvestigationEvidenceDossier,
    sourceExcerpts: SourceExcerpt[],
  ): string {
    void sourceExcerpts;
    const name = investigation.name?.trim() || investigation.query.trim();
    const entitySummary = Object.entries(evidenceDossier.entityCounts)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `${count} ${key}`)
      .slice(0, 6)
      .join(', ');

    return `${name} currently yields a tradecraft model centered on pinned evidence, canonical entity extraction, and repeated-infrastructure comparison. The model assumes that stronger conclusions come from entities that recur across multiple processed seeds rather than from isolated claims.\n\nThe current corpus emphasizes ${entitySummary || 'a still-thin evidence bundle'}, which means the strongest behaviors in this model are evidence triage, normalization, and case-to-case comparison. As more seeds are attached, the model should become more specific about favored heuristics, decision thresholds, and recurring phrases.`;
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private asStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)
      : [];
  }

  private asHeuristics(
    value: unknown,
  ): Array<{ title: string; description: string; evidence: string[] }> {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const record = entry as Record<string, unknown>;
        const title = this.asString(record['title']);
        const description = this.asString(record['description']);
        if (!title || !description) return null;
        return {
          title,
          description,
          evidence: this.asStringArray(record['evidence']).slice(0, 4),
        };
      })
      .filter(
        (entry): entry is { title: string; description: string; evidence: string[] } =>
          entry != null,
      );
  }
}
