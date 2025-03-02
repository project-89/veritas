# Narrative Landscape Visualization

The Narrative Landscape visualization presents narratives as a topographical landscape where elevation indicates narrative strength and proximity indicates similarity. This visualization is particularly effective at showing the relative dominance of narratives and identifying significant features in the narrative landscape.

## Features

- 3D topographical landscape visualization
- Elevation mapping for narrative strength
- Color mapping for narrative identification
- Interactive exploration of landscape features
- Path tracing for narrative evolution
- Lighting and shading for enhanced depth perception

## Data Structure

The Narrative Landscape component requires data in the following structure:

```typescript
interface LandscapePoint {
  x: number;
  y: number;
  elevation: number; // Height/strength of narrative at this point
  narrativeIds: string[]; // IDs of narratives influencing this point
  dominantNarrativeId?: string; // ID of the strongest narrative at this point
  color: string; // Visual color for this point
}

interface LandscapeFeature {
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

interface NarrativePath {
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

interface LandscapeData {
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
```

## Props

| Prop | Type | Description | Default |
|------|------|-------------|---------|
| data | LandscapeData | The landscape data to visualize | (required) |
| width | number | Width of the visualization in pixels | 800 |
| height | number | Height of the visualization in pixels | 600 |
| onFeatureClick | (feature: LandscapeFeature) => void | Callback when a feature is clicked | undefined |
| onPathClick | (path: NarrativePath) => void | Callback when a path is clicked | undefined |
| showLabels | boolean | Whether to show labels for features and paths | true |
| showPaths | boolean | Whether to show narrative paths | true |
| showFeatures | boolean | Whether to highlight landscape features | true |
| perspective | number | Perspective depth for 3D effects (0-1) | 0.5 |
| lightAngle | number | Angle of light source for shading (0-360) | 315 |
| exaggeration | number | Factor to exaggerate elevation differences | 1.5 |
| colorScheme | string[] | Custom color scheme for narratives | undefined |
| interactive | boolean | Whether the visualization is interactive | true |

## Example Usage

```tsx
import { NarrativeLandscapeVisualization, generateLandscapeData } from '@veritas-nx/visualization';
import { useState } from 'react';

// Sample data or data from API
const sampleData = generateLandscapeData();

const LandscapeExample = () => {
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [selectedPath, setSelectedPath] = useState(null);
  
  const handleFeatureClick = (feature) => {
    setSelectedFeature(feature);
    console.log('Feature clicked:', feature);
  };
  
  const handlePathClick = (path) => {
    setSelectedPath(path);
    console.log('Path clicked:', path);
  };
  
  return (
    <div>
      <NarrativeLandscapeVisualization 
        data={sampleData} 
        width={1000} 
        height={600}
        onFeatureClick={handleFeatureClick}
        onPathClick={handlePathClick}
        showLabels={true}
        showPaths={true}
        showFeatures={true}
        perspective={0.5}
        lightAngle={315}
        exaggeration={1.5}
      />
      
      {selectedFeature && (
        <div className="feature-details">
          <h3>Feature: {selectedFeature.name}</h3>
          <p>Type: {selectedFeature.type}</p>
          <p>{selectedFeature.description}</p>
          <p>Prominence: {selectedFeature.metrics.prominence}</p>
          <p>Significance: {selectedFeature.metrics.significance}</p>
        </div>
      )}
      
      {selectedPath && (
        <div className="path-details">
          <h3>Path: {selectedPath.name}</h3>
          <p>{selectedPath.description}</p>
          <p>Points: {selectedPath.points.length}</p>
          <p>Gradient: {selectedPath.metrics.gradient}</p>
          <p>Significance: {selectedPath.metrics.significance}</p>
        </div>
      )}
    </div>
  );
};
```

## Interpretation

In the Narrative Landscape visualization:

- **Elevation** represents the strength or dominance of narratives
- **Color** indicates which narrative is dominant at each point
- **Features** represent significant aspects of the narrative landscape:
  - **Peaks** are points of high narrative strength
  - **Valleys** are areas of low narrative strength
  - **Ridges** are linear features connecting peaks
  - **Basins** are enclosed areas of low narrative strength
- **Paths** represent the evolution of narratives over time or conceptual space
- **Gradient** (steepness) indicates how rapidly narrative strength changes

## Performance Considerations

For optimal performance:
- Use an appropriate resolution for the grid (typically 50-100 points per dimension)
- Limit the number of features to under 50
- Limit the number of paths to under 20
- Use the width and height props to control the size of the visualization
- Consider reducing the perspective and exaggeration for very complex landscapes

## See It in Action

Check out the [visualization-showcase](../../apps/visualization-showcase) application to see the Narrative Landscape visualization in action with interactive examples. 