import React, { useState } from 'react';
// Using the correct import path as defined in tsconfig.base.json
import {
  NarrativeFlow,
  NarrativeBranch,
  NarrativeConnection,
  generateSampleNarrativeFlowData,
} from '@veritas-nx/visualization';

export const NarrativeFlowPage: React.FC = () => {
  const [data, setData] = useState(generateSampleNarrativeFlowData());
  const [timeWindow, setTimeWindow] = useState<
    { start: Date; end: Date } | undefined
  >(undefined);
  const [highlightedBranches, setHighlightedBranches] = useState<string[]>([]);
  const [showLabels, setShowLabels] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [animate, setAnimate] = useState(true);
  const [selectedElement, setSelectedElement] = useState<{
    type: 'branch' | 'connection';
    data: NarrativeBranch | NarrativeConnection;
  } | null>(null);

  // Regenerate data with different parameters
  const regenerateData = () => {
    const startYear = 2018 + Math.floor(Math.random() * 3);
    const endYear = startYear + 2 + Math.floor(Math.random() * 3);
    const numBranches = 3 + Math.floor(Math.random() * 5);

    setData(
      generateSampleNarrativeFlowData(
        new Date(startYear, 0, 1),
        new Date(endYear, 0, 1),
        numBranches
      )
    );

    setHighlightedBranches([]);
    setSelectedElement(null);
  };

  // Handle branch click
  const handleBranchClick = (branch: NarrativeBranch) => {
    setSelectedElement({
      type: 'branch',
      data: branch,
    });

    // Toggle highlight for this branch
    setHighlightedBranches((prev) =>
      prev.includes(branch.id)
        ? prev.filter((id) => id !== branch.id)
        : [...prev, branch.id]
    );
  };

  // Handle connection click
  const handleConnectionClick = (connection: NarrativeConnection) => {
    setSelectedElement({
      type: 'connection',
      data: connection,
    });
  };

  // Set time window to focus on a specific period
  const setFocusTimeWindow = (
    period: 'all' | 'first-half' | 'second-half' | 'middle'
  ) => {
    const { start, end } = data.timeframe;
    const totalDuration = end.getTime() - start.getTime();

    switch (period) {
      case 'all':
        setTimeWindow(undefined);
        break;
      case 'first-half':
        setTimeWindow({
          start,
          end: new Date(start.getTime() + totalDuration / 2),
        });
        break;
      case 'second-half':
        setTimeWindow({
          start: new Date(start.getTime() + totalDuration / 2),
          end,
        });
        break;
      case 'middle':
        setTimeWindow({
          start: new Date(start.getTime() + totalDuration / 4),
          end: new Date(start.getTime() + (totalDuration * 3) / 4),
        });
        break;
    }
  };

  return (
    <div className="narrative-flow-page">
      <h1>Narrative Flow Visualization</h1>
      <p className="description">
        This visualization represents how narratives emerge from, diverge from,
        and sometimes return to consensus reality. The central band represents
        the mainstream consensus, while branches represent alternative
        narratives with varying strength and divergence.
      </p>

      <div className="controls">
        <div className="control-section">
          <h3>Data Controls</h3>
          <button onClick={regenerateData}>Generate New Data</button>
        </div>

        <div className="control-section">
          <h3>Visualization Controls</h3>
          <div className="control-row">
            <label>
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
              />
              Show Labels
            </label>
          </div>
          <div className="control-row">
            <label>
              <input
                type="checkbox"
                checked={showEvents}
                onChange={(e) => setShowEvents(e.target.checked)}
              />
              Show Events
            </label>
          </div>
          <div className="control-row">
            <label>
              <input
                type="checkbox"
                checked={animate}
                onChange={(e) => setAnimate(e.target.checked)}
              />
              Animate
            </label>
          </div>
        </div>

        <div className="control-section">
          <h3>Time Window</h3>
          <div className="control-row">
            <button onClick={() => setFocusTimeWindow('all')}>
              Full Timeline
            </button>
            <button onClick={() => setFocusTimeWindow('first-half')}>
              First Half
            </button>
            <button onClick={() => setFocusTimeWindow('second-half')}>
              Second Half
            </button>
            <button onClick={() => setFocusTimeWindow('middle')}>
              Middle Section
            </button>
          </div>
        </div>
      </div>

      <div className="visualization-container">
        <NarrativeFlow
          data={data}
          width={1000}
          height={600}
          showLabels={showLabels}
          showEvents={showEvents}
          animate={animate}
          timeWindow={timeWindow}
          highlightBranchIds={highlightedBranches}
          onBranchClick={handleBranchClick}
          onConnectionClick={handleConnectionClick}
        />
      </div>

      {selectedElement && (
        <div className="details-panel">
          <h3>
            Selected{' '}
            {selectedElement.type.charAt(0).toUpperCase() +
              selectedElement.type.slice(1)}{' '}
            Details
          </h3>

          {selectedElement.type === 'branch' && (
            <div className="branch-details">
              <h4>{(selectedElement.data as NarrativeBranch).name}</h4>
              <p>{(selectedElement.data as NarrativeBranch).description}</p>
              <div className="metrics">
                <div className="metric">
                  <span className="label">Peak Strength:</span>
                  <span className="value">
                    {(
                      selectedElement.data as NarrativeBranch
                    ).metrics.peakStrength.toFixed(2)}
                  </span>
                </div>
                <div className="metric">
                  <span className="label">Longevity:</span>
                  <span className="value">
                    {
                      (selectedElement.data as NarrativeBranch).metrics
                        .longevity
                    }{' '}
                    days
                  </span>
                </div>
                <div className="metric">
                  <span className="label">Volatility:</span>
                  <span className="value">
                    {(
                      selectedElement.data as NarrativeBranch
                    ).metrics.volatility.toFixed(2)}
                  </span>
                </div>
                <div className="metric">
                  <span className="label">Influence:</span>
                  <span className="value">
                    {(
                      selectedElement.data as NarrativeBranch
                    ).metrics.influence.toFixed(2)}
                  </span>
                </div>
              </div>

              <h5>Key Events</h5>
              <ul className="events-list">
                {(selectedElement.data as NarrativeBranch).events.map(
                  (event: NarrativeBranch['events'][0]) => (
                    <li key={event.id}>
                      <span className="event-date">
                        {event.timestamp.toLocaleDateString()}
                      </span>
                      <span className="event-description">
                        {event.description}
                      </span>
                      <span className="event-impact">
                        Impact: {event.impact.toFixed(2)}
                      </span>
                    </li>
                  )
                )}
              </ul>

              <h5>Sources</h5>
              <ul className="sources-list">
                {(selectedElement.data as NarrativeBranch).sources.map(
                  (source: NarrativeBranch['sources'][0]) => (
                    <li key={source.id}>
                      <span className="source-name">{source.name}</span>
                      <span className="source-weight">
                        Weight: {source.weight.toFixed(2)}
                      </span>
                    </li>
                  )
                )}
              </ul>
            </div>
          )}

          {selectedElement.type === 'connection' && (
            <div className="connection-details">
              <h4>
                {(selectedElement.data as NarrativeConnection).type
                  .charAt(0)
                  .toUpperCase() +
                  (selectedElement.data as NarrativeConnection).type.slice(
                    1
                  )}{' '}
                Connection
              </h4>
              <p>{(selectedElement.data as NarrativeConnection).description}</p>
              <div className="metrics">
                <div className="metric">
                  <span className="label">Timestamp:</span>
                  <span className="value">
                    {(
                      selectedElement.data as NarrativeConnection
                    ).timestamp.toLocaleDateString()}
                  </span>
                </div>
                <div className="metric">
                  <span className="label">Strength:</span>
                  <span className="value">
                    {(
                      selectedElement.data as NarrativeConnection
                    ).strength.toFixed(2)}
                  </span>
                </div>
                <div className="metric">
                  <span className="label">Type:</span>
                  <span className="value">
                    {(selectedElement.data as NarrativeConnection).type}
                  </span>
                </div>
              </div>
            </div>
          )}

          <button onClick={() => setSelectedElement(null)}>Close</button>
        </div>
      )}

      <div className="explanation">
        <h2>About Narrative Flow</h2>
        <p>
          The Narrative Flow visualization represents the dynamic evolution of
          narratives as they emerge from, diverge from, and sometimes return to
          consensus reality. This visualization combines elements of organic
          structures (like mycelium networks or neural pathways) with temporal
          flow to create an intuitive representation of how information and
          beliefs propagate through society.
        </p>

        <h3>Key Elements</h3>
        <ul>
          <li>
            <strong>Consensus Band:</strong> The central flow representing
            mainstream understanding
          </li>
          <li>
            <strong>Narrative Branches:</strong> Diverging perspectives with
            varying strength (thickness) and divergence (distance from center)
          </li>
          <li>
            <strong>Connections:</strong> Relationships between narratives
            (merge, split, influence, conflict)
          </li>
          <li>
            <strong>Events:</strong> Significant moments that impact narrative
            development
          </li>
        </ul>

        <h3>Interaction Guide</h3>
        <ul>
          <li>Click on a narrative branch to highlight it and view details</li>
          <li>Click on a connection to view details about the relationship</li>
          <li>Use the time window controls to focus on specific periods</li>
          <li>Toggle labels and events for different levels of detail</li>
        </ul>
      </div>

      {/* Regular style tag for component styling */}
      <style>
        {`
        .narrative-flow-page {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }

        h1 {
          color: #2d3748;
          margin-bottom: 10px;
        }

        .description {
          color: #4a5568;
          margin-bottom: 30px;
          font-size: 16px;
          line-height: 1.5;
        }

        .controls {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          margin-bottom: 20px;
          padding: 15px;
          background-color: #f7fafc;
          border-radius: 8px;
        }

        .control-section {
          flex: 1;
          min-width: 200px;
        }

        .control-section h3 {
          margin-top: 0;
          margin-bottom: 10px;
          font-size: 16px;
          color: #4a5568;
        }

        .control-row {
          margin-bottom: 10px;
        }

        button {
          background-color: #4299e1;
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 4px;
          cursor: pointer;
          margin-right: 8px;
          font-size: 14px;
        }

        button:hover {
          background-color: #3182ce;
        }

        .visualization-container {
          margin: 20px 0;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
        }

        .details-panel {
          background-color: #f7fafc;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 30px;
        }

        .details-panel h3 {
          margin-top: 0;
          color: #2d3748;
        }

        .details-panel h4 {
          color: #4a5568;
          margin-bottom: 10px;
        }

        .metrics {
          display: flex;
          flex-wrap: wrap;
          gap: 15px;
          margin: 15px 0;
        }

        .metric {
          background-color: white;
          padding: 8px 12px;
          border-radius: 4px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .label {
          font-weight: bold;
          margin-right: 5px;
          color: #4a5568;
        }

        .events-list,
        .sources-list {
          list-style: none;
          padding: 0;
        }

        .events-list li,
        .sources-list li {
          padding: 8px 0;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .event-date,
        .source-name {
          font-weight: bold;
          color: #4a5568;
        }

        .event-impact,
        .source-weight {
          color: #718096;
          margin-left: auto;
        }

        .explanation {
          margin-top: 40px;
          padding: 20px;
          background-color: #f7fafc;
          border-radius: 8px;
        }

        .explanation h2 {
          margin-top: 0;
          color: #2d3748;
        }

        .explanation h3 {
          color: #4a5568;
        }

        .explanation ul {
          padding-left: 20px;
        }

        .explanation li {
          margin-bottom: 8px;
          color: #4a5568;
        }
        `}
      </style>
    </div>
  );
};

export default NarrativeFlowPage;
