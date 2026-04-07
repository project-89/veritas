import { Injectable } from '@nestjs/common';
import { Investigation } from '../schemas/investigation.schema';
import {
  ProjectDossier,
  ProjectDossierOnChainSummary,
  ProjectEntity,
  ProjectDossierOverlap,
} from '../schemas/project-dossier.schema';
import { InvestigationEvidenceDossier } from './investigation-evidence.service';

const OVERLAP_WEIGHTS: Record<string, number> = {
  contract: 8,
  wallet: 7,
  address: 6,
  domain: 5,
  handle: 4,
  telegram: 4,
  youtube_video: 2,
  url: 1,
};

@Injectable()
export class ProjectDossierService {
  buildFromInvestigation(
    investigation: Investigation,
    evidenceDossier: InvestigationEvidenceDossier,
    onChainSummary: ProjectDossierOnChainSummary | null = null,
  ): Partial<ProjectDossier> {
    const name = investigation.name?.trim() || investigation.query.trim();
    const aliases = Array.from(new Set([investigation.name, investigation.query].map((value) => value.trim()).filter(Boolean)));

    return {
      investigationId: investigation._id?.toString() ?? investigation.id,
      name,
      slug: this.slugify(name),
      aliases,
      summary: {
        totalSeeds: evidenceDossier.totalSeeds,
        processedSeeds: evidenceDossier.processedSeeds,
        entityCounts: evidenceDossier.entityCounts,
      },
      groupedEntities: evidenceDossier.groupedEntities,
      topEntities: evidenceDossier.topEntities,
      onChainSummary,
      generatedAt: new Date(evidenceDossier.generatedAt),
    };
  }

  compareAgainstMany(
    source: ProjectDossier,
    others: ProjectDossier[],
  ): ProjectDossierOverlap[] {
    return others
      .filter((candidate) => candidate.investigationId !== source.investigationId)
      .map((candidate) => this.comparePair(source, candidate))
      .filter((overlap): overlap is ProjectDossierOverlap => overlap != null)
      .sort((a, b) => b.score - a.score);
  }

  private comparePair(
    source: ProjectDossier,
    candidate: ProjectDossier,
  ): ProjectDossierOverlap | null {
    const sourceMap = this.buildEntityMap(source.topEntities ?? []);
    const candidateMap = this.buildEntityMap(candidate.topEntities ?? []);
    const sharedEntities: ProjectDossierOverlap['sharedEntities'] = [];

    for (const [key, entity] of sourceMap.entries()) {
      const match = candidateMap.get(key);
      if (!match) continue;

      const weight = OVERLAP_WEIGHTS[entity.type] ?? 1;
      sharedEntities.push({
        type: entity.type,
        value: entity.displayValue,
        sourceCount: Math.min(entity.sourceCount, match.sourceCount),
        weight,
      });
    }

    for (const sharedCounterparty of this.intersectValues(
      source.onChainSummary?.commonCounterparties.map((entry) => entry.address) ?? [],
      candidate.onChainSummary?.commonCounterparties.map((entry) => entry.address) ?? [],
    )) {
      sharedEntities.push({
        type: 'counterparty',
        value: sharedCounterparty,
        sourceCount: 1,
        weight: 9,
      });
    }

    for (const sharedTokenContract of this.intersectValues(
      source.onChainSummary?.tokenContracts.map((entry) => entry.address) ?? [],
      candidate.onChainSummary?.tokenContracts.map((entry) => entry.address) ?? [],
    )) {
      sharedEntities.push({
        type: 'token_contract',
        value: sharedTokenContract,
        sourceCount: 1,
        weight: 6,
      });
    }

    if (sharedEntities.length === 0) {
      return null;
    }

    const score = sharedEntities.reduce((total, entity) => total + entity.weight * Math.max(entity.sourceCount, 1), 0);
    const matchedTypes = Array.from(new Set(sharedEntities.map((entity) => entity.type)));

    return {
      dossierId: candidate._id?.toString() ?? candidate.id,
      investigationId: candidate.investigationId,
      name: candidate.name,
      score,
      matchedTypes,
      sharedEntities: sharedEntities
        .sort((a, b) => b.weight - a.weight || b.sourceCount - a.sourceCount || a.value.localeCompare(b.value))
        .slice(0, 12),
    };
  }

  private buildEntityMap(entities: ProjectEntity[]): Map<string, ProjectEntity> {
    const map = new Map<string, ProjectEntity>();
    for (const entity of entities ?? []) {
      map.set(`${entity.type}:${entity.value.toLowerCase()}`, entity);
    }
    return map;
  }

  extractAddressCandidates(evidenceDossier: InvestigationEvidenceDossier): string[] {
    const candidates = [
      ...(evidenceDossier.groupedEntities['wallet'] ?? []),
      ...(evidenceDossier.groupedEntities['contract'] ?? []),
      ...(evidenceDossier.groupedEntities['address'] ?? []),
    ];

    return [...new Set(candidates.map((entity) => entity.value.toLowerCase()))].slice(0, 6);
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
  }

  private intersectValues(a: string[], b: string[]): string[] {
    const right = new Set(b.map((value) => value.toLowerCase()));
    return [...new Set(a.filter((value) => right.has(value.toLowerCase())).map((value) => value.toLowerCase()))];
  }
}
