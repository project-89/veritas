import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  MyceliumData,
  MyceliumNode,
  MyceliumBranch,
  NarrativeCluster,
  MyceliumVisualizationProps,
} from '../types/mycelium-types';

// Generate sample data for demonstration purposes
export const generateSampleData = (): MyceliumData => {
  const nodes: MyceliumNode[] = [];
  const branches: MyceliumBranch[] = [];
  const clusters: NarrativeCluster[] = [];

  // Create clusters
  const clusterColors = ['#4285F4', '#EA4335', '#FBBC05', '#34A853', '#8F44AD'];
  for (let i = 0; i < 5; i++) {
    clusters.push({
      id: `cluster-${i}`,
      name: `Narrative Cluster ${i + 1}`,
      description: `A cluster of related narrative elements about topic ${
        i + 1
      }`,
      color: clusterColors[i],
      nodes: [],
      centralNodeId: `node-${i}-0`,
      metrics: {
        cohesion: Math.random() * 0.5 + 0.5,
        influence: Math.random(),
        growth: Math.random() * 0.2 + 0.1,
      },
    });
  }

  // Create nodes
  let nodeId = 0;
  clusters.forEach((cluster, clusterIndex) => {
    // Create a root node for each cluster
    const rootNode: MyceliumNode = {
      id: `node-${clusterIndex}-${nodeId}`,
      narrativeId: cluster.id,
      content: `Root narrative point for ${cluster.name}`,
      timestamp: new Date(
        Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
      ),
      strength: 0.8 + Math.random() * 0.2,
      connections: [],
      type: 'root',
      metrics: {
        influence: 0.7 + Math.random() * 0.3,
        growth: 0.1 + Math.random() * 0.1,
        color: cluster.color,
      },
    };
    nodes.push(rootNode);
    cluster.nodes.push(rootNode.id);
    nodeId++;

    // Create branch nodes for each cluster
    const branchCount = Math.floor(Math.random() * 10) + 5;
    for (let i = 0; i < branchCount; i++) {
      const parentIndex = i === 0 ? 0 : Math.floor(Math.random() * i);
      const parentId = cluster.nodes[parentIndex];

      const branchNode: MyceliumNode = {
        id: `node-${clusterIndex}-${nodeId}`,
        narrativeId: cluster.id,
        content: `Branch narrative point ${i + 1} for ${cluster.name}`,
        timestamp: new Date(
          Date.now() - Math.random() * 20 * 24 * 60 * 60 * 1000
        ),
        strength: 0.4 + Math.random() * 0.4,
        connections: [parentId],
        type: i < branchCount / 2 ? 'branch' : 'leaf',
        metrics: {
          influence: 0.3 + Math.random() * 0.4,
          growth: 0.05 + Math.random() * 0.15,
          color: d3
            .color(cluster.color)!
            .brighter(Math.random() * 0.5)
            .toString(),
        },
      };
      nodes.push(branchNode);
      cluster.nodes.push(branchNode.id);

      // Create branch connection
      branches.push({
        id: `branch-${branches.length}`,
        sourceId: parentId,
        targetId: branchNode.id,
        strength: 0.3 + Math.random() * 0.7,
        type:
          i < branchCount / 3
            ? 'primary'
            : i < (2 * branchCount) / 3
            ? 'secondary'
            : 'tertiary',
        metrics: {
          width: 1 + Math.random() * 3,
          color: cluster.color,
          age: Math.random(),
        },
      });

      // Update parent node connections
      const parentNode = nodes.find((n) => n.id === parentId);
      if (parentNode) {
        parentNode.connections.push(branchNode.id);
      }

      nodeId++;
    }
  });

  // Create some cross-cluster connections
  for (let i = 0; i < 10; i++) {
    const sourceClusterIndex = Math.floor(Math.random() * clusters.length);
    let targetClusterIndex;
    do {
      targetClusterIndex = Math.floor(Math.random() * clusters.length);
    } while (targetClusterIndex === sourceClusterIndex);

    const sourceNodeIndex = Math.floor(
      Math.random() * clusters[sourceClusterIndex].nodes.length
    );
    const targetNodeIndex = Math.floor(
      Math.random() * clusters[targetClusterIndex].nodes.length
    );

    const sourceId = clusters[sourceClusterIndex].nodes[sourceNodeIndex];
    const targetId = clusters[targetClusterIndex].nodes[targetNodeIndex];

    branches.push({
      id: `cross-branch-${i}`,
      sourceId,
      targetId,
      strength: 0.1 + Math.random() * 0.3,
      type: 'tertiary',
      metrics: {
        width: 0.5 + Math.random() * 1.5,
        color: '#999999',
        age: Math.random() * 0.5,
      },
    });

    // Update node connections
    const sourceNode = nodes.find((n) => n.id === sourceId);
    const targetNode = nodes.find((n) => n.id === targetId);
    if (sourceNode && targetNode) {
      sourceNode.connections.push(targetId);
      targetNode.connections.push(sourceId);
    }
  }

  return {
    nodes,
    branches,
    clusters,
    metadata: {
      timestamp: new Date(),
      totalStrength: nodes.reduce((sum, node) => sum + node.strength, 0),
      dominantClusterId: clusters.sort(
        (a, b) => b.metrics.influence - a.metrics.influence
      )[0].id,
      timeframe: {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(),
      },
    },
  };
};

export const NarrativeMyceliumVisualization: React.FC<
  MyceliumVisualizationProps
> = ({
  data,
  width = 800,
  height = 600,
  depth = 200,
  onNodeClick,
  onClusterClick,
  showLabels = true,
  animate = true,
  perspective = 0.5,
  colorScheme,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<MyceliumNode | null>(null);
  const [selectedCluster, setSelectedCluster] =
    useState<NarrativeCluster | null>(null);

  useEffect(() => {
    if (!svgRef.current || !data) return;

    // Clear previous visualization
    d3.select(svgRef.current).selectAll('*').remove();

    // Create SVG container
    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('style', 'max-width: 100%; height: auto;');

    // Create a group for the visualization
    const g = svg.append('g');

    // Define types for D3 simulation nodes and links
    interface SimulationNode extends MyceliumNode {
      x?: number;
      y?: number;
      vx?: number;
      vy?: number;
      index?: number;
    }

    interface SimulationLink extends d3.SimulationLinkDatum<SimulationNode> {
      source: SimulationNode;
      target: SimulationNode;
      metrics?: {
        width: number;
        color: string;
        age: number;
      };
      strength?: number;
    }

    // Create nodes and links for the simulation
    const nodes: SimulationNode[] = data.nodes.map((node) => ({
      ...node,
    }));

    const links: SimulationLink[] = data.branches
      .map((branch) => {
        const source = nodes.find((n) => n.id === branch.sourceId);
        const target = nodes.find((n) => n.id === branch.targetId);

        if (!source || !target) {
          console.error(`Could not find nodes for branch: ${branch.id}`);
          // Return a placeholder to avoid breaking the visualization
          return {
            source: nodes[0],
            target: nodes[0],
            index: 0,
            metrics: branch.metrics,
            strength: branch.strength,
          };
        }

        return {
          source,
          target,
          index: 0,
          metrics: branch.metrics,
          strength: branch.strength,
        };
      })
      .filter((link) => link.source !== link.target);

    // Create the simulation
    const simulation = d3
      .forceSimulation<SimulationNode, SimulationLink>(nodes)
      .force('charge', d3.forceManyBody().strength(-100))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force(
        'link',
        d3
          .forceLink<SimulationNode, SimulationLink>(links)
          .id((d) => d.id)
          .distance(70)
      )
      .alphaTarget(0);

    // Create links with hover effects
    const link = g
      .selectAll('.link')
      .data(links)
      .enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke', (d) => d.metrics?.color || '#999')
      .attr('stroke-width', (d) => d.metrics?.width || 1)
      .attr('opacity', (d) => d.strength || 0.5)
      .on('mouseover', function (event, d: SimulationLink) {
        // Highlight the link
        d3.select(this)
          .attr('stroke-width', String((d.metrics?.width || 1) * 2))
          .attr('opacity', '1');

        // Get source and target node information
        const sourceNode = d.source;
        const targetNode = d.target;

        // Calculate position for tooltip (middle of the link)
        const x = ((sourceNode.x || 0) + (targetNode.x || 0)) / 2;
        const y = ((sourceNode.y || 0) + (targetNode.y || 0)) / 2;

        // Show tooltip with connection information
        const tooltip = svg
          .append('g')
          .attr('class', 'link-tooltip')
          .attr('transform', `translate(${x}, ${y})`);

        // Add background rectangle with better visibility
        tooltip
          .append('rect')
          .attr('x', -100)
          .attr('y', -45)
          .attr('width', 200)
          .attr('height', 90)
          .attr('fill', 'rgba(255, 255, 255, 0.95)')
          .attr('stroke', '#333')
          .attr('stroke-width', 2)
          .attr('rx', 5)
          .attr('opacity', 0.95);

        // Add connection information with improved text outline
        // Connection type
        tooltip
          .append('text')
          .attr('y', -20)
          .attr('text-anchor', 'middle')
          .attr('font-size', '14px')
          .attr('font-weight', 'bold')
          .attr('stroke', 'white')
          .attr('stroke-width', 4)
          .attr('stroke-linejoin', 'round')
          .attr('paint-order', 'stroke')
          .text(`Connection Strength: ${(d.strength || 0).toFixed(2)}`);

        tooltip
          .append('text')
          .attr('y', -20)
          .attr('text-anchor', 'middle')
          .attr('font-size', '14px')
          .attr('font-weight', 'bold')
          .attr('fill', '#000')
          .text(`Connection Strength: ${(d.strength || 0).toFixed(2)}`);

        // Source node
        tooltip
          .append('text')
          .attr('y', 5)
          .attr('text-anchor', 'middle')
          .attr('font-size', '12px')
          .attr('stroke', 'white')
          .attr('stroke-width', 4)
          .attr('stroke-linejoin', 'round')
          .attr('paint-order', 'stroke')
          .text(`From: ${sourceNode.content.substring(0, 15)}...`);

        tooltip
          .append('text')
          .attr('y', 5)
          .attr('text-anchor', 'middle')
          .attr('font-size', '12px')
          .attr('fill', '#000')
          .text(`From: ${sourceNode.content.substring(0, 15)}...`);

        // Target node
        tooltip
          .append('text')
          .attr('y', 30)
          .attr('text-anchor', 'middle')
          .attr('font-size', '12px')
          .attr('stroke', 'white')
          .attr('stroke-width', 4)
          .attr('stroke-linejoin', 'round')
          .attr('paint-order', 'stroke')
          .text(`To: ${targetNode.content.substring(0, 15)}...`);

        tooltip
          .append('text')
          .attr('y', 30)
          .attr('text-anchor', 'middle')
          .attr('font-size', '12px')
          .attr('fill', '#000')
          .text(`To: ${targetNode.content.substring(0, 15)}...`);
      })
      .on('mouseout', function (event, d: SimulationLink) {
        // Restore original link style
        d3.select(this)
          .attr('stroke-width', String(d.metrics?.width || 1))
          .attr('opacity', String(d.strength || 0.5));

        // Remove tooltip
        svg.selectAll('.link-tooltip').remove();
      });

    // Create nodes
    const node = g
      .selectAll('.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .call(
        d3
          .drag<any, any>()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended)
      );

    // Add circles to nodes
    node
      .append('circle')
      .attr('r', (d) => 5 + d.strength * 15)
      .attr('fill', (d) => d.metrics.color)
      .attr('opacity', (d) => 0.7 + d.strength * 0.3)
      .attr('stroke', (d) => d3.color(d.metrics.color)!.darker().toString())
      .attr('stroke-width', 1);

    // Add labels if enabled
    if (showLabels) {
      node
        .append('g')
        .attr('class', 'label')
        .each(function (d: SimulationNode) {
          if (d.type === 'root') {
            const label = d3.select(this);

            // Add text background/outline for better visibility
            label
              .append('text')
              .attr('dx', 10 + d.strength * 10)
              .attr('dy', 4)
              .attr('font-size', '10px')
              .attr('stroke', 'white')
              .attr('stroke-width', 3)
              .attr('stroke-linejoin', 'round')
              .attr('paint-order', 'stroke')
              .text(d.content.substring(0, 20));

            // Add the main text on top
            label
              .append('text')
              .attr('dx', 10 + d.strength * 10)
              .attr('dy', 4)
              .attr('font-size', '10px')
              .attr('fill', '#333')
              .text(d.content.substring(0, 20));
          }
        });
    }

    // Add hover effects
    node
      .on('mouseover', function (event, d: SimulationNode) {
        d3.select(this)
          .select('circle')
          .attr('stroke-width', 2)
          .attr('stroke', '#fff');

        // Show tooltip with text outline
        const tooltip = svg
          .append('g')
          .attr('class', 'tooltip')
          .attr('transform', `translate(${d.x ?? 0 + 10}, ${d.y ?? 0 - 10})`);

        // Add background rectangle for better visibility
        tooltip
          .append('rect')
          .attr('x', -5)
          .attr('y', -15)
          .attr('width', function () {
            const textLength = d.content.substring(0, 30).length * 7;
            return Math.max(textLength, 100);
          })
          .attr('height', 25)
          .attr('fill', 'rgba(255, 255, 255, 0.95)')
          .attr('stroke', '#333')
          .attr('stroke-width', 1)
          .attr('rx', 3)
          .attr('opacity', 0.95);

        // Add text background/outline for better visibility
        tooltip
          .append('text')
          .attr('font-size', '12px')
          .attr('dy', 0)
          .attr('fill', 'black')
          .attr('stroke', 'white')
          .attr('stroke-width', 4)
          .attr('stroke-linejoin', 'round')
          .attr('paint-order', 'stroke')
          .text(
            d.content.substring(0, 30) + (d.content.length > 30 ? '...' : '')
          );

        // Add the main text on top
        tooltip
          .append('text')
          .attr('font-size', '12px')
          .attr('dy', 0)
          .attr('fill', '#000')
          .text(
            d.content.substring(0, 30) + (d.content.length > 30 ? '...' : '')
          );
      })
      .on('mouseout', function () {
        const circleElement = d3.select(this).select('circle');
        const parentData = d3.select(this).datum() as SimulationNode;

        circleElement.attr('stroke-width', 1).attr('stroke', () => {
          return d3.color(parentData.metrics.color)!.darker().toString();
        });

        // Remove tooltip
        svg.selectAll('.tooltip').remove();
      })
      .on('click', function (event, d: SimulationNode) {
        setSelectedNode(d);
        if (onNodeClick) onNodeClick(d);
      });

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => d.source.x ?? 0)
        .attr('y1', (d) => d.source.y ?? 0)
        .attr('x2', (d) => d.target.x ?? 0)
        .attr('y2', (d) => d.target.y ?? 0);

      node.attr('transform', (d) => `translate(${d.x ?? 0}, ${d.y ?? 0})`);
    });

    // Connect links to the simulation
    simulation
      .force<d3.ForceLink<SimulationNode, SimulationLink>>('link')!
      .links(links);

    // Add cluster labels
    const clusterLabels = svg
      .append('g')
      .selectAll('.cluster-label')
      .data(data.clusters)
      .enter()
      .append('text')
      .attr('class', 'cluster-label')
      .attr('x', 20)
      .attr('y', (d, i) => 30 + i * 20)
      .attr('font-size', '14px')
      .attr('fill', (d) => d.color)
      .text((d) => d.name)
      .on('click', function (event, d) {
        setSelectedCluster(d);
        if (onClusterClick) onClusterClick(d);
      });

    // Add legend
    const legend = svg
      .append('g')
      .attr('transform', `translate(${width - 150}, 20)`);

    legend
      .append('text')
      .attr('x', 0)
      .attr('y', 0)
      .attr('font-size', '14px')
      .attr('font-weight', 'bold')
      .text('Node Types');

    const nodeTypes = [
      { type: 'root', label: 'Root Node' },
      { type: 'branch', label: 'Branch Node' },
      { type: 'leaf', label: 'Leaf Node' },
    ];

    nodeTypes.forEach((type, i) => {
      const g = legend
        .append('g')
        .attr('transform', `translate(0, ${20 + i * 20})`);

      g.append('circle')
        .attr('r', 5)
        .attr(
          'fill',
          type.type === 'root'
            ? '#333'
            : type.type === 'branch'
            ? '#666'
            : '#999'
        );

      g.append('text')
        .attr('x', 15)
        .attr('y', 5)
        .attr('font-size', '12px')
        .text(type.label);
    });

    // Drag functions
    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Add animation if enabled
    if (animate) {
      const pulseAnimation = () => {
        node
          .select('circle')
          .transition()
          .duration(2000)
          .attr('r', (d) => 5 + d.strength * 15 + Math.random() * 5)
          .transition()
          .duration(2000)
          .attr('r', (d) => 5 + d.strength * 15)
          .on('end', pulseAnimation);
      };

      pulseAnimation();
    }

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [
    data,
    width,
    height,
    depth,
    showLabels,
    animate,
    perspective,
    onNodeClick,
    onClusterClick,
  ]);

  return (
    <div className="narrative-mycelium-container">
      <svg ref={svgRef} />
      {selectedNode && (
        <div
          className="node-details"
          style={{
            padding: '10px',
            background: '#f5f5f5',
            borderRadius: '5px',
            marginTop: '10px',
          }}
        >
          <h3>{selectedNode.content}</h3>
          <p>Strength: {selectedNode.strength.toFixed(2)}</p>
          <p>Type: {selectedNode.type}</p>
          <p>Influence: {selectedNode.metrics.influence.toFixed(2)}</p>
          <p>Growth: {selectedNode.metrics.growth.toFixed(2)}</p>
          <p>Connections: {selectedNode.connections.length}</p>
        </div>
      )}
    </div>
  );
};
