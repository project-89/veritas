# Visualization Demo Component

The Visualization Demo component provides a unified interface for exploring all visualization types in the Veritas system. This component is particularly useful for comparing different visualization approaches and understanding their strengths and use cases.

## Features

- Single interface for all visualization types
- Easy switching between visualizations
- Consistent sizing and styling
- Interactive controls for each visualization
- Responsive design for different screen sizes

## Visualization Types

The demo component includes the following visualization types:

1. **Network Graph**: A force-directed graph visualization for displaying network relationships between entities
2. **Reality Tunnel**: A visualization for representing how narratives and perspectives evolve over time
3. **Temporal Narrative**: A time-series visualization showing how multiple narratives evolve in strength
4. **Narrative Mycelium**: An organic visualization representing narratives as interconnected mycelium-like structures
5. **Narrative Landscape**: A topographical landscape visualization where elevation indicates narrative strength
6. **Enhanced Reality Tunnel**: An advanced version of the Reality Tunnel with additional features

## Props

The VisualizationDemo component does not require any props, as it generates sample data internally for each visualization type.

## Example Usage

```tsx
import { VisualizationDemo } from '@veritas-nx/visualization';

const DemoPage = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Visualization Demo</h1>
      <p className="mb-4">
        Explore different visualization types for narrative analysis and data exploration.
      </p>
      <div className="border rounded-lg overflow-hidden">
        <VisualizationDemo />
      </div>
    </div>
  );
};
```

## Implementation Details

The VisualizationDemo component:

1. Maintains state for the currently selected visualization type
2. Generates appropriate sample data for each visualization
3. Provides a consistent interface for switching between visualizations
4. Renders the selected visualization with appropriate dimensions
5. Handles responsive sizing for different screen sizes

## Customization

While the VisualizationDemo component does not accept props for customization, you can create your own version by:

1. Copying the component code from `libs/visualization/src/lib/components/VisualizationDemo.tsx`
2. Modifying it to include only the visualizations you need
3. Adding custom controls or data sources
4. Adjusting the styling to match your application

## Use Cases

The VisualizationDemo component is particularly useful for:

1. **Exploration**: Quickly exploring different visualization approaches for your data
2. **Demonstration**: Showcasing the capabilities of the visualization library
3. **Education**: Teaching users about different visualization techniques
4. **Development**: Testing and comparing visualizations during development
5. **Presentations**: Using in presentations to demonstrate narrative analysis capabilities

## See It in Action

Check out the [visualization-showcase](../../apps/visualization-showcase) application to see the VisualizationDemo component in action. Navigate to the "All Visualizations" section to explore the demo. 