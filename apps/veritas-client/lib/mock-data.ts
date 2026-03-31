import {
  NetworkGraph,
  NetworkNode,
  NetworkEdge,
} from '@veritas-nx/visualization';

// Generate mock data for NetworkGraph
export const generateNetworkData = (): NetworkGraph => {
  const nodeCount = 30;
  const edgeCount = 50;

  const nodes: NetworkNode[] = [];
  const edges: NetworkEdge[] = [];

  // Generate nodes
  for (let i = 0; i < nodeCount; i++) {
    const nodeType =
      i % 3 === 0 ? 'content' : i % 3 === 1 ? 'source' : 'account';
    const size = Math.random() * 0.5 + 0.5; // Random size between 0.5 and 1

    nodes.push({
      id: `node-${i}`,
      type: nodeType as 'content' | 'source' | 'account',
      label: `${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} ${i}`,
      properties: {
        createdAt: new Date(
          Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
        ),
        ...(nodeType === 'content'
          ? {
              likes: Math.floor(Math.random() * 1000),
              shares: Math.floor(Math.random() * 500),
              comments: Math.floor(Math.random() * 200),
            }
          : nodeType === 'source'
          ? { credibilityScore: Math.random(), reliability: Math.random() }
          : {
              followers: Math.floor(Math.random() * 10000),
              connections: Math.floor(Math.random() * 500),
            }),
      },
      metrics: {
        size,
        color:
          nodeType === 'content'
            ? '#4285F4'
            : nodeType === 'source'
            ? '#EA4335'
            : '#FBBC05',
        weight: Math.random(),
      },
    });
  }

  // Generate edges
  for (let i = 0; i < edgeCount; i++) {
    const sourceIndex = Math.floor(Math.random() * nodeCount);
    let targetIndex = Math.floor(Math.random() * nodeCount);

    // Ensure no self-loops
    while (targetIndex === sourceIndex) {
      targetIndex = Math.floor(Math.random() * nodeCount);
    }

    const edgeType = Math.random() > 0.5 ? 'references' : 'influences';

    edges.push({
      id: `edge-${i}`,
      source: `node-${sourceIndex}`,
      target: `node-${targetIndex}`,
      type: edgeType,
      properties: {
        timestamp: new Date(
          Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
        ),
        strength: Math.random(),
      },
      metrics: {
        width: Math.random() * 2 + 1,
        color: edgeType === 'references' ? '#4285F4' : '#EA4335',
        weight: Math.random(),
      },
    });
  }

  return {
    nodes,
    edges,
    metadata: {
      timestamp: new Date(),
      nodeCount,
      edgeCount,
      density: edgeCount / (nodeCount * (nodeCount - 1)),
    },
  };
};

// Generate mock data for RealityTunnel
export interface RealityTunnelNode {
  id: string;
  content: string;
  timestamp: Date;
  deviationScore: number; // 0-1, how far from consensus
  strength: number; // 0-1, how strong/adopted this narrative is
  tunnelId: string; // which reality tunnel this belongs to
  parentId?: string; // parent node if this is a branch
}

export interface RealityTunnel {
  id: string;
  name: string;
  color: string;
  nodes: RealityTunnelNode[];
  isConsensus: boolean;
}

export const generateRealityTunnelData = (): RealityTunnel[] => {
  const tunnels: RealityTunnel[] = [];
  const tunnelCount = 4;
  const nodeCountPerTunnel = 8;

  // Generate tunnels
  for (let i = 0; i < tunnelCount; i++) {
    const isConsensus = i === 0;
    const tunnelId = `tunnel-${i}`;
    const nodes: RealityTunnelNode[] = [];

    // Generate nodes for this tunnel
    for (let j = 0; j < nodeCountPerTunnel; j++) {
      const timestamp = new Date(
        Date.now() - (nodeCountPerTunnel - j) * 3 * 24 * 60 * 60 * 1000
      );
      const deviationScore = isConsensus
        ? 0.1 + Math.random() * 0.2
        : 0.3 + Math.random() * 0.7;
      const strength = isConsensus
        ? 0.7 + Math.random() * 0.3
        : 0.2 + Math.random() * 0.5;

      nodes.push({
        id: `node-${tunnelId}-${j}`,
        content: `Event ${j} in ${
          isConsensus ? 'consensus' : 'alternative'
        } tunnel ${i}`,
        timestamp,
        deviationScore,
        strength,
        tunnelId,
        parentId: j > 0 ? `node-${tunnelId}-${j - 1}` : undefined,
      });
    }

    tunnels.push({
      id: tunnelId,
      name: isConsensus ? 'Consensus Reality' : `Alternative Narrative ${i}`,
      color: isConsensus
        ? '#4285F4'
        : ['#EA4335', '#FBBC05', '#34A853'][i - (1 % 3)],
      nodes,
      isConsensus,
    });
  }

  return tunnels;
};

// Generate mock data for TemporalNarrative
export interface NarrativeEvent {
  id: string;
  timestamp: Date;
  content: string;
  impact: number; // 0-1, significance of this event
}

export interface NarrativeStream {
  id: string;
  name: string;
  color: string;
  strength: number[]; // Array of strength values over time
  events: NarrativeEvent[]; // Key events in this narrative
  relatedStreams?: string[]; // IDs of related narrative streams
}

export interface TemporalData {
  timePoints: Date[]; // Array of time points for the x-axis
  streams: NarrativeStream[]; // Array of narrative streams
  externalEvents?: NarrativeEvent[]; // Optional external events that affected narratives
}

export const generateTemporalData = (): TemporalData => {
  const streamCount = 5;
  const timePointCount = 20;
  const now = new Date();
  const timePoints: Date[] = [];

  // Generate time points (one per day, going back from today)
  for (let i = 0; i < timePointCount; i++) {
    timePoints.push(
      new Date(now.getTime() - (timePointCount - i - 1) * 24 * 60 * 60 * 1000)
    );
  }

  const streams: NarrativeStream[] = [];

  // Generate streams
  for (let i = 0; i < streamCount; i++) {
    const streamId = `stream-${i}`;
    const strength: number[] = [];
    const events: NarrativeEvent[] = [];

    // Generate strength values for each time point
    let currentStrength = Math.random() * 0.3;
    for (let j = 0; j < timePointCount; j++) {
      // Add some randomness but keep a trend
      const change = (Math.random() - 0.5) * 0.1;
      currentStrength = Math.max(0, Math.min(1, currentStrength + change));
      strength.push(currentStrength);

      // Occasionally add an event
      if (Math.random() > 0.8) {
        events.push({
          id: `event-${streamId}-${j}`,
          timestamp: timePoints[j],
          content: `Key event in narrative ${i} at time point ${j}`,
          impact: Math.random() * 0.5 + 0.3,
        });
      }
    }

    // Ensure at least one event
    if (events.length === 0) {
      const j = Math.floor(Math.random() * timePointCount);
      events.push({
        id: `event-${streamId}-${j}`,
        timestamp: timePoints[j],
        content: `Key event in narrative ${i} at time point ${j}`,
        impact: Math.random() * 0.5 + 0.3,
      });
    }

    streams.push({
      id: streamId,
      name: `Narrative Stream ${i}`,
      color: ['#4285F4', '#EA4335', '#FBBC05', '#34A853', '#8E24AA'][i % 5],
      strength,
      events,
      relatedStreams: i > 0 ? [`stream-${i - 1}`] : undefined,
    });
  }

  // Generate some external events
  const externalEvents: NarrativeEvent[] = [];
  for (let i = 0; i < 3; i++) {
    const j = Math.floor(Math.random() * timePointCount);
    externalEvents.push({
      id: `external-${i}`,
      timestamp: timePoints[j],
      content: `External event ${i} affecting multiple narratives`,
      impact: Math.random() * 0.3 + 0.7,
    });
  }

  return {
    timePoints,
    streams,
    externalEvents,
  };
};
