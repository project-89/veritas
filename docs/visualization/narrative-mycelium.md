# Narrative Mycelium Visualization

The Narrative Mycelium visualization represents narratives as organic, interconnected structures similar to mycelium networks. This visualization is particularly effective at showing how narratives branch, connect, and form clusters over time.

## Features

- Organic, force-directed graph visualization
- Narrative clusters with distinct colors
- Node types (root, branch, leaf) to represent narrative evolution
- Interactive selection and exploration
- Animated growth and movement
- Strength indicators for nodes and connections

## Data Structure

The Narrative Mycelium component requires data in the following structure:

```typescript
interface MyceliumNode {
  id: string;
  narrativeId: string;
  content: string;
  timestamp: Date;
  strength: number; // 0-1, how strong this narrative point is
  position?: {
    x: number;
    y: number;
    z: number;
  };
  connections: string[]; // IDs of connected nodes
  type: 'root' | 'branch' | 'leaf';
  metrics: {
    influence: number; // How much this node influences others
    growth: number; // Growth rate of this narrative point
    color: string; // Visual color for the node
  };
}

interface MyceliumBranch {
  id: string;
  sourceId: string; // ID of the source node
  targetId: string; // ID of the target node
  strength: number; // 0-1, strength of the connection
  type: 'primary' | 'secondary' | 'tertiary';
  metrics: {
    width: number; // Visual width of the branch
    color: string; // Visual color for the branch
    age: number; // How old/established this connection is
  };
}

interface NarrativeCluster {
  id: string;
  name: string;
  description: string;
  color: string;
  nodes: string[]; // IDs of nodes in this cluster
  centralNodeId: string; // ID of the central/most important node
  metrics: {
    cohesion: number; // How tightly connected the cluster is
    influence: number; // Overall influence of this cluster
    growth: number; // Growth rate of this cluster
  };
}

interface MyceliumData {
  nodes: MyceliumNode[];
  branches: MyceliumBranch[];
  clusters: NarrativeCluster[];
  metadata: {
    timestamp: Date;
    totalStrength: number;
    dominantClusterId: string;
    timeframe: {
      start: Date;
      end: Date;
    };
  };
}
```

## Props

| Prop | Type | Description | Default |
|------|------|-------------|---------|
| data | MyceliumData | The mycelium data to visualize | (required) |
| width | number | Width of the visualization in pixels | 800 |
| height | number | Height of the visualization in pixels | 600 |
| depth | number | Depth of the visualization for 3D effects | 200 |
| onNodeClick | (node: MyceliumNode) => void | Callback when a node is clicked | undefined |
| onClusterClick | (cluster: NarrativeCluster) => void | Callback when a cluster is clicked | undefined |
| showLabels | boolean | Whether to show labels for nodes and clusters | true |
| animate | boolean | Whether to animate the visualization | true |
| perspective | number | Perspective depth for 3D effects (0-1) | 0.5 |
| colorScheme | string[] | Custom color scheme for clusters | undefined |

## Example Usage

```tsx
import { NarrativeMyceliumVisualization, generateMyceliumData } from '@veritas-nx/visualization';
import { useState } from 'react';

// Sample data or data from API
const sampleData = generateMyceliumData();

const MyceliumExample = () => {
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);
  
  const handleNodeClick = (node) => {
    setSelectedNode(node);
    console.log('Node clicked:', node);
  };
  
  const handleClusterClick = (cluster) => {
    setSelectedCluster(cluster);
    console.log('Cluster clicked:', cluster);
  };
  
  return (
    <div>
      <NarrativeMyceliumVisualization 
        data={sampleData} 
        width={1000} 
        height={600}
        depth={200}
        onNodeClick={handleNodeClick}
        onClusterClick={handleClusterClick}
        showLabels={true}
        animate={true}
        perspective={0.5}
      />
      
      {selectedNode && (
        <div className="node-details">
          <h3>Node: {selectedNode.content}</h3>
          <p>Strength: {selectedNode.strength}</p>
          <p>Type: {selectedNode.type}</p>
          <p>Influence: {selectedNode.metrics.influence}</p>
        </div>
      )}
      
      {selectedCluster && (
        <div className="cluster-details">
          <h3>Cluster: {selectedCluster.name}</h3>
          <p>{selectedCluster.description}</p>
          <p>Nodes: {selectedCluster.nodes.length}</p>
          <p>Cohesion: {selectedCluster.metrics.cohesion}</p>
          <p>Influence: {selectedCluster.metrics.influence}</p>
        </div>
      )}
    </div>
  );
};
```

## Interpretation

In the Narrative Mycelium visualization:

- **Nodes** represent individual narrative points or content pieces
- **Branches** represent connections between narrative points
- **Clusters** represent related narratives that form a cohesive group
- **Node types** indicate the role in the narrative structure:
  - **Root nodes** are origin points for narratives
  - **Branch nodes** are intermediate points where narratives develop
  - **Leaf nodes** are endpoints or current states of narratives
- **Node size** typically represents strength or influence
- **Branch thickness** represents the strength of the connection

## Performance Considerations

For optimal performance:
- Limit the number of nodes to under 300
- Limit the number of branches to under 500
- Use the width, height, and depth props to control the size of the visualization
- Consider disabling animation for very large datasets

## See It in Action

Check out the [visualization-showcase](../../apps/visualization-showcase) application to see the Narrative Mycelium visualization in action with interactive examples. 