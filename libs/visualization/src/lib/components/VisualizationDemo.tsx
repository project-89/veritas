import React, { useState, CSSProperties } from 'react';
import {
  NarrativeMyceliumVisualization,
  generateMyceliumData,
  NarrativeLandscapeVisualization,
  generateLandscapeData,
  EnhancedRealityTunnelVisualization,
  generateEnhancedTunnelData,
  RealityTunnelVisualization,
  generateRealityTunnelData,
  TemporalNarrativeVisualization,
  generateTemporalData,
} from './';
import { NarrativeFlow } from '../components/NarrativeFlow';
import { generateSampleNarrativeFlowData } from '../data/sample-narrative-flow';

type VisualizationType =
  | 'mycelium'
  | 'landscape'
  | 'enhancedTunnel'
  | 'realityTunnel'
  | 'temporal'
  | 'narrativeFlow';

// Define styles as React CSSProperties objects
const styles: Record<string, CSSProperties> = {
  visualizationDemo: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
  },
  visualizationControls: {
    marginBottom: '20px',
  },
  vizSelector: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
  },
  button: {
    padding: '8px 16px',
    backgroundColor: '#f0f0f0',
    border: '1px solid #ccc',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s ease',
  },
  buttonHover: {
    backgroundColor: '#e0e0e0',
  },
  buttonActive: {
    backgroundColor: '#4285F4',
    color: 'white',
    borderColor: '#2b6abc',
  },
  visualizationContainer: {
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '20px',
    backgroundColor: '#f9f9f9',
  },
  visualizationWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  heading: {
    marginTop: 0,
    marginBottom: '10px',
  },
  paragraph: {
    marginBottom: '20px',
    textAlign: 'center' as const,
    maxWidth: '800px',
    color: '#555',
  },
};

export const VisualizationDemo: React.FC = () => {
  const [activeViz, setActiveViz] = useState<VisualizationType>('mycelium');

  // Generate sample data for each visualization type
  const myceliumData = generateMyceliumData();
  const landscapeData = generateLandscapeData();
  const enhancedTunnelData = generateEnhancedTunnelData();
  const realityTunnelData = generateRealityTunnelData();
  const temporalData = generateTemporalData();
  const narrativeFlowData = generateSampleNarrativeFlowData();

  // Handle visualization selection
  const handleVizChange = (vizType: VisualizationType) => {
    setActiveViz(vizType);
  };

  // Get button style based on active state
  const getButtonStyle = (vizType: VisualizationType): CSSProperties => {
    return activeViz === vizType
      ? { ...styles.button, ...styles.buttonActive }
      : styles.button;
  };

  return (
    <div style={styles.visualizationDemo}>
      <div style={styles.visualizationControls}>
        <h2>Narrative Visualization Demo</h2>
        <div style={styles.vizSelector}>
          <button
            style={getButtonStyle('mycelium')}
            onClick={() => handleVizChange('mycelium')}
          >
            Narrative Mycelium
          </button>
          <button
            style={getButtonStyle('landscape')}
            onClick={() => handleVizChange('landscape')}
          >
            Narrative Landscape
          </button>
          <button
            style={getButtonStyle('enhancedTunnel')}
            onClick={() => handleVizChange('enhancedTunnel')}
          >
            Enhanced Reality Tunnel
          </button>
          <button
            style={getButtonStyle('realityTunnel')}
            onClick={() => handleVizChange('realityTunnel')}
          >
            Reality Tunnel
          </button>
          <button
            style={getButtonStyle('temporal')}
            onClick={() => handleVizChange('temporal')}
          >
            Temporal Narrative
          </button>
          <button
            style={getButtonStyle('narrativeFlow')}
            onClick={() => handleVizChange('narrativeFlow')}
          >
            Narrative Flow
          </button>
        </div>
      </div>

      <div style={styles.visualizationContainer}>
        {activeViz === 'mycelium' && (
          <div style={styles.visualizationWrapper}>
            <h3 style={styles.heading}>Narrative Mycelium Visualization</h3>
            <p style={styles.paragraph}>
              Visualizes narratives as an organic, interconnected mycelium-like
              network. Nodes represent narrative elements, with connections
              showing relationships. Clusters indicate related narrative groups.
            </p>
            <NarrativeMyceliumVisualization
              data={myceliumData}
              width={1000}
              height={600}
              showLabels={true}
              animate={true}
            />
          </div>
        )}

        {activeViz === 'landscape' && (
          <div style={styles.visualizationWrapper}>
            <h3 style={styles.heading}>Narrative Landscape Visualization</h3>
            <p style={styles.paragraph}>
              Represents narratives as a topographical landscape where elevation
              indicates narrative strength. Peaks show dominant narratives,
              valleys show weak areas, and paths trace narrative evolution.
            </p>
            <NarrativeLandscapeVisualization
              data={landscapeData}
              width={1000}
              height={600}
              perspective={0.5}
              lightAngle={315}
              exaggeration={1.5}
            />
          </div>
        )}

        {activeViz === 'enhancedTunnel' && (
          <div style={styles.visualizationWrapper}>
            <h3 style={styles.heading}>
              Enhanced Reality Tunnel Visualization
            </h3>
            <p style={styles.paragraph}>
              An advanced 3D visualization of the reality tunnel concept,
              showing how narratives branch and evolve over time. The main path
              represents consensus reality, with branches showing alternative
              narratives.
            </p>
            <EnhancedRealityTunnelVisualization
              data={enhancedTunnelData}
              width={1000}
              height={600}
              depth={200}
              perspective={0.7}
              showLabels={true}
              interactive={true}
              highlightConsensus={true}
            />
          </div>
        )}

        {activeViz === 'realityTunnel' && (
          <div style={styles.visualizationWrapper}>
            <h3 style={styles.heading}>Reality Tunnel Visualization</h3>
            <p style={styles.paragraph}>
              The original reality tunnel visualization, showing how narratives
              form a tunnel of perception through which we view events.
            </p>
            <RealityTunnelVisualization
              data={realityTunnelData}
              width={1000}
              height={600}
            />
          </div>
        )}

        {activeViz === 'temporal' && (
          <div style={styles.visualizationWrapper}>
            <h3 style={styles.heading}>Temporal Narrative Visualization</h3>
            <p style={styles.paragraph}>
              Visualizes how narratives evolve and interact over time, showing
              strength and relationships across a timeline.
            </p>
            <TemporalNarrativeVisualization
              data={temporalData}
              width={1000}
              height={600}
            />
          </div>
        )}

        {activeViz === 'narrativeFlow' && (
          <div style={styles.visualizationWrapper}>
            <h3 style={styles.heading}>Narrative Flow Visualization</h3>
            <p style={styles.paragraph}>
              Represents how narratives emerge from, diverge from, and sometimes
              return to consensus reality. The central band represents
              mainstream consensus, while branches represent alternative
              narratives with varying strength and divergence.
            </p>
            <NarrativeFlow
              data={narrativeFlowData}
              width={1000}
              height={600}
              showLabels={true}
              showEvents={true}
              animate={true}
              interactive={true}
            />
          </div>
        )}
      </div>
    </div>
  );
};
