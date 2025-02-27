import React, { useState } from 'react';
import {
  RealityTunnelVisualization,
  generateSampleData as generateRealityTunnelData,
} from './RealityTunnelVisualization';
import {
  TemporalNarrativeVisualization,
  generateSampleData as generateTemporalData,
} from './TemporalNarrativeVisualization';
import './NarrativeVisualizationDemo.css'; // We'll create this CSS file next

const NarrativeVisualizationDemo: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'reality-tunnel' | 'temporal'>(
    'reality-tunnel',
  );
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  // Generate sample data
  const realityTunnelData = generateRealityTunnelData();
  const temporalData = generateTemporalData();

  return (
    <div className="narrative-visualization-demo">
      <div className="demo-header">
        <h1>Narrative Visualization Demo</h1>
        <p>
          This demo showcases two different approaches to visualizing narrative
          evolution and divergence. Toggle between the views to explore
          different aspects of narrative analysis.
        </p>
      </div>

      <div className="tab-navigation">
        <button
          className={activeTab === 'reality-tunnel' ? 'active' : ''}
          onClick={() => setActiveTab('reality-tunnel')}
        >
          Reality Tunnel Visualization
        </button>
        <button
          className={activeTab === 'temporal' ? 'active' : ''}
          onClick={() => setActiveTab('temporal')}
        >
          Temporal Narrative Evolution
        </button>
      </div>

      <div className="visualization-container">
        {activeTab === 'reality-tunnel' && (
          <div className="reality-tunnel-container">
            <div className="visualization-description">
              <h2>Reality Tunnel Visualization</h2>
              <p>
                This visualization shows how different belief systems or
                "reality tunnels" form and diverge from consensus reality. The
                central horizontal line represents consensus reality, while
                branches show divergent narratives. Distance from the center
                line indicates deviation magnitude from consensus.
              </p>
              <p>
                <strong>Interactions:</strong> Click on a tunnel to focus on it,
                click on nodes to see details, use the legend to filter.
              </p>
            </div>
            <RealityTunnelVisualization
              data={realityTunnelData}
              width={1000}
              height={600}
              onNodeClick={(node) => setSelectedNode(node)}
            />
            {selectedNode && (
              <div className="detail-panel">
                <h3>Selected Node Details</h3>
                <p>
                  <strong>Content:</strong> {selectedNode.content}
                </p>
                <p>
                  <strong>Timestamp:</strong>{' '}
                  {selectedNode.timestamp.toLocaleString()}
                </p>
                <p>
                  <strong>Deviation Score:</strong>{' '}
                  {selectedNode.deviationScore.toFixed(2)}
                </p>
                <p>
                  <strong>Strength:</strong> {selectedNode.strength.toFixed(2)}
                </p>
                <button onClick={() => setSelectedNode(null)}>Close</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'temporal' && (
          <div className="temporal-container">
            <div className="visualization-description">
              <h2>Temporal Narrative Evolution</h2>
              <p>
                This visualization shows how narratives evolve over time, with
                strength/reach on the vertical axis and time on the horizontal
                axis. Colored areas represent different narratives, with circles
                marking significant events. Vertical dashed lines indicate
                external events that affected multiple narratives.
              </p>
              <p>
                <strong>Interactions:</strong> Click on a stream to focus on it,
                click on events to see details, use the legend to filter.
              </p>
            </div>
            <TemporalNarrativeVisualization
              data={temporalData}
              width={1000}
              height={600}
              onEventClick={(event) => setSelectedEvent(event)}
            />
            {selectedEvent && (
              <div className="detail-panel">
                <h3>Selected Event Details</h3>
                <p>
                  <strong>Content:</strong> {selectedEvent.content}
                </p>
                <p>
                  <strong>Timestamp:</strong>{' '}
                  {selectedEvent.timestamp.toLocaleString()}
                </p>
                <p>
                  <strong>Impact:</strong> {selectedEvent.impact.toFixed(2)}
                </p>
                <button onClick={() => setSelectedEvent(null)}>Close</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="demo-footer">
        <h3>Next Steps for Visualization Development</h3>
        <ul>
          <li>Integrate with real data from the Veritas backend</li>
          <li>Add more interactive filtering capabilities</li>
          <li>Implement comparison views for multiple narratives</li>
          <li>Add time controls for animation through temporal data</li>
          <li>
            Develop 3D visualization options for more complex relationships
          </li>
          <li>Create annotation tools for collaborative analysis</li>
        </ul>
      </div>
    </div>
  );
};

export default NarrativeVisualizationDemo;
