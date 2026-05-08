import * as d3 from 'd3';
import React, { useEffect, useRef, useState } from 'react';
import {
  NarrativeBranch,
  NarrativeFlowVisualizationProps,
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

  const effectiveTimeWindow = timeWindow ?? data.timeframe;
  const effectiveTimeWindowStart = effectiveTimeWindow.start;
  const effectiveTimeWindowEnd = effectiveTimeWindow.end;
  void colorScheme;

  useEffect(() => {
    if (!svgRef.current || !data) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous rendering

    // Helper: check if a Date is valid
    const isValidDate = (d: unknown): d is Date => d instanceof Date && !isNaN(d.getTime());

    // Helper: check if a number is finite
    const safeNum = (v: unknown, fallback = 0): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };

    // Validate timeframe
    if (!isValidDate(effectiveTimeWindowStart) || !isValidDate(effectiveTimeWindowEnd)) return;

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
      .domain([effectiveTimeWindowStart, effectiveTimeWindowEnd])
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
        Math.abs(Number(d)) === 1 ? 'Max Divergence' : Number(d) === 0 ? 'Consensus' : '',
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
      .attr('transform', `translate(${-margin.left + 20},${innerHeight / 2}) rotate(-90)`)
      .text('Divergence from Consensus');

    // Create a line generator for the consensus band
    // Create area generator for the consensus band
    const consensusArea = d3
      .area<[Date, number]>()
      .x((d) => xScale(d[0]))
      .y0((d) => yScale(0) - strengthScale(d[1]) / 2)
      .y1((d) => yScale(0) + strengthScale(d[1]) / 2)
      .curve(d3.curveBasis);

    // Prepare consensus data points (filter out invalid entries)
    const consensusPoints: [Date, number][] = (data.consensus.timePoints ?? [])
      .map((time, i) => [time, safeNum(data.consensus.strengthValues?.[i], 0.5)] as [Date, number])
      .filter(([time]) => isValidDate(time));

    // Need at least 2 points for area/line generators
    if (consensusPoints.length < 2) return;

    // Draw consensus band
    container
      .append('path')
      .datum(consensusPoints)
      .attr('class', 'consensus-area')
      .attr('d', consensusArea)
      .attr('fill', data.consensus.color || '#888')
      .attr('opacity', 0.7)
      .on('mouseover', function () {
        if (interactive) {
          setHoveredElement({ type: 'consensus', id: data.consensus.id });
          d3.select(this).attr('opacity', 0.9);
        }
      })
      .on('mouseout', function () {
        if (interactive) {
          setHoveredElement(null);
          d3.select(this).attr('opacity', 0.7);
        }
      });

    // Function to generate path for a narrative branch
    const generateBranchPath = (branch: NarrativeBranch) => {
      const branchPoints: [Date, number, number][] = (branch.timePoints ?? [])
        .map(
          (time, i) =>
            [
              time,
              safeNum(branch.strengthValues?.[i], 0),
              safeNum(branch.divergenceValues?.[i], 0),
            ] as [Date, number, number],
        )
        .filter(([time]) => isValidDate(time));

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

    // Draw narrative branches (filter to those with valid data)
    const validBranches = (data.branches ?? []).filter((branch) => {
      const validPoints = (branch.timePoints ?? []).filter((t) => isValidDate(t));
      return validPoints.length >= 2;
    });

    validBranches.forEach((branch) => {
      const paths = generateBranchPath(branch);

      const isHighlighted = highlightBranchIds.includes(branch.id);

      container
        .append('path')
        .attr('class', `branch-area branch-${branch.id}`)
        .attr('d', paths.area)
        .attr('fill', branch.color || '#5a67d8')
        .attr('opacity', isHighlighted ? 0.9 : 0.6)
        .on('mouseover', function () {
          if (interactive) {
            setHoveredElement({ type: 'branch', id: branch.id });
            d3.select(this).attr('opacity', 0.9);
          }
        })
        .on('mouseout', function () {
          if (interactive) {
            setHoveredElement(null);
            d3.select(this).attr('opacity', isHighlighted ? 0.9 : 0.6);
          }
        })
        .on('click', () => {
          if (interactive && onBranchClick) {
            onBranchClick(branch);
          }
        });

      // Add labels if enabled
      if (
        showLabels &&
        (branch.strengthValues ?? []).length > 0 &&
        (branch.timePoints ?? []).length > 0
      ) {
        // Find the point with maximum strength for label placement
        let maxStrengthIndex = 0;
        let maxStrength = 0;

        (branch.strengthValues ?? []).forEach((strength, i) => {
          const s = safeNum(strength, 0);
          if (s > maxStrength) {
            maxStrength = s;
            maxStrengthIndex = i;
          }
        });

        const labelTime = branch.timePoints[maxStrengthIndex];
        const labelDiv = branch.divergenceValues?.[maxStrengthIndex] ?? 0;
        if (isValidDate(labelTime)) {
          const labelX = safeNum(xScale(labelTime));
          const labelY = safeNum(yScale(labelDiv));

          if (Number.isFinite(labelX) && Number.isFinite(labelY)) {
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
        }
      }

      // Add event markers if enabled
      if (showEvents && branch.events && branch.events.length > 0) {
        // Filter to events with valid timestamps and finite impact
        const validEvents = branch.events.filter(
          (evt) => isValidDate(evt.timestamp) && Number.isFinite(safeNum(evt.impact)),
        );
        const validTimePoints = (branch.timePoints ?? []).filter((t) => isValidDate(t));

        validEvents.forEach((evt) => {
          // Find the closest time point to this event
          const closestTimeIndex =
            validTimePoints.length > 0
              ? validTimePoints.reduce((closest, time, index) => {
                  const currentDiff = Math.abs(time.getTime() - evt.timestamp.getTime());
                  const closestTime = validTimePoints[closest];
                  const closestDiff = Math.abs(
                    (closestTime?.getTime() ?? evt.timestamp.getTime()) - evt.timestamp.getTime(),
                  );
                  return currentDiff < closestDiff ? index : closest;
                }, 0)
              : 0;

          const eventX = safeNum(xScale(evt.timestamp));
          const eventY = safeNum(yScale(branch.divergenceValues?.[closestTimeIndex] ?? 0));
          const impactVal = safeNum(evt.impact, 0.5);

          // Skip if coordinates are not finite
          if (!Number.isFinite(eventX) || !Number.isFinite(eventY)) return;

          container
            .append('circle')
            .attr('class', `event-marker event-${evt.id}`)
            .attr('cx', eventX)
            .attr('cy', eventY)
            .attr('r', 5 + impactVal * 3) // Size based on impact
            .attr('fill', '#f56565')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1)
            .attr('opacity', 0.8)
            .on('mouseover', function () {
              if (interactive) {
                d3.select(this)
                  .attr('opacity', 1)
                  .attr('r', 7 + impactVal * 3);

                // Show tooltip
                const tooltip = container
                  .append('g')
                  .attr('class', 'tooltip')
                  .attr('transform', `translate(${eventX + 10},${eventY - 10})`);

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
                  .text(
                    isValidDate(evt.timestamp)
                      ? evt.timestamp.toLocaleDateString()
                      : 'Unknown date',
                  );

                tooltip
                  .append('text')
                  .attr('x', 10)
                  .attr('y', 40)
                  .text(
                    (evt.description ?? '').substring(0, 30) +
                      ((evt.description ?? '').length > 30 ? '...' : ''),
                  );
              }
            })
            .on('mouseout', function () {
              if (interactive) {
                d3.select(this)
                  .attr('opacity', 0.8)
                  .attr('r', 5 + impactVal * 3);

                container.select('.tooltip').remove();
              }
            });
        });
      }
    });

    // Draw connections between narratives
    (data.connections ?? []).forEach((connection) => {
      // Skip connections with invalid timestamps
      if (!isValidDate(connection.timestamp)) return;
      // Find the source and target branches
      const sourceBranch = data.branches.find((b) => b.id === connection.sourceId);
      const targetBranch = data.branches.find((b) => b.id === connection.targetId);

      if (!sourceBranch || !targetBranch) return;

      // Find the closest time points to the connection timestamp
      const sourceTimeIndex = sourceBranch.timePoints.reduce((closest, time, index) => {
        const currentDiff = Math.abs(time.getTime() - connection.timestamp.getTime());
        const closestTime = sourceBranch.timePoints[closest];
        const closestDiff = Math.abs(
          (closestTime?.getTime() ?? connection.timestamp.getTime()) - connection.timestamp.getTime(),
        );
        return currentDiff < closestDiff ? index : closest;
      }, 0);

      const targetTimeIndex = targetBranch.timePoints.reduce((closest, time, index) => {
        const currentDiff = Math.abs(time.getTime() - connection.timestamp.getTime());
        const closestTime = targetBranch.timePoints[closest];
        const closestDiff = Math.abs(
          (closestTime?.getTime() ?? connection.timestamp.getTime()) - connection.timestamp.getTime(),
        );
        return currentDiff < closestDiff ? index : closest;
      }, 0);

      const sourceX = xScale(connection.timestamp);
      const sourceY = yScale(sourceBranch.divergenceValues[sourceTimeIndex] ?? 0);
      const targetX = xScale(connection.timestamp);
      const targetY = yScale(targetBranch.divergenceValues[targetTimeIndex] ?? 0);

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
                : '#4299e1',
        )
        .attr('stroke-width', connection.strength * 5)
        .attr('stroke-dasharray', connection.type === 'influence' ? '5,5' : '0')
        .attr('opacity', 0.7)
        .on('mouseover', function () {
          if (interactive) {
            setHoveredElement({ type: 'connection', id: connection.id });
            d3.select(this)
              .attr('opacity', 1)
              .attr('stroke-width', connection.strength * 7);
          }
        })
        .on('mouseout', function () {
          if (interactive) {
            setHoveredElement(null);
            d3.select(this)
              .attr('opacity', 0.7)
              .attr('stroke-width', connection.strength * 5);
          }
        })
        .on('click', () => {
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

    legend.append('text').attr('x', 10).attr('y', 20).attr('font-weight', 'bold').text('Legend');

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
          const branchId = branchClass.split('branch-')[1] ?? '';
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
    highlightBranchIds,
    interactive,
    effectiveTimeWindowStart,
    effectiveTimeWindowEnd,
    onBranchClick,
    onConnectionClick,
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
            <strong>Stability:</strong> {data.consensus.metrics.stability.toFixed(2)}
          </div>
          <div>
            <strong>Confidence:</strong> {data.consensus.metrics.confidence.toFixed(2)}
          </div>
          <div>
            <strong>Diversity:</strong> {data.consensus.metrics.diversity.toFixed(2)}
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
              <strong>Emerged:</strong> {branch.emergencePoint.toLocaleDateString()}
            </div>
            {branch.terminationPoint && (
              <div>
                <strong>Ended:</strong> {branch.terminationPoint.toLocaleDateString()}
              </div>
            )}
            <div>
              <strong>Peak Strength:</strong> {branch.metrics.peakStrength.toFixed(2)}
            </div>
            <div>
              <strong>Longevity:</strong> {branch.metrics.longevity} days
            </div>
          </div>
        );
      }
    } else if (hoveredElement.type === 'connection') {
      const connection = data.connections.find((c) => c.id === hoveredElement.id);
      if (connection) {
        const sourceBranch = data.branches.find((b) => b.id === connection.sourceId);
        const targetBranch = data.branches.find((b) => b.id === connection.targetId);

        tooltipContent = (
          <div>
            <h3>{connection.type.charAt(0).toUpperCase() + connection.type.slice(1)} Connection</h3>
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

    return tooltipContent ? <div className="narrative-flow-tooltip">{tooltipContent}</div> : null;
  };

  return (
    <div className="narrative-flow-container" style={{ position: 'relative', width, height }}>
      <svg ref={svgRef} />
      {interactive && renderTooltip()}
    </div>
  );
};

export default NarrativeFlow;
