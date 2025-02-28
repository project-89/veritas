# Reality Tunnel Visualization

The Reality Tunnel visualization represents how narratives and perspectives evolve over time, showing how different viewpoints can diverge from a common starting point and create separate "tunnels" of reality perception.

## Features

- 3D tunnel visualization with perspective
- Timeline-based evolution of narratives
- Interactive selection of narrative paths
- Color-coded narrative strength indicators
- Smooth animations for transitions

## Data Structure

The Reality Tunnel component requires data in the following structure:

```typescript
interface RealityPoint {
  id: string;
  narrativeId: string;
  timestamp: Date;
  position: {
    x: number;
    y: number;
    z: number;
  };
  metrics: {
    strength: number;
    deviation: number;
    color: string;
  };
  content: {
    title: string;
    summary: string;
    sourceId: string;
  };
}

interface Narrative {
  id: string;
  name: string;
  description: string;
  color: string;
  points: RealityPoint[];
}

interface RealityTunnelData {
  narratives: Narrative[];
  timeframe: {
    start: Date;
    end: Date;
  };
  metadata: {
    totalPoints: number;
    maxDeviation: number;
    baselineNarrativeId?: string;
  };
}
```

## Props

| Prop | Type | Description | Default |
|------|------|-------------|---------|
| data | RealityTunnelData | The reality tunnel data to visualize | (required) |
| width | number | Width of the visualization in pixels | 800 |
| height | number | Height of the visualization in pixels | 600 |
| onPointClick | (point: RealityPoint) => void | Callback when a point is clicked | undefined |
| onNarrativeSelect | (narrative: Narrative) => void | Callback when a narrative is selected | undefined |
| showLegend | boolean | Whether to show the narrative legend | true |
| perspective | number | Perspective depth of the 3D visualization | 0.5 |

## Example Usage

```tsx
import { RealityTunnelVisualization } from '@veritas-nx/visualization';
import { useState } from 'react';

// Sample data or data from API
const sampleData = {
  narratives: [
    {
      id: 'narrative-1',
      name: 'Mainstream Perspective',
      description: 'The commonly accepted view',
      color: '#4285F4',
      points: [
        {
          id: 'point-1',
          narrativeId: 'narrative-1',
          timestamp: new Date('2023-01-01'),
          position: { x: 0, y: 0, z: 0 },
          metrics: { strength: 0.8, deviation: 0, color: '#4285F4' },
          content: {
            title: 'Initial Event',
            summary: 'The event as initially reported',
            sourceId: 'source-1'
          }
        },
        // More points...
      ]
    },
    // More narratives...
  ],
  timeframe: {
    start: new Date('2023-01-01'),
    end: new Date('2023-03-01')
  },
  metadata: {
    totalPoints: 50,
    maxDeviation: 0.8,
    baselineNarrativeId: 'narrative-1'
  }
};

const RealityTunnelExample = () => {
  const [selectedNarrative, setSelectedNarrative] = useState(null);
  
  const handleNarrativeSelect = (narrative) => {
    setSelectedNarrative(narrative);
    console.log('Narrative selected:', narrative);
  };
  
  return (
    <div>
      <RealityTunnelVisualization 
        data={sampleData} 
        width={1000} 
        height={600} 
        onNarrativeSelect={handleNarrativeSelect}
        perspective={0.7}
      />
      
      {selectedNarrative && (
        <div className="narrative-details">
          <h3>{selectedNarrative.name}</h3>
          <p>{selectedNarrative.description}</p>
          <p>Points: {selectedNarrative.points.length}</p>
        </div>
      )}
    </div>
  );
};
```

## Customization

The Reality Tunnel visualization can be customized through the data structure and props:

- Narrative colors are controlled by `narrative.color`
- Point colors can be overridden with `point.metrics.color`
- The perspective depth can be adjusted with the `perspective` prop
- The timeline range is determined by `data.timeframe`

## Interpretation

In the Reality Tunnel visualization:

- The central axis represents the baseline or "objective" reality
- Deviation from the center represents divergence from the baseline narrative
- The strength of a point (usually represented by size or opacity) indicates the prominence of that narrative at that point in time
- Connected points within the same narrative show the evolution of that perspective over time

## Performance Considerations

For optimal performance:
- Limit the number of narratives to under 10
- Limit the total number of points to under 500
- Use the width and height props to control the size of the visualization

## See It in Action

Check out the [visualization-showcase](../../apps/visualization-showcase) application to see the Reality Tunnel visualization in action with interactive examples. 