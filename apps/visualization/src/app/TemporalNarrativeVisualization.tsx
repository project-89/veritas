import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import {
  NarrativeNode,
  NarrativeLink,
  NarrativeData,
} from "@veritas/visualization/shared";

interface NarrativeEvent {
  id: string;
  timestamp: Date;
  content: string;
  impact: number; // 0-1, significance of this event
}

interface NarrativeStream {
  id: string;
  name: string;
  color: string;
  strength: number[]; // Array of strength values over time
  events: NarrativeEvent[]; // Key events in this narrative
  relatedStreams?: string[]; // IDs of related narrative streams
}

interface TemporalData {
  timePoints: Date[]; // Array of time points for the x-axis
  streams: NarrativeStream[]; // Array of narrative streams
  externalEvents?: NarrativeEvent[]; // Optional external events that affected narratives
}

interface TemporalNarrativeVisualizationProps {
  data: TemporalData;
  width?: number;
  height?: number;
  onStreamClick?: (streamId: string) => void;
  onEventClick?: (event: NarrativeEvent) => void;
}

export const TemporalNarrativeVisualization: React.FC<
  TemporalNarrativeVisualizationProps
> = ({ data, width = 900, height = 600, onStreamClick, onEventClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedStream, setSelectedStream] = useState<string | null>(null);

  useEffect(() => {
    if (!svgRef.current || !data || !data.timePoints.length) return;

    // Clear previous visualization
    d3.select(svgRef.current).selectAll("*").remove();

    // Create SVG container
    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    // Define margins
    const margin = { top: 40, right: 80, bottom: 60, left: 50 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Create container group
    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // Setup scales
    const timeScale = d3
      .scaleTime()
      .domain([data.timePoints[0], data.timePoints[data.timePoints.length - 1]])
      .range([0, innerWidth]);

    const strengthScale = d3
      .scaleLinear()
      .domain([0, 1])
      .range([innerHeight, 0]);

    // Create axes
    const xAxis = d3.axisBottom(timeScale);
    const yAxis = d3.axisLeft(strengthScale);

    // Add X axis
    g.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0, ${innerHeight})`)
      .call(xAxis)
      .append("text")
      .attr("fill", "#000")
      .attr("x", innerWidth / 2)
      .attr("y", 40)
      .attr("text-anchor", "middle")
      .text("Time");

    // Add Y axis
    g.append("g")
      .attr("class", "y-axis")
      .call(yAxis)
      .append("text")
      .attr("fill", "#000")
      .attr("transform", "rotate(-90)")
      .attr("y", -40)
      .attr("x", -innerHeight / 2)
      .attr("text-anchor", "middle")
      .text("Narrative Strength");

    // Create area generator
    const areaGenerator = d3
      .area<number>()
      .x((d, i) => timeScale(data.timePoints[i]))
      .y0(innerHeight)
      .y1((d) => strengthScale(d))
      .curve(d3.curveBasis);

    // Draw streams
    data.streams.forEach((stream) => {
      // Skip if a stream is selected and this isn't it
      if (selectedStream && selectedStream !== stream.id) {
        return;
      }

      // Draw stream area
      g.append("path")
        .datum(stream.strength)
        .attr("d", areaGenerator)
        .attr("fill", stream.color)
        .attr("fill-opacity", selectedStream === stream.id ? 0.8 : 0.5)
        .attr("stroke", stream.color)
        .attr("stroke-width", 1)
        .attr("cursor", "pointer")
        .on("click", () => {
          setSelectedStream(selectedStream === stream.id ? null : stream.id);
          if (onStreamClick) onStreamClick(stream.id);
        });

      // Draw stream events
      g.selectAll(`.event-${stream.id}`)
        .data(stream.events)
        .enter()
        .append("circle")
        .attr("class", `event-${stream.id}`)
        .attr("cx", (d) => timeScale(d.timestamp))
        .attr("cy", (d) => {
          // Find the closest time point
          const timeIndex = data.timePoints.findIndex(
            (t) => t.getTime() >= d.timestamp.getTime()
          );
          const strength = stream.strength[timeIndex >= 0 ? timeIndex : 0];
          return strengthScale(strength);
        })
        .attr("r", (d) => 3 + d.impact * 5) // Size based on impact
        .attr("fill", stream.color)
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .attr("cursor", "pointer")
        .on("click", (event, d) => {
          event.stopPropagation();
          if (onEventClick) onEventClick(d);
        })
        .append("title")
        .text((d) => d.content);
    });

    // Draw external events if they exist
    if (data.externalEvents && data.externalEvents.length > 0) {
      // Add event lines
      g.selectAll(".external-event-line")
        .data(data.externalEvents)
        .enter()
        .append("line")
        .attr("class", "external-event-line")
        .attr("x1", (d) => timeScale(d.timestamp))
        .attr("y1", 0)
        .attr("x2", (d) => timeScale(d.timestamp))
        .attr("y2", innerHeight)
        .attr("stroke", "#888")
        .attr("stroke-width", (d) => 1 + d.impact)
        .attr("stroke-dasharray", "3,3")
        .attr("opacity", 0.7);

      // Add event labels
      g.selectAll(".external-event-label")
        .data(data.externalEvents)
        .enter()
        .append("text")
        .attr("class", "external-event-label")
        .attr("x", (d) => timeScale(d.timestamp))
        .attr("y", 10)
        .attr("text-anchor", "middle")
        .attr("font-size", "10px")
        .attr("transform", (d) => `rotate(-45, ${timeScale(d.timestamp)}, 10)`)
        .text((d) =>
          d.content.length > 20 ? d.content.substring(0, 20) + "..." : d.content
        )
        .append("title")
        .text((d) => d.content);
    }

    // Add legend
    const legend = svg
      .append("g")
      .attr(
        "transform",
        `translate(${width - margin.right + 20}, ${margin.top})`
      );

    data.streams.forEach((stream, i) => {
      legend
        .append("rect")
        .attr("x", 0)
        .attr("y", i * 20)
        .attr("width", 15)
        .attr("height", 15)
        .attr("fill", stream.color)
        .attr("cursor", "pointer")
        .on("click", () => {
          setSelectedStream(selectedStream === stream.id ? null : stream.id);
          if (onStreamClick) onStreamClick(stream.id);
        });

      legend
        .append("text")
        .attr("x", 20)
        .attr("y", i * 20 + 12)
        .text(stream.name)
        .attr("font-size", "12px")
        .attr("cursor", "pointer")
        .on("click", () => {
          setSelectedStream(selectedStream === stream.id ? null : stream.id);
          if (onStreamClick) onStreamClick(stream.id);
        });
    });

    // Add reset button
    legend
      .append("text")
      .attr("x", 0)
      .attr("y", data.streams.length * 20 + 20)
      .text("Reset View")
      .attr("font-size", "12px")
      .attr("cursor", "pointer")
      .attr("fill", "blue")
      .attr("text-decoration", "underline")
      .on("click", () => {
        setSelectedStream(null);
      });
  }, [data, width, height, selectedStream, onStreamClick, onEventClick]);

  return (
    <div className="temporal-narrative-visualization">
      <h3>Temporal Narrative Evolution</h3>
      <div className="visualization-container">
        <svg ref={svgRef} />
      </div>
      {selectedStream && (
        <div className="stream-details">
          <h4>
            Selected Narrative:{" "}
            {data.streams.find((s) => s.id === selectedStream)?.name}
          </h4>
          <button onClick={() => setSelectedStream(null)}>
            Clear Selection
          </button>
        </div>
      )}
    </div>
  );
};

// Sample data generator for testing
export const generateSampleData = (): TemporalData => {
  const now = new Date();
  const timePoints: Date[] = [];

  // Generate 30 days of data points
  for (let i = 0; i < 30; i++) {
    timePoints.push(new Date(now.getTime() - (30 - i) * 24 * 60 * 60 * 1000));
  }

  // Create narrative streams
  const streams: NarrativeStream[] = [
    {
      id: "narrative-1",
      name: "Main Narrative",
      color: "#4299E1",
      strength: [],
      events: [],
    },
    {
      id: "narrative-2",
      name: "Counter Narrative",
      color: "#F56565",
      strength: [],
      events: [],
    },
    {
      id: "narrative-3",
      name: "Emerging Perspective",
      color: "#48BB78",
      strength: [],
      events: [],
      relatedStreams: ["narrative-1"],
    },
  ];

  // Generate strength values for each stream
  streams.forEach((stream) => {
    let currentStrength = 0.2 + Math.random() * 0.3; // Start between 0.2-0.5

    for (let i = 0; i < timePoints.length; i++) {
      // Add some randomness to the strength
      const change = (Math.random() - 0.5) * 0.1;

      // Special patterns for each narrative
      if (stream.id === "narrative-1") {
        // Main narrative grows steadily
        currentStrength = Math.min(0.9, currentStrength + 0.01 + change);
      } else if (stream.id === "narrative-2") {
        // Counter narrative spikes in the middle then declines
        if (i > 10 && i < 20) {
          currentStrength = Math.min(0.8, currentStrength + 0.03 + change);
        } else {
          currentStrength = Math.max(0.1, currentStrength - 0.01 + change);
        }
      } else if (stream.id === "narrative-3") {
        // Emerging narrative starts later and grows rapidly
        if (i < 15) {
          currentStrength = Math.max(
            0.05,
            Math.min(0.2, currentStrength + change)
          );
        } else {
          currentStrength = Math.min(0.7, currentStrength + 0.04 + change);
        }
      }

      stream.strength.push(currentStrength);
    }
  });

  // Add some key events to each narrative
  streams[0].events = [
    {
      id: "event-1-1",
      timestamp: timePoints[5],
      content: "Initial coverage in mainstream media",
      impact: 0.6,
    },
    {
      id: "event-1-2",
      timestamp: timePoints[15],
      content: "Official statement released",
      impact: 0.8,
    },
    {
      id: "event-1-3",
      timestamp: timePoints[25],
      content: "Follow-up investigation published",
      impact: 0.7,
    },
  ];

  streams[1].events = [
    {
      id: "event-2-1",
      timestamp: timePoints[12],
      content: "Alternative theory gains traction",
      impact: 0.5,
    },
    {
      id: "event-2-2",
      timestamp: timePoints[18],
      content: "Viral social media post challenges mainstream view",
      impact: 0.9,
    },
  ];

  streams[2].events = [
    {
      id: "event-3-1",
      timestamp: timePoints[16],
      content: "New evidence emerges",
      impact: 0.4,
    },
    {
      id: "event-3-2",
      timestamp: timePoints[23],
      content: "Academic paper published supporting this view",
      impact: 0.7,
    },
  ];

  // Add some external events that affected all narratives
  const externalEvents: NarrativeEvent[] = [
    {
      id: "external-1",
      timestamp: timePoints[10],
      content: "Major related news event",
      impact: 0.9,
    },
    {
      id: "external-2",
      timestamp: timePoints[20],
      content: "Government policy announcement",
      impact: 0.7,
    },
  ];

  return {
    timePoints,
    streams,
    externalEvents,
  };
};

// Usage example:
// <TemporalNarrativeVisualization data={generateSampleData()} width={900} height={600} />
