# Enhanced Reality Tunnel Visualization

The Enhanced Reality Tunnel visualization extends the basic Reality Tunnel concept with additional features for deeper narrative analysis and exploration. This advanced visualization provides more detailed insights into how narratives branch, diverge, and interact over time.

## Features

- 3D tunnel visualization with enhanced perspective
- Branching narrative paths with varying strengths
- Consensus reality highlighting
- Interactive node and branch selection
- Detailed metrics for narrative strength, relevance, and consensus
- Timeline navigation and filtering
- Animated transitions between states

## Data Structure

The Enhanced Reality Tunnel component requires data in the following structure:

```typescript
interface EnhancedTunnelNode {
  id: string;
  narrativeId: string;
  content: string;
  timestamp: Date;
  position: {
    x: number;
    y: number;
    z: number;
  };
  metrics: {
    strength: number;
    relevance: number;
    consensus: number;
  };
  connections: string[];
  branchFactor: number;
  isConsensus: boolean;
}

interface EnhancedTunnelBranch {
  id: string;
  sourceId: string;
  targetId: string;
  narrativeId: string;
  strength: number;
  metrics: {
    consensus: number;
    traffic: number;
  };
}

interface EnhancedTunnelNarrative {
  id: string;
  name: string;
  description: string;
  color: string;
  metrics: {
    strength: number;
    coherence: number;
  };
}

interface EnhancedTunnelData {
  nodes: EnhancedTunnelNode[];
  branches: EnhancedTunnelBranch[];
  narratives: EnhancedTunnelNarrative[];
  timeframe: {
    start: Date;
    end: Date;
  };
  metadata: {
    title: string;
    description: string;
    timestamp: Date;
  };
}
```

## Props

| Prop | Type | Description | Default |
|------|------|-------------|---------|
| data | EnhancedTunnelData | The enhanced tunnel data to visualize | (required) |
| width | number | Width of the visualization in pixels | 1000 |
| height | number | Height of the visualization in pixels | 600 |
| depth | number | Depth of the visualization for 3D effects | 200 |
| perspective | number | Perspective depth for 3D effects (0-1) | 0.7 |
| onNodeClick | (node: EnhancedTunnelNode) => void | Callback when a node is clicked | undefined |
| onBranchClick | (branch: EnhancedTunnelBranch) => void | Callback when a branch is clicked | undefined |
| showLabels | boolean | Whether to show labels for nodes and narratives | true |
| interactive | boolean | Whether the visualization is interactive | true |
| highlightConsensus | boolean | Whether to highlight consensus reality | true |
| colorScheme | string | Custom color scheme for narratives | undefined |

## Example Usage

```tsx
import { EnhancedRealityTunnelVisualization, generateEnhancedTunnelData } from '@veritas-nx/visualization';
import { useState } from 'react';

// Sample data or data from API
const sampleData = generateEnhancedTunnelData();

const EnhancedTunnelExample = () => {
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);
  
  const handleNodeClick = (node) => {
    setSelectedNode(node);
    console.log('Node clicked:', node);
  };
  
  const handleBranchClick = (branch) => {
    setSelectedBranch(branch);
    console.log('Branch clicked:', branch);
  };
  
  return (
    <div>
      <EnhancedRealityTunnelVisualization 
        data={sampleData} 
        width={1000} 
        height={600}
        depth={200}
        perspective={0.7}
        onNodeClick={handleNodeClick}
        onBranchClick={handleBranchClick}
        showLabels={true}
        interactive={true}
        highlightConsensus={true}
      />
      
      {selectedNode && (
        <div className="node-details">
          <h3>Node: {selectedNode.content}</h3>
          <p>Strength: {selectedNode.metrics.strength}</p>
          <p>Relevance: {selectedNode.metrics.relevance}</p>
          <p>Consensus: {selectedNode.metrics.consensus}</p>
          <p>Is Consensus: {selectedNode.isConsensus ? 'Yes' : 'No'}</p>
        </div>
      )}
      
      {selectedBranch && (
        <div className="branch-details">
          <h3>Branch: {selectedBranch.id}</h3>
          <p>Strength: {selectedBranch.strength}</p>
          <p>Consensus: {selectedBranch.metrics.consensus}</p>
          <p>Traffic: {selectedBranch.metrics.traffic}</p>
        </div>
      )}
    </div>
  );
};
```

## Interpretation

In the Enhanced Reality Tunnel visualization:

- **Nodes** represent individual narrative points or content pieces at specific points in time
- **Branches** represent connections between narrative points, showing how narratives evolve
- **Position** in the tunnel:
  - **Z-axis** (depth) represents time progression
  - **X and Y axes** represent deviation from consensus reality (center)
- **Node metrics**:
  - **Strength** indicates how powerful/influential a narrative point is
  - **Relevance** indicates how connected it is to other narratives
  - **Consensus** indicates how close it is to the consensus reality
- **Branch metrics**:
  - **Strength** indicates how strong the connection is
  - **Consensus** indicates how much this connection is part of consensus reality
  - **Traffic** indicates how much information flows through this connection

## Differences from Basic Reality Tunnel

The Enhanced Reality Tunnel visualization extends the basic Reality Tunnel with:

1. **More detailed metrics** for nodes and branches
2. **Branch-level interactions** for exploring connections
3. **Consensus reality highlighting** to clearly identify mainstream narratives
4. **Branch factor** to show how narratives split and diverge
5. **Improved 3D perspective** for better spatial understanding
6. **More interactive elements** for deeper exploration

## Performance Considerations

For optimal performance:
- Limit the number of nodes to under 200
- Limit the number of branches to under 400
- Use the width, height, and depth props to control the size of the visualization
- Consider reducing the perspective for very complex tunnel structures

## See It in Action

Check out the [visualization-showcase](../../apps/visualization-showcase) application to see the Enhanced Reality Tunnel visualization in action with interactive examples. 