export interface LandscapePoint {
  x: number;
  y: number;
  elevation: number; // Height/strength of narrative at this point
  narrativeIds: string[]; // IDs of narratives influencing this point
  dominantNarrativeId?: string; // ID of the strongest narrative at this point
  color: string; // Visual color for this point
}

export interface LandscapeFeature {
  id: string;
  type: 'peak' | 'valley' | 'ridge' | 'basin';
  name: string;
  description: string;
  center: {
    x: number;
    y: number;
  };
  radius: number; // Approximate radius of influence
  narrativeId: string; // Associated narrative
  metrics: {
    prominence: number; // How distinct this feature is
    significance: number; // Importance in the overall landscape
    stability: number; // How stable/established this feature is
  };
}

export interface NarrativePath {
  id: string;
  name: string;
  description: string;
  points: Array<{ x: number; y: number }>;
  narrativeId: string;
  metrics: {
    elevation: number[]; // Elevation profile along the path
    gradient: number; // Overall steepness/change rate
    significance: number; // Importance of this path
  };
}

export interface LandscapeData {
  width: number; // Grid width
  height: number; // Grid height
  resolution: number; // Points per unit
  elevationData: number[][]; // 2D grid of elevation values
  colorData: string[][]; // 2D grid of color values
  features: LandscapeFeature[];
  paths: NarrativePath[];
  narratives: Array<{
    id: string;
    name: string;
    color: string;
    strength: number;
  }>;
  metadata: {
    timestamp: Date;
    timeframe: {
      start: Date;
      end: Date;
    };
    maxElevation: number;
    minElevation: number;
  };
}

export interface LandscapeVisualizationProps {
  data: LandscapeData;
  width?: number;
  height?: number;
  onFeatureClick?: (feature: LandscapeFeature) => void;
  onPathClick?: (path: NarrativePath) => void;
  showLabels?: boolean;
  showPaths?: boolean;
  showFeatures?: boolean;
  perspective?: number; // 0-1, controls 3D perspective intensity
  lightAngle?: number; // 0-360, angle of light source for shading
  exaggeration?: number; // Factor to exaggerate elevation differences
  colorScheme?: string[];
  interactive?: boolean;
}
