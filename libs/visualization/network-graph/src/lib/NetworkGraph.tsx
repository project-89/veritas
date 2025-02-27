import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import {
  NetworkGraph,
  NetworkNode,
  NetworkEdge,
} from "../services/visualization.service";

// Extend NetworkNode with D3 simulation properties
interface SimulationNode extends NetworkNode, d3.SimulationNodeDatum {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

// Extend NetworkEdge with D3 simulation properties
interface SimulationLink extends d3.SimulationLinkDatum<SimulationNode> {
  source: string | SimulationNode;
  target: string | SimulationNode;
  type: string;
  metrics: NetworkEdge["metrics"];
}

interface NetworkGraphProps {
  data: NetworkGraph;
  width?: number;
  height?: number;
  onNodeClick?: (node: NetworkNode) => void;
  onEdgeClick?: (edge: NetworkEdge) => void;
}

export const NetworkGraphVisualization: React.FC<NetworkGraphProps> = ({
  data,
  width = 800,
  height = 600,
  onNodeClick,
  onEdgeClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data) return;

    // Clear previous visualization
    d3.select(svgRef.current).selectAll("*").remove();

    // Create SVG container
    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    // Cast nodes and links to simulation types
    const nodes = data.nodes as SimulationNode[];
    const links = data.edges as SimulationLink[];

    // Create simulation
    const simulation = d3
      .forceSimulation<SimulationNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimulationNode, SimulationLink>(links)
          .id((d) => d.id)
          .distance(100)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(50));

    // Create container group with zoom
    const g = svg.append("g");
    svg.call(
      d3
        .zoom()
        .extent([
          [0, 0],
          [width, height],
        ])
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
        })
    );

    // Draw edges
    const edges = g
      .append("g")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke-width", (d) => d.metrics.width)
      .attr("stroke", (d) => d.metrics.color)
      .attr("opacity", 0.6)
      .on("click", (event, d) => onEdgeClick?.(d as unknown as NetworkEdge));

    // Draw nodes
    const nodeGroups = g
      .append("g")
      .selectAll("g")
      .data(nodes)
      .enter()
      .append("g")
      .attr("cursor", "pointer")
      .on("click", (event, d) => onNodeClick?.(d));

    // Node circles
    nodeGroups
      .append("circle")
      .attr("r", (d) => d.metrics.size)
      .attr("fill", (d) => d.metrics.color)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);

    // Node labels
    nodeGroups
      .append("text")
      .text((d) => d.label)
      .attr("dy", 4)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("fill", "#333");

    // Add tooltips
    nodeGroups
      .append("title")
      .text((d) => `${d.label}\nType: ${d.type}\nWeight: ${d.metrics.weight}`);

    edges.append("title").text((d) => `${d.type}\nWeight: ${d.metrics.weight}`);

    // Update positions on simulation tick
    simulation.on("tick", () => {
      edges
        .attr("x1", (d) => (d.source as SimulationNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimulationNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimulationNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimulationNode).y ?? 0);

      nodeGroups.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // Drag behavior
    nodeGroups.call(
      d3
        .drag<SVGGElement, SimulationNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [data, width, height, onNodeClick, onEdgeClick]);

  return (
    <div className="network-graph-container">
      <svg ref={svgRef} />
    </div>
  );
};
