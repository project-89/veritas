import {
  DeviationMetrics,
  ExtendedContentNode,
  Pattern,
  TimeFrame,
  TimeFrameInput,
} from '../analysis.types';

export const ANALYSIS_SERVICE = Symbol('ANALYSIS_SERVICE');

export interface AnalysisServiceInterface {
  measureRealityDeviation(narrativeId: string): Promise<Omit<DeviationMetrics, 'timeframe'>>;
  detectPatterns(timeframe: TimeFrame | TimeFrameInput): Promise<Pattern[]>;
  detectPatternsForContent(content: ExtendedContentNode): Promise<Pattern[]>;
  calculateContentDeviation(
    content: ExtendedContentNode,
  ): Promise<Omit<DeviationMetrics, 'timeframe'>>;
  getContentById(contentId: string): Promise<ExtendedContentNode | null>;
  findRelatedContent(content: ExtendedContentNode): Promise<ExtendedContentNode[]>;
  calculateSourceCredibility(sourceId: string): Promise<number>;
}
