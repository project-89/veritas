import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { EvidenceSeed } from './investigation.schema';

@Schema({ _id: false })
class ProjectEntitySourceEmbed {
  @Prop({ required: true, type: String })
  seedId!: string;

  @Prop({ required: true, type: String })
  kind!: EvidenceSeed['kind'];

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ required: true, type: String })
  status!: string;
}

@Schema({ _id: false })
class ProjectEntityEmbed {
  @Prop({ required: true, type: String })
  type!: string;

  @Prop({ required: true, type: String })
  value!: string;

  @Prop({ required: true, type: String })
  displayValue!: string;

  @Prop({ required: true, type: Number })
  sourceCount!: number;

  @Prop({ required: true, type: Number })
  occurrenceCount!: number;

  @Prop({ type: [ProjectEntitySourceEmbed], default: [] })
  sources!: ProjectEntitySourceEmbed[];
}

@Schema({ _id: false })
class ProjectDossierSummaryEmbed {
  @Prop({ required: true, type: Number })
  totalSeeds!: number;

  @Prop({ required: true, type: Number })
  processedSeeds!: number;

  @Prop({ type: Object, default: {} })
  entityCounts!: Record<string, number>;
}

@Schema({ _id: false })
class OnChainCounterpartyEmbed {
  @Prop({ required: true, type: String })
  address!: string;

  @Prop({ required: true, type: Number })
  addressCount!: number;

  @Prop({ type: [String], default: [] })
  addresses!: string[];
}

@Schema({ _id: false })
class OnChainTokenContractEmbed {
  @Prop({ required: true, type: String })
  address!: string;

  @Prop({ type: String, default: null })
  symbol!: string | null;

  @Prop({ required: true, type: Number })
  occurrenceCount!: number;
}

@Schema({ _id: false })
class OnChainAddressSummaryEmbed {
  @Prop({ required: true, type: String })
  address!: string;

  @Prop({ required: true, type: Number })
  txCount!: number;

  @Prop({ required: true, type: Number })
  uniqueCounterparties!: number;

  @Prop({ type: [String], default: [] })
  topCounterparties!: string[];

  @Prop({ type: [String], default: [] })
  tokenContracts!: string[];

  @Prop({ type: [String], default: [] })
  tokenSymbols!: string[];
}

@Schema({ _id: false })
class ProjectDossierOnChainSummaryEmbed {
  @Prop({
    required: true,
    type: String,
    enum: ['unavailable', 'partial', 'ready'],
    default: 'unavailable',
  })
  status!: 'unavailable' | 'partial' | 'ready';

  @Prop({ type: [String], default: [] })
  analyzedAddresses!: string[];

  @Prop({ type: [OnChainAddressSummaryEmbed], default: [] })
  addressSummaries!: OnChainAddressSummaryEmbed[];

  @Prop({ type: [OnChainCounterpartyEmbed], default: [] })
  commonCounterparties!: OnChainCounterpartyEmbed[];

  @Prop({ type: [OnChainTokenContractEmbed], default: [] })
  tokenContracts!: OnChainTokenContractEmbed[];

  @Prop({ type: String, default: null })
  note!: string | null;
}

@Schema({
  collection: 'project_dossiers',
  timestamps: true,
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class ProjectDossierSchema extends Document {
  @Prop({ required: true, type: String, index: true, unique: true })
  investigationId!: string;

  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ required: true, type: String })
  slug!: string;

  @Prop({ type: [String], default: [] })
  aliases!: string[];

  @Prop({ required: true, type: ProjectDossierSummaryEmbed })
  summary!: ProjectDossierSummaryEmbed;

  @Prop({ type: Object, default: {} })
  groupedEntities!: Record<string, ProjectEntityEmbed[]>;

  @Prop({ type: [ProjectEntityEmbed], default: [] })
  topEntities!: ProjectEntityEmbed[];

  @Prop({ type: ProjectDossierOnChainSummaryEmbed, default: null })
  onChainSummary!: ProjectDossierOnChainSummaryEmbed | null;

  @Prop({ required: true, type: Date, default: () => new Date() })
  generatedAt!: Date;
}

export const ProjectDossierModel = SchemaFactory.createForClass(ProjectDossierSchema);

ProjectDossierModel.index({ updatedAt: -1 });
ProjectDossierModel.index({ slug: 1 });

export interface ProjectEntitySource {
  seedId: string;
  kind: EvidenceSeed['kind'];
  label: string;
  status: string;
}

export interface ProjectEntity {
  type: string;
  value: string;
  displayValue: string;
  sourceCount: number;
  occurrenceCount: number;
  sources: ProjectEntitySource[];
}

export interface ProjectDossierSummary {
  totalSeeds: number;
  processedSeeds: number;
  entityCounts: Record<string, number>;
}

export interface ProjectDossierOnChainCounterparty {
  address: string;
  addressCount: number;
  addresses: string[];
}

export interface ProjectDossierOnChainTokenContract {
  address: string;
  symbol: string | null;
  occurrenceCount: number;
}

export interface ProjectDossierOnChainAddressSummary {
  address: string;
  txCount: number;
  uniqueCounterparties: number;
  topCounterparties: string[];
  tokenContracts: string[];
  tokenSymbols: string[];
}

export interface ProjectDossierOnChainSummary {
  status: 'unavailable' | 'partial' | 'ready';
  analyzedAddresses: string[];
  addressSummaries: ProjectDossierOnChainAddressSummary[];
  commonCounterparties: ProjectDossierOnChainCounterparty[];
  tokenContracts: ProjectDossierOnChainTokenContract[];
  note: string | null;
}

export interface ProjectDossier {
  _id: string;
  id: string;
  investigationId: string;
  name: string;
  slug: string;
  aliases: string[];
  summary: ProjectDossierSummary;
  groupedEntities: Record<string, ProjectEntity[]>;
  topEntities: ProjectEntity[];
  onChainSummary: ProjectDossierOnChainSummary | null;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectDossierOverlap {
  dossierId: string;
  investigationId: string;
  name: string;
  score: number;
  matchedTypes: string[];
  sharedEntities: Array<{
    type: string;
    value: string;
    sourceCount: number;
    weight: number;
  }>;
}
