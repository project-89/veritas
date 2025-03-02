# Visualization Components Library

This library contains a set of visualization components for the Veritas project.

## Components

- **NetworkGraphVisualization**: A force-directed graph visualization for displaying network relationships. [Documentation](../../docs/visualization/network-graph.md)
- **RealityTunnelVisualization**: A visualization for representing how narratives and perspectives evolve over time. [Documentation](../../docs/visualization/reality-tunnel.md)
- **TemporalNarrativeVisualization**: A visualization for representing how multiple narratives evolve in strength. [Documentation](../../docs/visualization/temporal-narrative.md)
- **NarrativeMyceliumVisualization**: An organic visualization that represents narratives as interconnected mycelium-like structures. [Documentation](../../docs/visualization/narrative-mycelium.md)
- **NarrativeLandscapeVisualization**: A topographical landscape visualization where elevation indicates narrative strength. [Documentation](../../docs/visualization/narrative-landscape.md)
- **EnhancedRealityTunnelVisualization**: An advanced version of the Reality Tunnel visualization with additional features. [Documentation](../../docs/visualization/enhanced-reality-tunnel.md)
- **VisualizationDemo**: A component that showcases all visualization types in one place. [Documentation](../../docs/visualization/visualization-demo.md)

## Types

- **NetworkGraph**: TypeScript interface for network graph data
- **RealityTunnelData**: TypeScript interface for reality tunnel data
- **TemporalNarrativeData**: TypeScript interface for temporal narrative data
- **MyceliumData**: TypeScript interface for narrative mycelium data
- **LandscapeData**: TypeScript interface for narrative landscape data
- **EnhancedTunnelData**: TypeScript interface for enhanced reality tunnel data

## Utilities

- **colorUtils**: Helper functions for color manipulation
- **dataTransformers**: Functions for transforming data into visualization-ready formats
- **networkMetrics**: Functions for calculating network metrics
- **sampleDataGenerators**: Functions for generating sample data for each visualization

## Usage

```tsx
import { 
  NetworkGraphVisualization, 
  RealityTunnelVisualization, 
  TemporalNarrativeVisualization,
  NarrativeMyceliumVisualization,
  NarrativeLandscapeVisualization,
  EnhancedRealityTunnelVisualization,
  VisualizationDemo,
  generateSampleNetworkData,
  generateRealityTunnelData,
  generateTemporalData,
  generateMyceliumData,
  generateLandscapeData,
  generateEnhancedTunnelData
} from '@veritas-nx/visualization';

// Using with sample data
const networkData = generateSampleNetworkData();
const realityTunnelData = generateRealityTunnelData();
const temporalNarrativeData = generateTemporalData();
const myceliumData = generateMyceliumData();
const landscapeData = generateLandscapeData();
const enhancedTunnelData = generateEnhancedTunnelData();

// In your component
return (
  <div>
    <NetworkGraphVisualization data={networkData} width={800} height={600} />
    <RealityTunnelVisualization data={realityTunnelData} width={800} height={600} />
    <TemporalNarrativeVisualization data={temporalNarrativeData} width={800} height={400} />
    <NarrativeMyceliumVisualization data={myceliumData} width={800} height={600} />
    <NarrativeLandscapeVisualization data={landscapeData} width={800} height={600} />
    <EnhancedRealityTunnelVisualization data={enhancedTunnelData} width={800} height={600} />
    
    {/* Or use the all-in-one demo component */}
    <VisualizationDemo />
  </div>
);
```

## Showcase Application

To see all visualization components in action, you can run the **visualization-showcase** application:

```bash
npm run serve:visualization-showcase
```

This showcase demonstrates all components with interactive examples and sample data.

## Development

### Adding a new component

1. Create a new component in `libs/visualization/src/lib/components`
2. Export the component in `libs/visualization/src/index.ts`
3. Add tests in `libs/visualization/src/lib/components/__tests__`
4. Add documentation in `docs/visualization/`
5. Add the component to the showcase application

### Testing

```bash
npm run test:visualization
```

### Building

```bash
npm run build:visualization
```

## Dependencies

- React
- D3.js
- TypeScript

## Notes

This library is part of the Veritas project's visualization system, designed to help users understand complex information networks, narrative evolution, and temporal patterns in content.
