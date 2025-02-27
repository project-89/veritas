import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Node } from "@veritas/visualization/shared";

interface RealityTunnelNode {
  id: string;
  content: string;
  timestamp: Date;
  deviationScore: number; // 0-1, how far from consensus
  strength: number; // 0-1, how strong/adopted this narrative is
  tunnelId: string; // which reality tunnel this belongs to
  parentId?: string; // parent node if this is a branch
}

interface RealityTunnel {
  id: string;
  name: string;
  color: string;
  nodes: RealityTunnelNode[];
  isConsensus: boolean;
}

interface RealityTunnelVisualizationProps {
  data: RealityTunnel[];
  width?: number;
  height?: number;
  startDate?: Date;
  endDate?: Date;
  onNodeClick?: (node: RealityTunnelNode) => void;
}

export const RealityTunnelVisualization: React.FC<
  RealityTunnelVisualizationProps
> = ({
  data,
  width = 900,
  height = 600,
  startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
  endDate = new Date(),
  onNodeClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedTunnel, setSelectedTunnel] = useState<string | null>(null);

  useEffect(() => {
    if (!svgRef.current || !data || data.length === 0) return;

    // Clear previous visualization
    d3.select(svgRef.current).selectAll("*").remove();

    // Create SVG container
    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    // Add container group with zoom
    const g = svg.append("g");
    svg.call(
      // @ts-ignore - d3 typing issue
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

    // Setup scales
    const timeScale = d3
      .scaleTime()
      .domain([startDate, endDate])
      .range([50, width - 50]);

    const deviationScale = d3
      .scaleLinear()
      .domain([0, 1]) // Deviation score from 0-1
      .range([height / 2, 50]); // Center to top

    const negativeDeviationScale = d3
      .scaleLinear()
      .domain([0, 1])
      .range([height / 2, height - 50]); // Center to bottom

    const strengthScale = d3.scaleLinear().domain([0, 1]).range([2, 20]);

    // Find consensus tunnel
    const consensusTunnel = data.find((tunnel) => tunnel.isConsensus);
    if (!consensusTunnel) return;

    // Draw time axis
    const timeAxis = d3.axisBottom(timeScale);
    g.append("g")
      .attr("transform", `translate(0, ${height / 2})`)
      .call(timeAxis);

    // Draw central trunk (consensus reality)
    const consensusLine = d3
      .line<RealityTunnelNode>()
      .x((d) => timeScale(d.timestamp))
      .y(height / 2) // Always in the center
      .curve(d3.curveBasis);

    g.append("path")
      .datum(
        consensusTunnel.nodes.sort(
          (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
        )
      )
      .attr("d", consensusLine)
      .attr("stroke", consensusTunnel.color)
      .attr("stroke-width", 10)
      .attr("fill", "none")
      .attr("opacity", 0.8);

    // Draw reality tunnels
    data.forEach((tunnel) => {
      if (tunnel.isConsensus) return; // Skip consensus tunnel (already drawn)

      // Filter nodes if a tunnel is selected
      if (selectedTunnel && selectedTunnel !== tunnel.id) {
        return;
      }

      const tunnelLine = d3
        .line<RealityTunnelNode>()
        .x((d) => timeScale(d.timestamp))
        .y((d) => {
          // Positive deviation goes up, negative goes down (just for visualization)
          return tunnel.id.charCodeAt(0) % 2 === 0
            ? deviationScale(d.deviationScore)
            : negativeDeviationScale(d.deviationScore);
        })
        .curve(d3.curveBasis);

      // Sort nodes by timestamp
      const sortedNodes = tunnel.nodes.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );

      // Draw tunnel path
      g.append("path")
        .datum(sortedNodes)
        .attr("d", tunnelLine)
        .attr("stroke", tunnel.color)
        .attr("stroke-width", (d) => 5 + (selectedTunnel === tunnel.id ? 3 : 0))
        .attr("fill", "none")
        .attr("opacity", 0.7)
        .attr("cursor", "pointer")
        .on("click", () => {
          setSelectedTunnel(selectedTunnel === tunnel.id ? null : tunnel.id);
        });

      // Draw nodes
      g.selectAll(`.node-${tunnel.id}`)
        .data(sortedNodes)
        .enter()
        .append("circle")
        .attr("class", `node-${tunnel.id}`)
        .attr("cx", (d) => timeScale(d.timestamp))
        .attr("cy", (d) => {
          return tunnel.id.charCodeAt(0) % 2 === 0
            ? deviationScale(d.deviationScore)
            : negativeDeviationScale(d.deviationScore);
        })
        .attr("r", (d) => strengthScale(d.strength))
        .attr("fill", tunnel.color)
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .attr("cursor", "pointer")
        .on("click", (event, d) => {
          event.stopPropagation();
          if (onNodeClick) onNodeClick(d);
        })
        .append("title")
        .text((d) => d.content);

      // Draw connections to parent nodes (if they exist)
      sortedNodes.forEach((node) => {
        if (node.parentId) {
          // Find parent node
          const parentNode = consensusTunnel.nodes.find(
            (n) => n.id === node.parentId
          );
          if (parentNode) {
            g.append("line")
              .attr("x1", timeScale(parentNode.timestamp))
              .attr("y1", height / 2) // Parent is on consensus line
              .attr("x2", timeScale(node.timestamp))
              .attr(
                "y2",
                tunnel.id.charCodeAt(0) % 2 === 0
                  ? deviationScale(node.deviationScore)
                  : negativeDeviationScale(node.deviationScore)
              )
              .attr("stroke", "#999")
              .attr("stroke-width", 1)
              .attr("stroke-dasharray", "3,3")
              .attr("opacity", 0.5);
          }
        }
      });
    });

    // Add legend
    const legend = svg
      .append("g")
      .attr("transform", `translate(${width - 150}, 20)`);

    data.forEach((tunnel, i) => {
      legend
        .append("rect")
        .attr("x", 0)
        .attr("y", i * 20)
        .attr("width", 15)
        .attr("height", 15)
        .attr("fill", tunnel.color)
        .attr("cursor", "pointer")
        .on("click", () => {
          setSelectedTunnel(selectedTunnel === tunnel.id ? null : tunnel.id);
        });

      legend
        .append("text")
        .attr("x", 20)
        .attr("y", i * 20 + 12)
        .text(tunnel.name)
        .attr("font-size", "12px")
        .attr("cursor", "pointer")
        .on("click", () => {
          setSelectedTunnel(selectedTunnel === tunnel.id ? null : tunnel.id);
        });
    });

    // Add reset button
    legend
      .append("text")
      .attr("x", 0)
      .attr("y", data.length * 20 + 20)
      .text("Reset View")
      .attr("font-size", "12px")
      .attr("cursor", "pointer")
      .attr("fill", "blue")
      .attr("text-decoration", "underline")
      .on("click", () => {
        setSelectedTunnel(null);
      });
  }, [data, width, height, startDate, endDate, selectedTunnel, onNodeClick]);

  return (
    <div className="reality-tunnel-visualization">
      <h3>Reality Tunnel Visualization</h3>
      <div className="visualization-container">
        <svg ref={svgRef} />
      </div>
      {selectedTunnel && (
        <div className="tunnel-details">
          <h4>
            Selected Tunnel: {data.find((t) => t.id === selectedTunnel)?.name}
          </h4>
          <button onClick={() => setSelectedTunnel(null)}>
            Clear Selection
          </button>
        </div>
      )}
    </div>
  );
};

// Sample data generator for testing
export const generateSampleData = (): RealityTunnel[] => {
  // Create consensus tunnel
  const consensusTunnel: RealityTunnel = {
    id: "consensus",
    name: "Consensus Reality",
    color: "#2B6CB0",
    isConsensus: true,
    nodes: [],
  };

  // Generate consensus nodes
  const now = new Date();
  for (let i = 0; i < 20; i++) {
    consensusTunnel.nodes.push({
      id: `consensus-${i}`,
      content: `Consensus point ${i}`,
      timestamp: new Date(now.getTime() - (20 - i) * 24 * 60 * 60 * 1000), // One per day
      deviationScore: 0,
      strength: 0.5 + Math.random() * 0.5, // 0.5-1.0
      tunnelId: "consensus",
    });
  }

  // Create divergent tunnels
  const tunnels: RealityTunnel[] = [
    consensusTunnel,
    {
      id: "tunnel-1",
      name: "Alternative Perspective A",
      color: "#48BB78",
      isConsensus: false,
      nodes: [],
    },
    {
      id: "tunnel-2",
      name: "Fringe Theory B",
      color: "#F56565",
      isConsensus: false,
      nodes: [],
    },
    {
      id: "tunnel-3",
      name: "Emerging Narrative C",
      color: "#805AD5",
      isConsensus: false,
      nodes: [],
    },
  ];

  // Generate nodes for each tunnel
  tunnels.slice(1).forEach((tunnel) => {
    // Start from a random consensus node
    const startIndex = 5 + Math.floor(Math.random() * 5);
    const parentNode = consensusTunnel.nodes[startIndex];

    // Generate nodes with increasing deviation
    for (let i = 0; i < 15; i++) {
      const deviationGrowth = Math.min(0.05 * i, 0.8); // Max deviation of 0.8
      tunnel.nodes.push({
        id: `${tunnel.id}-${i}`,
        content: `${tunnel.name} point ${i}`,
        timestamp: new Date(
          parentNode.timestamp.getTime() + i * 24 * 60 * 60 * 1000
        ), // One per day after parent
        deviationScore: 0.1 + deviationGrowth + Math.random() * 0.1, // Increasing deviation with some randomness
        strength: 0.3 + Math.random() * 0.6, // 0.3-0.9
        tunnelId: tunnel.id,
        parentId: i === 0 ? parentNode.id : undefined, // Only first node connects to consensus
      });
    }
  });

  return tunnels;
};

// Usage example:
// <RealityTunnelVisualization data={generateSampleData()} width={900} height={600} />
