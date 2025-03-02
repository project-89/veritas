import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  EnhancedTunnelNode,
  EnhancedTunnelBranch,
  EnhancedTunnelNarrative,
  EnhancedTunnelData,
  EnhancedTunnelVisualizationProps,
} from '../types/enhanced-tunnel-types';

// Generate sample data for demonstration purposes
export const generateSampleData = (): EnhancedTunnelData => {
  // Create sample narratives
  const narratives: EnhancedTunnelNarrative[] = [
    {
      id: 'narrative-1',
      name: 'Main Consensus',
      description: 'The primary consensus narrative',
      color: '#4285F4',
      metrics: { strength: 0.9, coherence: 0.85 },
    },
    {
      id: 'narrative-2',
      name: 'Alternative View',
      description: 'A significant alternative perspective',
      color: '#EA4335',
      metrics: { strength: 0.7, coherence: 0.6 },
    },
    {
      id: 'narrative-3',
      name: 'Emerging Theory',
      description: 'A newly emerging narrative',
      color: '#FBBC05',
      metrics: { strength: 0.4, coherence: 0.5 },
    },
    {
      id: 'narrative-4',
      name: 'Fringe Perspective',
      description: 'A less common perspective',
      color: '#34A853',
      metrics: { strength: 0.3, coherence: 0.4 },
    },
  ];

  // Create nodes along a timeline
  const nodes: EnhancedTunnelNode[] = [];
  const branches: EnhancedTunnelBranch[] = [];

  // Timeline spans 12 months
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 11);

  // Create main consensus path
  const mainPathNodes: EnhancedTunnelNode[] = [];
  for (let i = 0; i < 12; i++) {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + i);

    const node: EnhancedTunnelNode = {
      id: `main-${i}`,
      narrativeId: 'narrative-1',
      content: `Consensus point ${i + 1}`,
      timestamp: date,
      position: {
        x: i * 100,
        y: 0,
        z: 0,
      },
      metrics: {
        strength: 0.7 + Math.random() * 0.3,
        relevance: 0.8 + Math.random() * 0.2,
        consensus: 0.75 + Math.random() * 0.25,
      },
      connections: [],
      branchFactor: i % 3 === 0 ? 0.7 : 0.3, // Higher branch factor at key points
      isConsensus: true,
    };

    mainPathNodes.push(node);
    nodes.push(node);

    // Connect to previous node in the main path
    if (i > 0) {
      const branch: EnhancedTunnelBranch = {
        id: `main-branch-${i}`,
        sourceId: mainPathNodes[i - 1].id,
        targetId: node.id,
        narrativeId: 'narrative-1',
        strength: 0.8 + Math.random() * 0.2,
        metrics: {
          consensus: 0.8 + Math.random() * 0.2,
          traffic: 0.7 + Math.random() * 0.3,
        },
      };
      branches.push(branch);
      mainPathNodes[i - 1].connections.push(node.id);
    }

    // Create branches at certain points
    if (i % 3 === 0 && i > 0) {
      // Create alternative narrative branch
      const altNarrativeId = i % 6 === 0 ? 'narrative-2' : 'narrative-3';
      const branchLength = 2 + Math.floor(Math.random() * 3); // 2-4 nodes in branch

      let lastBranchNode = mainPathNodes[i];

      for (let j = 0; j < branchLength; j++) {
        const branchDate = new Date(date);
        branchDate.setMonth(branchDate.getMonth() + j * 0.5); // Branch nodes are closer in time

        const branchNode: EnhancedTunnelNode = {
          id: `branch-${i}-${j}`,
          narrativeId: altNarrativeId,
          content: `${
            altNarrativeId === 'narrative-2' ? 'Alternative' : 'Emerging'
          } point ${j + 1} from main ${i}`,
          timestamp: branchDate,
          position: {
            x: i * 100 + j * 50,
            y: (j + 1) * (altNarrativeId === 'narrative-2' ? 70 : -70),
            z: 0,
          },
          metrics: {
            strength: 0.4 + Math.random() * 0.4,
            relevance: 0.3 + Math.random() * 0.5,
            consensus: 0.2 + Math.random() * 0.4,
          },
          connections: [],
          branchFactor: 0.2,
          isConsensus: false,
        };

        nodes.push(branchNode);

        // Connect to previous node
        const branch: EnhancedTunnelBranch = {
          id: `branch-${i}-${j}-connection`,
          sourceId: lastBranchNode.id,
          targetId: branchNode.id,
          narrativeId: altNarrativeId,
          strength: 0.5 + Math.random() * 0.3,
          metrics: {
            consensus: 0.3 + Math.random() * 0.3,
            traffic: 0.2 + Math.random() * 0.4,
          },
        };

        branches.push(branch);
        lastBranchNode.connections.push(branchNode.id);
        lastBranchNode = branchNode;

        // Occasionally create a fringe branch from this branch
        if (j === 1 && Math.random() > 0.5) {
          const fringeNode: EnhancedTunnelNode = {
            id: `fringe-${i}-${j}`,
            narrativeId: 'narrative-4',
            content: `Fringe point from branch ${i}-${j}`,
            timestamp: new Date(branchDate),
            position: {
              x: i * 100 + j * 50 + 25,
              y: (j + 1) * (altNarrativeId === 'narrative-2' ? 140 : -140),
              z: 0,
            },
            metrics: {
              strength: 0.2 + Math.random() * 0.3,
              relevance: 0.1 + Math.random() * 0.3,
              consensus: 0.1 + Math.random() * 0.2,
            },
            connections: [],
            branchFactor: 0.1,
            isConsensus: false,
          };

          nodes.push(fringeNode);

          const fringeBranch: EnhancedTunnelBranch = {
            id: `fringe-${i}-${j}-connection`,
            sourceId: branchNode.id,
            targetId: fringeNode.id,
            narrativeId: 'narrative-4',
            strength: 0.3 + Math.random() * 0.2,
            metrics: {
              consensus: 0.1 + Math.random() * 0.2,
              traffic: 0.1 + Math.random() * 0.2,
            },
          };

          branches.push(fringeBranch);
          branchNode.connections.push(fringeNode.id);
        }
      }

      // Sometimes reconnect branch back to main path
      if (Math.random() > 0.5 && i < 9) {
        const reconnectIndex = Math.min(
          i + 2 + Math.floor(Math.random() * 2),
          mainPathNodes.length - 1
        );
        const reconnectTarget = mainPathNodes[reconnectIndex];

        // Only create reconnection if we have a valid target
        if (reconnectTarget) {
          const reconnectBranch: EnhancedTunnelBranch = {
            id: `reconnect-${i}`,
            sourceId: lastBranchNode.id,
            targetId: reconnectTarget.id,
            narrativeId: altNarrativeId,
            strength: 0.4 + Math.random() * 0.3,
            metrics: {
              consensus: 0.3 + Math.random() * 0.3,
              traffic: 0.2 + Math.random() * 0.3,
            },
          };

          branches.push(reconnectBranch);
          lastBranchNode.connections.push(reconnectTarget.id);
        }
      }
    }
  }

  return {
    nodes,
    branches,
    narratives,
    timeframe: {
      start: startDate,
      end: new Date(),
    },
    metadata: {
      title: 'Enhanced Reality Tunnel Visualization',
      description: 'Visualization of narrative branches and consensus reality',
      timestamp: new Date(),
    },
  };
};

export const EnhancedRealityTunnelVisualization: React.FC<
  EnhancedTunnelVisualizationProps
> = ({
  data,
  width = 1000,
  height = 600,
  depth = 200,
  perspective = 0.7,
  onNodeClick,
  onBranchClick,
  showLabels = true,
  interactive = true,
  highlightConsensus = true,
  colorScheme,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<EnhancedTunnelNode | null>(
    null
  );
  const [viewAngle, setViewAngle] = useState(0); // 0 degrees is front view
  const [viewElevation, setViewElevation] = useState(20); // Degrees above horizontal

  // Calculate 3D projection based on view angles
  const project = (x: number, y: number, z: number) => {
    // Convert angles to radians
    const angleRad = (viewAngle * Math.PI) / 180;
    const elevationRad = (viewElevation * Math.PI) / 180;

    // Apply rotation around Y axis (viewAngle)
    const rotX = x * Math.cos(angleRad) + z * Math.sin(angleRad);
    const rotZ = -x * Math.sin(angleRad) + z * Math.cos(angleRad);

    // Apply rotation around X axis (viewElevation)
    const rotY = y * Math.cos(elevationRad) - rotZ * Math.sin(elevationRad);
    const finalZ = y * Math.sin(elevationRad) + rotZ * Math.cos(elevationRad);

    // Apply perspective
    const scale = 1 + (finalZ / depth) * perspective;

    return {
      x: width / 2 + rotX * scale,
      y: height / 2 - rotY * scale, // Invert Y for SVG coordinate system
      z: finalZ,
      scale,
    };
  };

  // Render the visualization
  useEffect(() => {
    if (!svgRef.current || !data) return;

    // Clear previous visualization
    d3.select(svgRef.current).selectAll('*').remove();

    // Create SVG container
    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    // Create groups for different layers (back to front)
    const branchesGroup = svg.append('g').attr('class', 'branches');
    const nodesGroup = svg.append('g').attr('class', 'nodes');
    const labelsGroup = svg.append('g').attr('class', 'labels');

    // Calculate time scale
    const timeScale = d3
      .scaleTime()
      .domain([data.timeframe.start, data.timeframe.end])
      .range([0, 1000]);

    // Draw branches first (connections between nodes)
    branchesGroup
      .selectAll('.branch')
      .data(data.branches)
      .enter()
      .append('path')
      .attr('class', 'branch')
      .attr('id', (d) => `branch-${d.id}`)
      .attr('stroke', (d) => {
        const narrative = data.narratives.find((n) => n.id === d.narrativeId);
        return narrative ? narrative.color : '#999';
      })
      .attr('stroke-width', (d) => 1 + d.strength * 3)
      .attr('stroke-opacity', (d) => 0.4 + d.strength * 0.4)
      .attr('fill', 'none')
      .attr('d', (d) => {
        const source = data.nodes.find((n) => n.id === d.sourceId);
        const target = data.nodes.find((n) => n.id === d.targetId);

        if (!source || !target) return '';

        const sourcePos = project(
          source.position.x,
          source.position.y,
          source.position.z
        );
        const targetPos = project(
          target.position.x,
          target.position.y,
          target.position.z
        );

        // Create a curved path
        const midX = (sourcePos.x + targetPos.x) / 2;
        const midY = (sourcePos.y + targetPos.y) / 2;
        const controlY =
          midY -
          (targetPos.x - sourcePos.x) * 0.2 * (source.position.y < 0 ? -1 : 1);

        return `M ${sourcePos.x} ${sourcePos.y} Q ${midX} ${controlY}, ${targetPos.x} ${targetPos.y}`;
      })
      .attr('pointer-events', 'stroke')
      .on('mouseover', function (event, d) {
        d3.select(this)
          .attr('stroke-width', 2 + d.strength * 4)
          .attr('stroke-opacity', 0.7 + d.strength * 0.3);
      })
      .on('mouseout', function (event, d) {
        d3.select(this)
          .attr('stroke-width', 1 + d.strength * 3)
          .attr('stroke-opacity', 0.4 + d.strength * 0.4);
      })
      .on('click', (event, d) => {
        if (onBranchClick) onBranchClick(d);
      });

    // Draw nodes
    const nodeElements = nodesGroup
      .selectAll('.node')
      .data(data.nodes)
      .enter()
      .append('g')
      .attr('class', (d) => `node ${d.isConsensus ? 'consensus' : ''}`)
      .attr('id', (d) => `node-${d.id}`)
      .attr('transform', (d) => {
        const pos = project(d.position.x, d.position.y, d.position.z);
        return `translate(${pos.x}, ${pos.y})`;
      })
      .attr(
        'data-z',
        (d) => project(d.position.x, d.position.y, d.position.z).z
      )
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        setSelectedNode(d);
        if (onNodeClick) onNodeClick(d);
      });

    // Sort nodes by z-index for proper rendering
    nodeElements.sort((a, b) => {
      const aZ = project(a.position.x, a.position.y, a.position.z).z;
      const bZ = project(b.position.x, b.position.y, b.position.z).z;
      return bZ - aZ; // Draw back-to-front
    });

    // Add circles for nodes
    nodeElements
      .append('circle')
      .attr('r', (d) => {
        const pos = project(d.position.x, d.position.y, d.position.z);
        return (5 + d.metrics.strength * 10) * pos.scale;
      })
      .attr('fill', (d) => {
        const narrative = data.narratives.find((n) => n.id === d.narrativeId);
        return narrative ? narrative.color : '#999';
      })
      .attr('stroke', (d) =>
        d.isConsensus && highlightConsensus ? '#fff' : 'none'
      )
      .attr('stroke-width', (d) =>
        d.isConsensus && highlightConsensus ? 2 : 0
      )
      .attr('opacity', (d) => 0.7 + d.metrics.strength * 0.3)
      .on('mouseover', function (event, d) {
        d3.select(this)
          .attr('opacity', 1)
          .attr('stroke', '#fff')
          .attr('stroke-width', 2);
      })
      .on('mouseout', function (event, d) {
        d3.select(this)
          .attr('opacity', 0.7 + d.metrics.strength * 0.3)
          .attr('stroke', d.isConsensus && highlightConsensus ? '#fff' : 'none')
          .attr('stroke-width', d.isConsensus && highlightConsensus ? 2 : 0);
      });

    // Add labels if enabled
    if (showLabels) {
      nodeElements
        .append('text')
        .attr('dy', (d) => {
          const pos = project(d.position.x, d.position.y, d.position.z);
          return -((5 + d.metrics.strength * 10) * pos.scale) - 5;
        })
        .attr('text-anchor', 'middle')
        .attr('font-size', (d) => {
          const pos = project(d.position.x, d.position.y, d.position.z);
          return Math.max(8, 10 * pos.scale);
        })
        .attr('fill', (d) => {
          const narrative = data.narratives.find((n) => n.id === d.narrativeId);
          return narrative ? narrative.color : '#999';
        })
        .attr('opacity', (d) => 0.7 + d.metrics.strength * 0.3)
        .text((d) =>
          d.content.length > 20 ? d.content.substring(0, 20) + '...' : d.content
        );
    }

    // Add timeline axis
    const timeAxis = svg
      .append('g')
      .attr('class', 'time-axis')
      .attr('transform', `translate(0, ${height - 30})`);

    // Create axis
    const xAxis = d3
      .axisBottom(timeScale)
      .ticks(d3.timeMonth.every(1))
      .tickFormat((d) => {
        // Ensure d is a Date before formatting
        if (d instanceof Date) {
          return d3.timeFormat('%b %Y')(d);
        }
        return '';
      });

    timeAxis.call(xAxis);

    // Add legend
    const legend = svg
      .append('g')
      .attr('transform', `translate(${width - 150}, 20)`)
      .attr('class', 'legend');

    legend
      .append('rect')
      .attr('width', 140)
      .attr('height', data.narratives.length * 20 + 30)
      .attr('fill', 'white')
      .attr('fill-opacity', 0.8)
      .attr('rx', 5);

    legend
      .append('text')
      .attr('x', 10)
      .attr('y', 20)
      .attr('font-size', 12)
      .attr('font-weight', 'bold')
      .text('Narratives');

    data.narratives.forEach((narrative, i) => {
      const g = legend
        .append('g')
        .attr('transform', `translate(10, ${35 + i * 20})`);

      g.append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', narrative.color);

      g.append('text')
        .attr('x', 20)
        .attr('y', 10)
        .attr('font-size', 10)
        .text(narrative.name);
    });

    // Add controls for 3D view if interactive
    if (interactive) {
      const controls = svg
        .append('g')
        .attr('transform', `translate(20, ${height - 80})`)
        .attr('class', 'controls');

      controls
        .append('rect')
        .attr('width', 180)
        .attr('height', 70)
        .attr('fill', 'white')
        .attr('fill-opacity', 0.8)
        .attr('rx', 5);

      controls
        .append('text')
        .attr('x', 10)
        .attr('y', 20)
        .attr('font-size', 12)
        .attr('font-weight', 'bold')
        .text('View Controls');

      // Rotation control
      controls
        .append('text')
        .attr('x', 10)
        .attr('y', 40)
        .attr('font-size', 10)
        .text('Rotation:');

      const rotationSlider = controls
        .append('g')
        .attr('transform', 'translate(70, 36)');

      rotationSlider
        .append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', 100)
        .attr('y2', 0)
        .attr('stroke', '#ccc')
        .attr('stroke-width', 2);

      const rotationHandle = rotationSlider
        .append('circle')
        .attr('cx', ((viewAngle + 180) / 360) * 100)
        .attr('cy', 0)
        .attr('r', 6)
        .attr('fill', '#4285F4')
        .attr('cursor', 'pointer')
        .call(
          d3.drag<SVGCircleElement, unknown>().on('drag', (event) => {
            const x = Math.max(0, Math.min(100, event.x));
            rotationHandle.attr('cx', x);
            const newAngle = (x / 100) * 360 - 180;
            setViewAngle(newAngle);
          })
        );

      // Elevation control
      controls
        .append('text')
        .attr('x', 10)
        .attr('y', 60)
        .attr('font-size', 10)
        .text('Elevation:');

      const elevationSlider = controls
        .append('g')
        .attr('transform', 'translate(70, 56)');

      elevationSlider
        .append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', 100)
        .attr('y2', 0)
        .attr('stroke', '#ccc')
        .attr('stroke-width', 2);

      const elevationHandle = elevationSlider
        .append('circle')
        .attr('cx', ((viewElevation + 45) / 90) * 100)
        .attr('cy', 0)
        .attr('r', 6)
        .attr('fill', '#EA4335')
        .attr('cursor', 'pointer')
        .call(
          d3.drag<SVGCircleElement, unknown>().on('drag', (event) => {
            const x = Math.max(0, Math.min(100, event.x));
            elevationHandle.attr('cx', x);
            const newElevation = (x / 100) * 90 - 45;
            setViewElevation(newElevation);
          })
        );
    }
  }, [
    data,
    width,
    height,
    depth,
    perspective,
    viewAngle,
    viewElevation,
    showLabels,
    highlightConsensus,
    onNodeClick,
    onBranchClick,
    interactive,
  ]);

  return (
    <div
      className="enhanced-reality-tunnel-container"
      style={{ position: 'relative', width, height }}
    >
      <svg ref={svgRef} />

      {selectedNode && (
        <div
          className="node-details"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            background: 'rgba(255, 255, 255, 0.9)',
            padding: 10,
            borderRadius: 5,
            maxWidth: 300,
          }}
        >
          <h3 style={{ margin: '0 0 5px 0' }}>{selectedNode.content}</h3>
          <p style={{ margin: '0 0 5px 0' }}>
            Date: {selectedNode.timestamp.toLocaleDateString()}
          </p>
          <p style={{ margin: 0 }}>
            Strength: {selectedNode.metrics.strength.toFixed(2)} | Relevance:{' '}
            {selectedNode.metrics.relevance.toFixed(2)} | Consensus:{' '}
            {selectedNode.metrics.consensus.toFixed(2)}
          </p>
          <p style={{ margin: '5px 0 0 0', fontStyle: 'italic' }}>
            {selectedNode.isConsensus
              ? 'Consensus Reality Point'
              : 'Alternative Narrative Point'}
          </p>
        </div>
      )}
    </div>
  );
};
