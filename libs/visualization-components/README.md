# Visualization Components Library

This library contains a collection of visualization components for data analysis and narrative exploration. It consolidates visualization-specific components, types, and utilities that were previously spread across multiple packages.

## Components

### NetworkGraphVisualization

A force-directed graph visualization for displaying network relationships between entities. Useful for showing connections, clusters, and influence patterns.

**Features:**
- Interactive node and edge display
- Zoom and pan capabilities
- Node selection and highlighting
- Customizable node and edge styling

### RealityTunnelVisualization

A visualization that represents how narratives and perspectives evolve and diverge over time, creating "reality tunnels" that shape perception.

**Features:**
- Tunnel-like visualization of narrative evolution
- Interactive selection of tunnels
- Timeline-based exploration
- Event markers at significant points

### TemporalNarrativeVisualization

A time-series visualization showing how multiple narratives evolve in strength and relationship over time.

**Features:**
- Stream-based visualization of narrative strength
- Event markers for significant moments
- Interactive selection of narrative streams
- External event indicators

## Types

The library includes TypeScript interfaces for:

- Network data structures (nodes, edges, graphs)
- Narrative data structures
- Temporal data structures
- Visualization configuration options

## Utilities

Helper functions for:

- Color manipulation and generation
- Data transformation and normalization
- Network metrics calculation
- Sample data generation for testing and demos

## Usage

```tsx
import { 
  NetworkGraphVisualization,
  RealityTunnelVisualization, 
  TemporalNarrativeVisualization,
  generateNetworkData,
  generateRealityTunnelData,
  generateTemporalData
} from '@veritas/visualization-components';

// Network Graph Example
const MyNetworkGraph = () => {
  const data = generateNetworkData();
  return <NetworkGraphVisualization data={data} width={800} height={600} />;
};

// Reality Tunnel Example
const MyRealityTunnel = () => {
  const data = generateRealityTunnelData();
  return <RealityTunnelVisualization data={data} width={800} height={600} />;
};

// Temporal Narrative Example
const MyTemporalNarrative = () => {
  const data = generateTemporalData();
  return <TemporalNarrativeVisualization data={data} width={800} height={600} />;
};
```

## Development

### Adding New Components

1. Create a new component file in `src/lib/components/`
2. Add necessary types to `src/lib/types/`
3. Add utility functions to `src/lib/utils/` if needed
4. Export the component in the appropriate index files
5. Add tests in a `.spec.tsx` file

### Testing

Run tests with:

```bash
nx test visualization-components
```

### Building

Build the library with:

```bash
nx build visualization-components
```

## Dependencies

- React
- D3.js
- TypeScript

## Notes

This library is part of the Veritas project's visualization system. It's designed to work with the data structures and APIs provided by the Veritas data access libraries.
