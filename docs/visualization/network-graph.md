# Network Graph Visualization

The Network Graph visualization is a force-directed graph that displays relationships between different entities in the Veritas system. It's useful for showing connections, clusters, and influence patterns.

## Features

- Interactive node and edge display
- Zoom and pan capabilities
- Node selection and highlighting
- Customizable node and edge styling
- Force-directed layout with physics simulation

## Data Structure

The Network Graph component requires data in the following structure:

```typescript
interface NetworkNode {
  id: string;
  type: "content" | "source" | "account";
  label: string;
  properties: Record<string, unknown>;
  metrics: {
    size: number;
    color: string;
    weight: number;
  };
}

interface NetworkEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
  metrics: {
    width: number;
    color: string;
    weight: number;
  };
}

interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  metadata: {
    timestamp: Date;
    nodeCount: number;
    edgeCount: number;
    density: number;
  };
}
```

## Props

| Prop | Type | Description | Default |
|------|------|-------------|---------|
| data | NetworkGraph | The graph data to visualize | (required) |
| width | number | Width of the visualization in pixels | 800 |
| height | number | Height of the visualization in pixels | 600 |
| onNodeClick | (node: NetworkNode) => void | Callback when a node is clicked | undefined |
| onEdgeClick | (edge: NetworkEdge) => void | Callback when an edge is clicked | undefined |

## Example Usage

```tsx
import { NetworkGraphVisualization } from '@veritas-nx/visualization';
import { useState } from 'react';

// Sample data or data from API
const sampleData = {
  nodes: [
    {
      id: 'node-1',
      type: 'content',
      label: 'Content 1',
      properties: { /* ... */ },
      metrics: { size: 1, color: '#4285F4', weight: 0.8 }
    },
    // More nodes...
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      type: 'references',
      properties: { /* ... */ },
      metrics: { width: 2, color: '#EA4335', weight: 0.5 }
    },
    // More edges...
  ],
  metadata: {
    timestamp: new Date(),
    nodeCount: 10,
    edgeCount: 15,
    density: 0.3
  }
};

const NetworkGraphExample = () => {
  const [selectedNode, setSelectedNode] = useState(null);
  
  const handleNodeClick = (node) => {
    setSelectedNode(node);
    console.log('Node clicked:', node);
  };
  
  return (
    <div>
      <NetworkGraphVisualization 
        data={sampleData} 
        width={1000} 
        height={600} 
        onNodeClick={handleNodeClick}
      />
      
      {selectedNode && (
        <div className="node-details">
          <h3>{selectedNode.label}</h3>
          <p>Type: {selectedNode.type}</p>
          {/* Display more node details */}
        </div>
      )}
    </div>
  );
};
```

## Customization

The Network Graph visualization can be customized through the data structure. Specifically:

- Node size is controlled by `node.metrics.size`
- Node color is controlled by `node.metrics.color`
- Edge width is controlled by `edge.metrics.width`
- Edge color is controlled by `edge.metrics.color`

## Performance Considerations

For optimal performance:
- Limit the number of nodes to under 500
- Limit the number of edges to under 1000
- Use the width and height props to control the size of the visualization

## See It in Action

Check out the [visualization-showcase](../../apps/visualization-showcase) application to see the Network Graph visualization in action with interactive examples. 