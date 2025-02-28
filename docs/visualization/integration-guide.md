# Visualization Components Integration Guide

This guide provides detailed instructions for integrating the Veritas visualization components into your applications.

## Installation

First, ensure you have the visualization library installed in your project:

```bash
# If using npm
npm install @veritas-nx/visualization

# If using yarn
yarn add @veritas-nx/visualization
```

If you're working within the Veritas monorepo, the library is already available as a local dependency.

## Basic Integration

### 1. Import the Components

```tsx
import { 
  NetworkGraphVisualization,
  RealityTunnelVisualization,
  TemporalNarrativeVisualization
} from '@veritas-nx/visualization';
```

### 2. Prepare Your Data

Each visualization component requires data in a specific format. You can either:

- Transform your existing data to match the required format
- Use the provided utility functions to generate sample data for testing

```tsx
import { 
  generateSampleNetworkData,
  generateSampleRealityTunnelData,
  generateSampleTemporalNarrativeData
} from '@veritas-nx/visualization';

// For testing or demonstration purposes
const networkData = generateSampleNetworkData();
const realityTunnelData = generateSampleRealityTunnelData();
const temporalNarrativeData = generateSampleTemporalNarrativeData();
```

### 3. Render the Components

```tsx
function VisualizationDashboard() {
  return (
    <div className="dashboard">
      <div className="visualization-container">
        <h2>Network Analysis</h2>
        <NetworkGraphVisualization 
          data={networkData} 
          width={800} 
          height={600} 
          onNodeClick={(node) => console.log('Node clicked:', node)}
        />
      </div>
      
      <div className="visualization-container">
        <h2>Reality Tunnel Analysis</h2>
        <RealityTunnelVisualization 
          data={realityTunnelData} 
          width={800} 
          height={600}
          onNarrativeSelect={(narrative) => console.log('Narrative selected:', narrative)}
        />
      </div>
      
      <div className="visualization-container">
        <h2>Temporal Narrative Analysis</h2>
        <TemporalNarrativeVisualization 
          data={temporalNarrativeData} 
          width={800} 
          height={400}
          onPointClick={(point, narrativeId) => console.log('Point clicked:', point, 'in narrative:', narrativeId)}
        />
      </div>
    </div>
  );
}
```

## Advanced Integration

### Responsive Sizing

To make the visualizations responsive, you can use a container ref and state to dynamically set the width and height:

```tsx
import { useState, useEffect, useRef } from 'react';
import { NetworkGraphVisualization } from '@veritas-nx/visualization';

function ResponsiveNetworkGraph({ data }) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateDimensions = () => {
      const { width, height } = containerRef.current.getBoundingClientRect();
      setDimensions({ width, height });
    };
    
    // Initial size
    updateDimensions();
    
    // Update on resize
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);
    
    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
    };
  }, []);
  
  return (
    <div ref={containerRef} style={{ width: '100%', height: '500px' }}>
      <NetworkGraphVisualization 
        data={data} 
        width={dimensions.width} 
        height={dimensions.height} 
      />
    </div>
  );
}
```

### Data Transformation

If your data doesn't match the required format, you can use transformation functions:

```tsx
import { transformToNetworkGraph } from '@veritas-nx/visualization';

// Example: Transform API data to the required format
async function fetchAndTransformNetworkData() {
  const response = await fetch('/api/network-data');
  const apiData = await response.json();
  
  // Transform the API data to the required format
  const networkData = transformToNetworkGraph(apiData);
  
  return networkData;
}
```

### Handling Events

All visualization components provide event callbacks for interactive features:

```tsx
function InteractiveNetworkGraph() {
  const [selectedNode, setSelectedNode] = useState(null);
  
  const handleNodeClick = (node) => {
    setSelectedNode(node);
    // Fetch additional data about this node
    fetchNodeDetails(node.id);
  };
  
  return (
    <div className="interactive-graph">
      <NetworkGraphVisualization 
        data={networkData} 
        width={800} 
        height={600} 
        onNodeClick={handleNodeClick}
      />
      
      {selectedNode && (
        <div className="node-details-panel">
          <h3>{selectedNode.label}</h3>
          <p>Type: {selectedNode.type}</p>
          {/* Display more node details */}
        </div>
      )}
    </div>
  );
}
```

### Custom Styling

You can customize the appearance of the visualizations by:

1. Providing styled data (colors, sizes, etc. in the data structure)
2. Wrapping the components with custom CSS

```tsx
// Custom styling through data
const customStyledData = {
  nodes: networkData.nodes.map(node => ({
    ...node,
    metrics: {
      ...node.metrics,
      color: node.type === 'source' ? '#ff0000' : '#0000ff',
      size: node.metrics.weight * 5
    }
  })),
  edges: networkData.edges,
  metadata: networkData.metadata
};

// Custom styling through CSS
<div className="custom-network-graph">
  <NetworkGraphVisualization data={customStyledData} width={800} height={600} />
</div>

// CSS
.custom-network-graph {
  background-color: #f5f5f5;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}
```

## Integration with Data Services

### Fetching Data from the Veritas API

```tsx
import { useState, useEffect } from 'react';
import { NetworkGraphVisualization } from '@veritas-nx/visualization';

function ApiDrivenNetworkGraph() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch('/api/network-analysis?timeframe=7d');
        const apiData = await response.json();
        setData(apiData);
        setLoading(false);
      } catch (err) {
        setError(err);
        setLoading(false);
      }
    }
    
    fetchData();
  }, []);
  
  if (loading) return <div>Loading visualization...</div>;
  if (error) return <div>Error loading visualization: {error.message}</div>;
  if (!data) return <div>No data available</div>;
  
  return (
    <NetworkGraphVisualization 
      data={data} 
      width={800} 
      height={600} 
    />
  );
}
```

### Real-time Updates

For real-time updates, you can use WebSockets or polling:

```tsx
import { useState, useEffect } from 'react';
import { TemporalNarrativeVisualization } from '@veritas-nx/visualization';

function RealTimeNarrativeVisualization() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    // Initial data fetch
    fetchData();
    
    // Set up polling for updates
    const intervalId = setInterval(fetchData, 30000); // Update every 30 seconds
    
    return () => clearInterval(intervalId);
    
    async function fetchData() {
      try {
        const response = await fetch('/api/narrative-analysis/real-time');
        const newData = await response.json();
        setData(newData);
      } catch (err) {
        console.error('Error fetching real-time data:', err);
      }
    }
  }, []);
  
  if (!data) return <div>Loading real-time visualization...</div>;
  
  return (
    <TemporalNarrativeVisualization 
      data={data} 
      width={800} 
      height={400} 
      // Additional props as needed
    />
  );
}
```

## Performance Optimization

For large datasets, consider these optimization techniques:

1. **Data Sampling**: Reduce the number of points for very large datasets
2. **Pagination**: Show only a subset of the data at a time
3. **Level of Detail**: Adjust detail based on zoom level
4. **Memoization**: Use React.memo and useMemo to prevent unnecessary re-renders

```tsx
import { useMemo } from 'react';
import { NetworkGraphVisualization } from '@veritas-nx/visualization';

function OptimizedNetworkGraph({ rawData }) {
  // Process data only when rawData changes
  const processedData = useMemo(() => {
    // For very large datasets, sample the data
    if (rawData.nodes.length > 1000) {
      return {
        nodes: sampleNodes(rawData.nodes, 500),
        edges: sampleEdges(rawData.edges, rawData.nodes, 1000),
        metadata: rawData.metadata
      };
    }
    return rawData;
  }, [rawData]);
  
  return (
    <NetworkGraphVisualization 
      data={processedData} 
      width={800} 
      height={600} 
    />
  );
}
```

## Troubleshooting

### Common Issues

1. **Visualization not rendering**: Check that the data structure matches the expected format
2. **Performance issues**: Reduce the dataset size or apply optimization techniques
3. **Styling conflicts**: Ensure your application's CSS doesn't override the visualization styles

### Debugging

Enable debug mode to see additional information in the console:

```tsx
<NetworkGraphVisualization 
  data={data} 
  width={800} 
  height={600} 
  debug={true} 
/>
```

## Further Resources

- [Network Graph Documentation](./network-graph.md)
- [Reality Tunnel Documentation](./reality-tunnel.md)
- [Temporal Narrative Documentation](./temporal-narrative.md)
- [Visualization Showcase Application](../../apps/visualization-showcase)
- [API Documentation](../api/README.md) 