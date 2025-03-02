import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import {
  NarrativeFlowVisualizationProps,
  NarrativeBranch,
  NarrativeConnection,
} from '../types/narrative-flow-types';

export const NarrativeFlow: React.FC<NarrativeFlowVisualizationProps> = ({
  data,
  width = 1200,
  height = 800,
  showLabels = true,
  showEvents = true,
  animate = true,
  timeWindow,
  highlightBranchIds = [],
  colorScheme,
  interactive = true,
  onBranchClick,
  onConnectionClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredElement, setHoveredElement] = useState<{
    type: 'branch' | 'connection' | 'consensus';
    id: string;
  } | null>(null);

  // Calculate the effective time window
  const effectiveTimeWindow = timeWindow || data.timeframe;

  useEffect(() => {
    if (!svgRef.current || !data) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous rendering

    // Create main container with margins
    const margin = { top: 40, right: 40, bottom: 60, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const container = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const xScale = d3
      .scaleTime()
      .domain([effectiveTimeWindow.start, effectiveTimeWindow.end])
      .range([0, innerWidth]);

    const yScale = d3
      .scaleLinear()
      .domain([-1, 1]) // -1 to 1 for divergence (negative values below consensus, positive above)
      .range([innerHeight, 0]);

    const strengthScale = d3
      .scaleLinear()
      .domain([0, 1]) // Strength from 0 to 1
      .range([2, 30]); // Min and max thickness

    // Create axes
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3
      .axisLeft(yScale)
      .tickFormat((d) =>
        Math.abs(Number(d)) === 1
          ? 'Max Divergence'
          : Number(d) === 0
          ? 'Consensus'
          : ''
      );

    container
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight / 2})`) // Place at the middle for consensus
      .call(xAxis);

    container.append('g').attr('class', 'y-axis').call(yAxis);

    // Add axis labels
    container
      .append('text')
      .attr('class', 'x-axis-label')
      .attr('text-anchor', 'middle')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + margin.bottom - 10)
      .text('Time');

    container
      .append('text')
      .attr('class', 'y-axis-label')
      .attr(
        'transform',
        `translate(${-margin.left + 20},${innerHeight / 2}) rotate(-90)`
      )
      .text('Divergence from Consensus');

    // Create a line generator for the consensus band
    const consensusLine = d3
      .line<[Date, number]>()
      .x((d) => xScale(d[0]))
      .y((d) => yScale(0)) // Consensus is always at y=0
      .curve(d3.curveBasis);

    // Create area generator for the consensus band
    const consensusArea = d3
      .area<[Date, number]>()
      .x((d) => xScale(d[0]))
      .y0((d) => yScale(0) - strengthScale(d[1]) / 2)
      .y1((d) => yScale(0) + strengthScale(d[1]) / 2)
      .curve(d3.curveBasis);

    // Prepare consensus data points
    const consensusPoints: [Date, number][] = data.consensus.timePoints.map(
      (time, i) => [time, data.consensus.strengthValues[i]]
    );

    // Draw consensus band
    container
      .append('path')
      .datum(consensusPoints)
      .attr('class', 'consensus-area')
      .attr('d', consensusArea)
      .attr('fill', data.consensus.color || '#888')
      .attr('opacity', 0.7)
      .on('mouseover', function (event) {
        if (interactive) {
          setHoveredElement({ type: 'consensus', id: data.consensus.id });
          d3.select(this).attr('opacity', 0.9);
        }
      })
      .on('mouseout', function (event) {
        if (interactive) {
          setHoveredElement(null);
          d3.select(this).attr('opacity', 0.7);
        }
      });

    // Function to generate path for a narrative branch
    const generateBranchPath = (branch: NarrativeBranch) => {
      const branchPoints: [Date, number, number][] = branch.timePoints.map(
        (time, i) => [
          time,
          branch.strengthValues[i],
          branch.divergenceValues[i],
        ]
      );

      // Create a line generator for this branch
      const branchLine = d3
        .line<[Date, number, number]>()
        .x((d) => xScale(d[0]))
        .y((d) => yScale(d[2])) // Use divergence for y position
        .curve(d3.curveBasis);

      // Create area generator for this branch
      const branchArea = d3
        .area<[Date, number, number]>()
        .x((d) => xScale(d[0]))
        .y0((d) => yScale(d[2]) - strengthScale(d[1]) / 2)
        .y1((d) => yScale(d[2]) + strengthScale(d[1]) / 2)
        .curve(d3.curveBasis);

      return {
        line: branchLine(branchPoints),
        area: branchArea(branchPoints),
      };
    };

    // Draw narrative branches
    data.branches.forEach((branch) => {
      const paths = generateBranchPath(branch);

      const isHighlighted = highlightBranchIds.includes(branch.id);

      container
        .append('path')
        .attr('class', `branch-area branch-${branch.id}`)
        .attr('d', paths.area)
        .attr('fill', branch.color || '#5a67d8')
        .attr('opacity', isHighlighted ? 0.9 : 0.6)
        .on('mouseover', function (event) {
          if (interactive) {
            setHoveredElement({ type: 'branch', id: branch.id });
            d3.select(this).attr('opacity', 0.9);
          }
        })
        .on('mouseout', function (event) {
          if (interactive) {
            setHoveredElement(null);
            d3.select(this).attr('opacity', isHighlighted ? 0.9 : 0.6);
          }
        })
        .on('click', function (event) {
          if (interactive && onBranchClick) {
            onBranchClick(branch);
          }
        });

      // Add labels if enabled
      if (showLabels) {
        // Find the point with maximum strength for label placement
        let maxStrengthIndex = 0;
        let maxStrength = 0;

        branch.strengthValues.forEach((strength, i) => {
          if (strength > maxStrength) {
            maxStrength = strength;
            maxStrengthIndex = i;
          }
        });

        const labelX = xScale(branch.timePoints[maxStrengthIndex]);
        const labelY = yScale(branch.divergenceValues[maxStrengthIndex]);

        container
          .append('text')
          .attr('class', `branch-label branch-label-${branch.id}`)
          .attr('x', labelX)
          .attr('y', labelY)
          .attr('dy', '-0.5em')
          .attr('text-anchor', 'middle')
          .attr('font-size', '12px')
          .attr('fill', '#333')
          .text(branch.name)
          .attr('opacity', isHighlighted ? 1 : 0.8);
      }

      // Add event markers if enabled
      if (showEvents && branch.events && branch.events.length > 0) {
        branch.events.forEach((event) => {
          // Find the closest time point to this event
          const closestTimeIndex = branch.timePoints.reduce(
            (closest, time, index) => {
              const currentDiff = Math.abs(
                time.getTime() - event.timestamp.getTime()
              );
              const closestDiff = Math.abs(
                branch.timePoints[closest].getTime() - event.timestamp.getTime()
              );
              return currentDiff < closestDiff ? index : closest;
            },
            0
          );

          const eventX = xScale(event.timestamp);
          const eventY = yScale(branch.divergenceValues[closestTimeIndex]);

          container
            .append('circle')
            .attr('class', `event-marker event-${event.id}`)
            .attr('cx', eventX)
            .attr('cy', eventY)
            .attr('r', 5 + event.impact * 3) // Size based on impact
            .attr('fill', '#f56565')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1)
            .attr('opacity', 0.8)
            .on('mouseover', function (event) {
              if (interactive) {
                d3.select(this)
                  .attr('opacity', 1)
                  .attr('r', 7 + event.impact * 3);

                // Show tooltip
                const tooltip = container
                  .append('g')
                  .attr('class', 'tooltip')
                  .attr(
                    'transform',
                    `translate(${eventX + 10},${eventY - 10})`
                  );

                tooltip
                  .append('rect')
                  .attr('width', 200)
                  .attr('height', 60)
                  .attr('fill', 'white')
                  .attr('stroke', '#ccc')
                  .attr('rx', 5);

                tooltip
                  .append('text')
                  .attr('x', 10)
                  .attr('y', 20)
                  .attr('font-weight', 'bold')
                  .text(new Date(event.timestamp).toLocaleDateString());

                tooltip
                  .append('text')
                  .attr('x', 10)
                  .attr('y', 40)
                  .text(
                    event.description.substring(0, 30) +
                      (event.description.length > 30 ? '...' : '')
                  );
              }
            })
            .on('mouseout', function (event) {
              if (interactive) {
                d3.select(this)
                  .attr('opacity', 0.8)
                  .attr('r', 5 + event.impact * 3);

                container.select('.tooltip').remove();
              }
            });
        });
      }
    });

    // Draw connections between narratives
    data.connections.forEach((connection) => {
      // Find the source and target branches
      const sourceBranch = data.branches.find(
        (b) => b.id === connection.sourceId
      );
      const targetBranch = data.branches.find(
        (b) => b.id === connection.targetId
      );

      if (!sourceBranch || !targetBranch) return;

      // Find the closest time points to the connection timestamp
      const sourceTimeIndex = sourceBranch.timePoints.reduce(
        (closest, time, index) => {
          const currentDiff = Math.abs(
            time.getTime() - connection.timestamp.getTime()
          );
          const closestDiff = Math.abs(
            sourceBranch.timePoints[closest].getTime() -
              connection.timestamp.getTime()
          );
          return currentDiff < closestDiff ? index : closest;
        },
        0
      );

      const targetTimeIndex = targetBranch.timePoints.reduce(
        (closest, time, index) => {
          const currentDiff = Math.abs(
            time.getTime() - connection.timestamp.getTime()
          );
          const closestDiff = Math.abs(
            targetBranch.timePoints[closest].getTime() -
              connection.timestamp.getTime()
          );
          return currentDiff < closestDiff ? index : closest;
        },
        0
      );

      const sourceX = xScale(connection.timestamp);
      const sourceY = yScale(sourceBranch.divergenceValues[sourceTimeIndex]);
      const targetX = xScale(connection.timestamp);
      const targetY = yScale(targetBranch.divergenceValues[targetTimeIndex]);

      // Draw connection line
      container
        .append('line')
        .attr('class', `connection connection-${connection.id}`)
        .attr('x1', sourceX)
        .attr('y1', sourceY)
        .attr('x2', targetX)
        .attr('y2', targetY)
        .attr(
          'stroke',
          connection.type === 'conflict'
            ? '#e53e3e'
            : connection.type === 'merge'
            ? '#38a169'
            : connection.type === 'split'
            ? '#d69e2e'
            : '#4299e1'
        )
        .attr('stroke-width', connection.strength * 5)
        .attr('stroke-dasharray', connection.type === 'influence' ? '5,5' : '0')
        .attr('opacity', 0.7)
        .on('mouseover', function (event) {
          if (interactive) {
            setHoveredElement({ type: 'connection', id: connection.id });
            d3.select(this)
              .attr('opacity', 1)
              .attr('stroke-width', connection.strength * 7);
          }
        })
        .on('mouseout', function (event) {
          if (interactive) {
            setHoveredElement(null);
            d3.select(this)
              .attr('opacity', 0.7)
              .attr('stroke-width', connection.strength * 5);
          }
        })
        .on('click', function (event) {
          if (interactive && onConnectionClick) {
            onConnectionClick(connection);
          }
        });
    });

    // Add legend
    const legend = container
      .append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${innerWidth - 200}, 20)`);

    legend
      .append('rect')
      .attr('width', 180)
      .attr('height', 120)
      .attr('fill', 'white')
      .attr('stroke', '#ccc')
      .attr('rx', 5);

    legend
      .append('text')
      .attr('x', 10)
      .attr('y', 20)
      .attr('font-weight', 'bold')
      .text('Legend');

    // Consensus legend item
    legend
      .append('rect')
      .attr('x', 10)
      .attr('y', 35)
      .attr('width', 20)
      .attr('height', 10)
      .attr('fill', data.consensus.color || '#888')
      .attr('opacity', 0.7);

    legend.append('text').attr('x', 40).attr('y', 45).text('Consensus');

    // Connection types
    const connectionTypes = [
      { type: 'merge', color: '#38a169', label: 'Merge' },
      { type: 'split', color: '#d69e2e', label: 'Split' },
      { type: 'influence', color: '#4299e1', label: 'Influence' },
      { type: 'conflict', color: '#e53e3e', label: 'Conflict' },
    ];

    connectionTypes.forEach((conn, i) => {
      legend
        .append('line')
        .attr('x1', 10)
        .attr('y1', 60 + i * 15)
        .attr('x2', 30)
        .attr('y2', 60 + i * 15)
        .attr('stroke', conn.color)
        .attr('stroke-width', 3)
        .attr('stroke-dasharray', conn.type === 'influence' ? '5,5' : '0');

      legend
        .append('text')
        .attr('x', 40)
        .attr('y', 65 + i * 15)
        .text(conn.label);
    });

    // Add animation if enabled
    if (animate) {
      // Initial state: all branches and connections invisible
      svg.selectAll('.branch-area').attr('opacity', 0);

      svg.selectAll('.connection').attr('opacity', 0);

      // Animate consensus band first
      svg
        .select('.consensus-area')
        .attr('opacity', 0)
        .transition()
        .duration(1000)
        .attr('opacity', 0.7);

      // Then animate branches
      svg
        .selectAll('.branch-area')
        .transition()
        .delay((_, i) => 1000 + i * 200)
        .duration(1000)
        .attr('opacity', function () {
          const branchClass = d3.select(this).attr('class');
          const branchId = branchClass.split('branch-')[1];
          return highlightBranchIds.includes(branchId) ? 0.9 : 0.6;
        });

      // Then animate connections
      svg
        .selectAll('.connection')
        .transition()
        .delay((_, i) => 2000 + i * 200)
        .duration(500)
        .attr('opacity', 0.7);
    }
  }, [
    data,
    width,
    height,
    showLabels,
    showEvents,
    animate,
    timeWindow,
    highlightBranchIds,
    colorScheme,
    interactive,
  ]);

  // Render tooltip for hovered element
  const renderTooltip = () => {
    if (!hoveredElement || !data) return null;

    let tooltipContent = null;

    if (hoveredElement.type === 'consensus') {
      tooltipContent = (
        <div>
          <h3>{data.consensus.name}</h3>
          <p>{data.consensus.description}</p>
          <div>
            <strong>Stability:</strong>{' '}
            {data.consensus.metrics.stability.toFixed(2)}
          </div>
          <div>
            <strong>Confidence:</strong>{' '}
            {data.consensus.metrics.confidence.toFixed(2)}
          </div>
          <div>
            <strong>Diversity:</strong>{' '}
            {data.consensus.metrics.diversity.toFixed(2)}
          </div>
        </div>
      );
    } else if (hoveredElement.type === 'branch') {
      const branch = data.branches.find((b) => b.id === hoveredElement.id);
      if (branch) {
        tooltipContent = (
          <div>
            <h3>{branch.name}</h3>
            <p>{branch.description}</p>
            <div>
              <strong>Emerged:</strong>{' '}
              {branch.emergencePoint.toLocaleDateString()}
            </div>
            {branch.terminationPoint && (
              <div>
                <strong>Ended:</strong>{' '}
                {branch.terminationPoint.toLocaleDateString()}
              </div>
            )}
            <div>
              <strong>Peak Strength:</strong>{' '}
              {branch.metrics.peakStrength.toFixed(2)}
            </div>
            <div>
              <strong>Longevity:</strong> {branch.metrics.longevity} days
            </div>
          </div>
        );
      }
    } else if (hoveredElement.type === 'connection') {
      const connection = data.connections.find(
        (c) => c.id === hoveredElement.id
      );
      if (connection) {
        const sourceBranch = data.branches.find(
          (b) => b.id === connection.sourceId
        );
        const targetBranch = data.branches.find(
          (b) => b.id === connection.targetId
        );

        tooltipContent = (
          <div>
            <h3>
              {connection.type.charAt(0).toUpperCase() +
                connection.type.slice(1)}{' '}
              Connection
            </h3>
            <p>{connection.description}</p>
            <div>
              <strong>From:</strong> {sourceBranch?.name || 'Unknown'}
            </div>
            <div>
              <strong>To:</strong> {targetBranch?.name || 'Unknown'}
            </div>
            <div>
              <strong>When:</strong> {connection.timestamp.toLocaleDateString()}
            </div>
            <div>
              <strong>Strength:</strong> {connection.strength.toFixed(2)}
            </div>
          </div>
        );
      }
    }

    return tooltipContent ? (
      <div className="narrative-flow-tooltip">{tooltipContent}</div>
    ) : null;
  };

  return (
    <div
      className="narrative-flow-container"
      style={{ position: 'relative', width, height }}
    >
      <svg ref={svgRef} />
      {interactive && renderTooltip()}
    </div>
  );
};

export default NarrativeFlow;
