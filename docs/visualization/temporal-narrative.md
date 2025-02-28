# Temporal Narrative Visualization

The Temporal Narrative visualization represents how multiple narratives evolve in strength and prevalence over time. It allows users to track the rise and fall of different narratives, identify key moments of narrative shift, and understand the temporal relationships between competing perspectives.

## Features

- Timeline-based visualization of narrative strength
- Multi-narrative comparison
- Interactive time selection
- Highlighting of key narrative events
- Smooth transitions and animations
- Customizable color schemes

## Data Structure

The Temporal Narrative component requires data in the following structure:

```typescript
interface NarrativePoint {
  timestamp: Date;
  strength: number;
  content?: {
    id: string;
    title: string;
    summary: string;
    sourceId: string;
  };
  isKeyEvent?: boolean;
}

interface NarrativeTimeline {
  id: string;
  name: string;
  description: string;
  color: string;
  points: NarrativePoint[];
}

interface TemporalNarrativeData {
  narratives: NarrativeTimeline[];
  timeframe: {
    start: Date;
    end: Date;
  };
  metadata: {
    totalPoints: number;
    maxStrength: number;
    dominantNarrativeId?: string;
  };
}
```

## Props

| Prop | Type | Description | Default |
|------|------|-------------|---------|
| data | TemporalNarrativeData | The temporal narrative data to visualize | (required) |
| width | number | Width of the visualization in pixels | 800 |
| height | number | Height of the visualization in pixels | 400 |
| onPointClick | (point: NarrativePoint, narrativeId: string) => void | Callback when a point is clicked | undefined |
| onTimeframeSelect | (start: Date, end: Date) => void | Callback when a timeframe is selected | undefined |
| showLegend | boolean | Whether to show the narrative legend | true |
| highlightKeyEvents | boolean | Whether to highlight key events | true |
| smoothCurves | boolean | Whether to use smooth curves for the lines | true |

## Example Usage

```tsx
import { TemporalNarrativeVisualization } from '@veritas-nx/visualization';
import { useState } from 'react';

// Sample data or data from API
const sampleData = {
  narratives: [
    {
      id: 'narrative-1',
      name: 'Economic Impact',
      description: 'Focus on economic consequences',
      color: '#4285F4',
      points: [
        {
          timestamp: new Date('2023-01-01'),
          strength: 0.3,
          content: {
            id: 'content-1',
            title: 'Initial Economic Report',
            summary: 'First assessment of economic impact',
            sourceId: 'source-1'
          },
          isKeyEvent: true
        },
        {
          timestamp: new Date('2023-01-15'),
          strength: 0.5,
          content: {
            id: 'content-2',
            title: 'Market Response',
            summary: 'How markets responded to the event',
            sourceId: 'source-2'
          }
        },
        // More points...
      ]
    },
    {
      id: 'narrative-2',
      name: 'Social Impact',
      description: 'Focus on social consequences',
      color: '#EA4335',
      points: [
        // Points for this narrative...
      ]
    },
    // More narratives...
  ],
  timeframe: {
    start: new Date('2023-01-01'),
    end: new Date('2023-03-01')
  },
  metadata: {
    totalPoints: 75,
    maxStrength: 0.9,
    dominantNarrativeId: 'narrative-2'
  }
};

const TemporalNarrativeExample = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);
  
  const handleTimeframeSelect = (start, end) => {
    setSelectedTimeframe({ start, end });
    console.log('Timeframe selected:', { start, end });
  };
  
  const handlePointClick = (point, narrativeId) => {
    setSelectedPoint({ point, narrativeId });
    console.log('Point clicked:', point, 'in narrative:', narrativeId);
  };
  
  return (
    <div>
      <TemporalNarrativeVisualization 
        data={sampleData} 
        width={1000} 
        height={400} 
        onTimeframeSelect={handleTimeframeSelect}
        onPointClick={handlePointClick}
        highlightKeyEvents={true}
      />
      
      {selectedPoint && (
        <div className="point-details">
          <h3>{selectedPoint.point.content?.title}</h3>
          <p>{selectedPoint.point.content?.summary}</p>
          <p>Strength: {selectedPoint.point.strength}</p>
          <p>Narrative: {sampleData.narratives.find(n => n.id === selectedPoint.narrativeId)?.name}</p>
        </div>
      )}
      
      {selectedTimeframe && (
        <div className="timeframe-details">
          <p>Selected period: {selectedTimeframe.start.toLocaleDateString()} to {selectedTimeframe.end.toLocaleDateString()}</p>
        </div>
      )}
    </div>
  );
};
```

## Customization

The Temporal Narrative visualization can be customized through the data structure and props:

- Narrative colors are controlled by `narrative.color`
- The smoothness of the curves can be adjusted with the `smoothCurves` prop
- Key events can be highlighted by setting `point.isKeyEvent` to true
- The timeline range is determined by `data.timeframe`

## Interpretation

In the Temporal Narrative visualization:

- The y-axis represents the strength or prevalence of a narrative
- The x-axis represents time
- Each line represents a different narrative
- The area under each line can represent the total influence of that narrative over time
- Intersections between lines represent moments when narratives had equal strength
- Key events (if highlighted) show important moments in the evolution of narratives

## Performance Considerations

For optimal performance:
- Limit the number of narratives to under 10
- Limit the total number of points to under 1000
- Consider using a smaller subset of points for very long timeframes
- Use the width and height props to control the size of the visualization

## See It in Action

Check out the [visualization-showcase](../../apps/visualization-showcase) application to see the Temporal Narrative visualization in action with interactive examples. 