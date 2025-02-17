import React, { useState, useCallback } from "react";
import { NetworkGraphVisualization } from "./NetworkGraph";
import { generateTestData } from "../utils/test-data-generator";
import { NetworkNode, NetworkEdge } from "../services/visualization.service";

interface NetworkGraphTestProps {
  width?: number;
  height?: number;
}

export const NetworkGraphTest: React.FC<NetworkGraphTestProps> = ({
  width = 1200,
  height = 800,
}) => {
  const [nodeCount, setNodeCount] = useState(100);
  const [edgeDensity, setEdgeDensity] = useState(0.1);
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<NetworkEdge | null>(null);

  const handleNodeClick = useCallback((node: NetworkNode) => {
    setSelectedNode(node);
    console.log("Node clicked:", node);
  }, []);

  const handleEdgeClick = useCallback((edge: NetworkEdge) => {
    setSelectedEdge(edge);
    console.log("Edge clicked:", edge);
  }, []);

  const handleRegenerateData = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  const testData = generateTestData({
    nodeCount,
    edgeDensity,
    timeframe: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: new Date(),
    },
  });

  return (
    <div className="network-graph-test">
      <div className="controls" style={{ marginBottom: "1rem" }}>
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ marginRight: "1rem" }}>
            Node Count:
            <input
              type="number"
              value={nodeCount}
              onChange={(e) => setNodeCount(Number(e.target.value))}
              min={10}
              max={500}
              style={{ marginLeft: "0.5rem" }}
            />
          </label>
          <label style={{ marginRight: "1rem" }}>
            Edge Density:
            <input
              type="number"
              value={edgeDensity}
              onChange={(e) => setEdgeDensity(Number(e.target.value))}
              min={0.01}
              max={1}
              step={0.01}
              style={{ marginLeft: "0.5rem" }}
            />
          </label>
          <button onClick={handleRegenerateData}>Regenerate Data</button>
        </div>
        <div className="legend" style={{ display: "flex", gap: "1rem" }}>
          <div>
            <strong>Node Types:</strong>
            <div>🔵 Content</div>
            <div>🟢 Source</div>
            <div>🟣 Account</div>
          </div>
          <div>
            <strong>Edge Types:</strong>
            <div>Blue - Published</div>
            <div>Purple - Shared</div>
            <div>Green - Interacted</div>
            <div>Yellow - Referenced</div>
          </div>
        </div>
      </div>

      <div
        className="visualization"
        style={{
          border: "1px solid #ccc",
          borderRadius: "4px",
          overflow: "hidden",
        }}
      >
        <NetworkGraphVisualization
          data={testData}
          width={width}
          height={height}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
        />
      </div>

      {(selectedNode || selectedEdge) && (
        <div className="details" style={{ marginTop: "1rem" }}>
          <h3>Selected Element Details</h3>
          {selectedNode && (
            <div>
              <h4>Node: {selectedNode.label}</h4>
              <pre>
                {JSON.stringify(
                  {
                    type: selectedNode.type,
                    properties: selectedNode.properties,
                    metrics: selectedNode.metrics,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          )}
          {selectedEdge && (
            <div>
              <h4>Edge: {selectedEdge.type}</h4>
              <pre>
                {JSON.stringify(
                  {
                    source: selectedEdge.source,
                    target: selectedEdge.target,
                    properties: selectedEdge.properties,
                    metrics: selectedEdge.metrics,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
