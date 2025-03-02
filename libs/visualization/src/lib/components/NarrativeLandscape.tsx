import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  LandscapeData,
  LandscapeFeature,
  NarrativePath,
  LandscapeVisualizationProps,
} from '../types/landscape-types';

// Generate sample data for demonstration purposes
export const generateSampleData = (): LandscapeData => {
  // Grid dimensions
  const width = 50;
  const height = 50;
  const resolution = 1;

  // Generate elevation data
  const elevationData: number[][] = Array(height)
    .fill(0)
    .map(() => Array(width).fill(0));

  // Generate color data
  const colorData: string[][] = Array(height)
    .fill(0)
    .map(() => Array(width).fill('#cccccc'));

  // Create narratives
  const narratives = [
    {
      id: 'narrative-1',
      name: 'Economic Impact',
      color: '#4285F4',
      strength: 0.8,
    },
    {
      id: 'narrative-2',
      name: 'Social Consequences',
      color: '#EA4335',
      strength: 0.7,
    },
    {
      id: 'narrative-3',
      name: 'Political Response',
      color: '#FBBC05',
      strength: 0.6,
    },
    {
      id: 'narrative-4',
      name: 'Environmental Factors',
      color: '#34A853',
      strength: 0.5,
    },
    {
      id: 'narrative-5',
      name: 'Technological Solutions',
      color: '#8F44AD',
      strength: 0.4,
    },
  ];

  // Create features (peaks, valleys, etc.)
  const features: LandscapeFeature[] = [];

  narratives.forEach((narrative, i) => {
    // Create a peak for each narrative
    const peakX = 10 + Math.floor(Math.random() * (width - 20));
    const peakY = 10 + Math.floor(Math.random() * (height - 20));
    const peakRadius = 5 + Math.floor(Math.random() * 10);
    const peakHeight = 0.5 + narrative.strength * 0.5;

    features.push({
      id: `peak-${i}`,
      type: 'peak',
      name: `${narrative.name} Peak`,
      description: `A strong concentration of the ${narrative.name} narrative`,
      center: { x: peakX, y: peakY },
      radius: peakRadius,
      narrativeId: narrative.id,
      metrics: {
        prominence: 0.7 + Math.random() * 0.3,
        significance: narrative.strength,
        stability: 0.5 + Math.random() * 0.5,
      },
    });

    // Create a valley for some narratives
    if (Math.random() > 0.5) {
      let valleyX, valleyY;
      do {
        valleyX = 10 + Math.floor(Math.random() * (width - 20));
        valleyY = 10 + Math.floor(Math.random() * (height - 20));
      } while (
        Math.sqrt(Math.pow(valleyX - peakX, 2) + Math.pow(valleyY - peakY, 2)) <
        15
      );

      const valleyRadius = 3 + Math.floor(Math.random() * 8);

      features.push({
        id: `valley-${i}`,
        type: 'valley',
        name: `${narrative.name} Valley`,
        description: `An area where the ${narrative.name} narrative is weak`,
        center: { x: valleyX, y: valleyY },
        radius: valleyRadius,
        narrativeId: narrative.id,
        metrics: {
          prominence: 0.3 + Math.random() * 0.4,
          significance: 0.3 + Math.random() * 0.3,
          stability: 0.4 + Math.random() * 0.4,
        },
      });
    }

    // Create a ridge for some narratives
    if (Math.random() > 0.7) {
      const ridgeStartX = 5 + Math.floor(Math.random() * (width - 10));
      const ridgeStartY = 5 + Math.floor(Math.random() * (height - 10));
      const ridgeEndX = 5 + Math.floor(Math.random() * (width - 10));
      const ridgeEndY = 5 + Math.floor(Math.random() * (height - 10));

      features.push({
        id: `ridge-${i}`,
        type: 'ridge',
        name: `${narrative.name} Ridge`,
        description: `A connecting path of the ${narrative.name} narrative`,
        center: {
          x: (ridgeStartX + ridgeEndX) / 2,
          y: (ridgeStartY + ridgeEndY) / 2,
        },
        radius:
          Math.sqrt(
            Math.pow(ridgeEndX - ridgeStartX, 2) +
              Math.pow(ridgeEndY - ridgeStartY, 2)
          ) / 2,
        narrativeId: narrative.id,
        metrics: {
          prominence: 0.4 + Math.random() * 0.3,
          significance: 0.4 + Math.random() * 0.4,
          stability: 0.3 + Math.random() * 0.5,
        },
      });
    }
  });

  // Apply features to elevation and color data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxInfluence = 0;
      let dominantNarrativeId = '';

      // Calculate elevation based on features
      features.forEach((feature) => {
        const distance = Math.sqrt(
          Math.pow(x - feature.center.x, 2) + Math.pow(y - feature.center.y, 2)
        );

        if (distance <= feature.radius) {
          const narrative = narratives.find(
            (n) => n.id === feature.narrativeId
          );
          if (!narrative) return;

          let influence = 0;

          if (feature.type === 'peak') {
            influence =
              (1 - distance / feature.radius) * feature.metrics.prominence;
            elevationData[y][x] += influence;
          } else if (feature.type === 'valley') {
            influence =
              (1 - distance / feature.radius) *
              feature.metrics.prominence *
              0.5;
            elevationData[y][x] -= influence;
          } else if (feature.type === 'ridge') {
            influence =
              (1 - distance / feature.radius) *
              feature.metrics.prominence *
              0.7;
            elevationData[y][x] += influence;
          }

          // Determine dominant narrative for color
          if (Math.abs(influence) > maxInfluence) {
            maxInfluence = Math.abs(influence);
            dominantNarrativeId = feature.narrativeId;
          }
        }
      });

      // Set color based on dominant narrative
      if (dominantNarrativeId) {
        const narrative = narratives.find((n) => n.id === dominantNarrativeId);
        if (narrative) {
          const color = d3.color(narrative.color);
          if (color) {
            // Adjust color based on elevation
            const adjustedColor =
              elevationData[y][x] > 0
                ? color.brighter(elevationData[y][x])
                : color.darker(Math.abs(elevationData[y][x]));
            colorData[y][x] = adjustedColor.toString();
          }
        }
      }

      // Ensure elevation is within bounds
      elevationData[y][x] = Math.max(-1, Math.min(1, elevationData[y][x]));
    }
  }

  // Create paths
  const paths: NarrativePath[] = [];

  narratives.forEach((narrative, i) => {
    const narrativeFeatures = features.filter(
      (f) => f.narrativeId === narrative.id
    );
    if (narrativeFeatures.length < 2) return;

    // Create a path connecting features of this narrative
    const pathPoints: Array<{ x: number; y: number }> = [];
    const elevationProfile: number[] = [];

    // Sort features by x position to create a somewhat logical path
    const sortedFeatures = [...narrativeFeatures].sort(
      (a, b) => a.center.x - b.center.x
    );

    // Create path points
    sortedFeatures.forEach((feature) => {
      pathPoints.push({ x: feature.center.x, y: feature.center.y });

      // Add elevation at this point
      const elevation =
        elevationData[Math.floor(feature.center.y)][
          Math.floor(feature.center.x)
        ];
      elevationProfile.push(elevation);
    });

    // Calculate gradient
    const gradient =
      elevationProfile.length > 1
        ? Math.abs(
            elevationProfile[elevationProfile.length - 1] - elevationProfile[0]
          ) / elevationProfile.length
        : 0;

    paths.push({
      id: `path-${i}`,
      name: `${narrative.name} Path`,
      description: `Path showing the evolution of the ${narrative.name} narrative`,
      points: pathPoints,
      narrativeId: narrative.id,
      metrics: {
        elevation: elevationProfile,
        gradient,
        significance: 0.5 + Math.random() * 0.5,
      },
    });
  });

  return {
    width,
    height,
    resolution,
    elevationData,
    colorData,
    features,
    paths,
    narratives,
    metadata: {
      timestamp: new Date(),
      timeframe: {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(),
      },
      maxElevation: 1,
      minElevation: -1,
    },
  };
};

export const NarrativeLandscapeVisualization: React.FC<
  LandscapeVisualizationProps
> = ({
  data,
  width = 800,
  height = 600,
  onFeatureClick,
  onPathClick,
  showLabels = true,
  showPaths = true,
  showFeatures = true,
  perspective = 0.5,
  lightAngle = 315,
  exaggeration = 1.5,
  colorScheme,
  interactive = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedFeature, setSelectedFeature] =
    useState<LandscapeFeature | null>(null);
  const [selectedPath, setSelectedPath] = useState<NarrativePath | null>(null);

  // Render the landscape on canvas
  useEffect(() => {
    if (!canvasRef.current || !data) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate scaling factors
    const scaleX = width / data.width;
    const scaleY = height / data.height;

    // Draw the landscape
    for (let y = 0; y < data.height; y++) {
      for (let x = 0; x < data.width; x++) {
        const elevation = data.elevationData[y][x];
        const color = data.colorData[y][x];

        // Calculate shading based on elevation and neighbors
        let shading = 1.0;
        if (x > 0 && y > 0 && x < data.width - 1 && y < data.height - 1) {
          const nx = data.elevationData[y][x + 1];
          const ny = data.elevationData[y + 1][x];

          // Calculate normal vector
          const normalX = (data.elevationData[y][x - 1] - nx) * exaggeration;
          const normalY = (data.elevationData[y - 1][x] - ny) * exaggeration;
          const normalZ = 2.0;

          // Normalize
          const length = Math.sqrt(
            normalX * normalX + normalY * normalY + normalZ * normalZ
          );
          const nx2 = normalX / length;
          const ny2 = normalY / length;
          const nz2 = normalZ / length;

          // Light direction (from light angle)
          const radians = (lightAngle * Math.PI) / 180;
          const lx = Math.cos(radians);
          const ly = Math.sin(radians);
          const lz = 0.5;

          // Dot product for diffuse lighting
          const dot = nx2 * lx + ny2 * ly + nz2 * lz;
          shading = Math.max(0.4, dot);
        }

        // Apply shading to color
        const baseColor = d3.color(color);
        if (!baseColor) continue;

        const shadedColor =
          shading < 1.0
            ? baseColor.darker(1 - shading)
            : baseColor.brighter(shading - 1);

        // Draw pixel
        ctx.fillStyle = shadedColor.toString();
        ctx.fillRect(x * scaleX, y * scaleY, scaleX, scaleY);
      }
    }

    // Apply perspective transformation if needed
    if (perspective > 0) {
      // This would be a more complex 3D transformation
      // For simplicity, we're just skewing the image a bit
      const imageData = ctx.getImageData(0, 0, width, height);
      ctx.clearRect(0, 0, width, height);

      // Create a temporary canvas for the transformation
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      tempCtx.putImageData(imageData, 0, 0);

      // Apply perspective transformation
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, height * 0.1 * perspective);
      ctx.lineTo(width, height * 0.1 * perspective);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.clip();

      // Draw the transformed image
      ctx.transform(
        1,
        0,
        0,
        1 - 0.2 * perspective,
        0,
        height * 0.1 * perspective
      );
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.restore();
    }
  }, [data, width, height, perspective, lightAngle, exaggeration]);

  // Render SVG overlay for interactive elements
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
      .attr(
        'style',
        'position: absolute; top: 0; left: 0; pointer-events: none;'
      );

    // Calculate scaling factors
    const scaleX = width / data.width;
    const scaleY = height / data.height;

    // Draw paths if enabled
    if (showPaths) {
      const pathGroup = svg.append('g').attr('class', 'paths');

      data.paths.forEach((path) => {
        const narrative = data.narratives.find(
          (n) => n.id === path.narrativeId
        );
        if (!narrative) return;

        // Create line generator
        const line = d3
          .line<{ x: number; y: number }>()
          .x((d) => d.x * scaleX)
          .y((d) => d.y * scaleY)
          .curve(d3.curveCatmullRom.alpha(0.5));

        // Draw path
        pathGroup
          .append('path')
          .datum(path.points)
          .attr('d', line)
          .attr('fill', 'none')
          .attr('stroke', narrative.color)
          .attr('stroke-width', 2 + path.metrics.significance * 3)
          .attr('stroke-opacity', 0.7)
          .attr('stroke-dasharray', '5,5')
          .attr('style', 'pointer-events: all;')
          .on('mouseover', function () {
            d3.select(this)
              .attr('stroke-width', 4 + path.metrics.significance * 3)
              .attr('stroke-opacity', 1);
          })
          .on('mouseout', function () {
            d3.select(this)
              .attr('stroke-width', 2 + path.metrics.significance * 3)
              .attr('stroke-opacity', 0.7);
          })
          .on('click', function () {
            setSelectedPath(path);
            if (onPathClick) onPathClick(path);
          });
      });
    }

    // Draw features if enabled
    if (showFeatures) {
      const featureGroup = svg.append('g').attr('class', 'features');

      data.features.forEach((feature) => {
        const narrative = data.narratives.find(
          (n) => n.id === feature.narrativeId
        );
        if (!narrative) return;

        // Draw feature
        const featureElement = featureGroup
          .append('g')
          .attr('class', `feature ${feature.type}`)
          .attr(
            'transform',
            `translate(${feature.center.x * scaleX}, ${
              feature.center.y * scaleY
            })`
          )
          .attr('style', 'pointer-events: all;')
          .on('mouseover', function () {
            d3.select(this)
              .select('circle')
              .attr('stroke-width', 3)
              .attr('stroke-opacity', 1);
          })
          .on('mouseout', function () {
            d3.select(this)
              .select('circle')
              .attr('stroke-width', 1)
              .attr('stroke-opacity', 0.7);
          })
          .on('click', function () {
            setSelectedFeature(feature);
            if (onFeatureClick) onFeatureClick(feature);
          });

        // Draw different shapes based on feature type
        if (feature.type === 'peak') {
          featureElement
            .append('circle')
            .attr('r', feature.metrics.prominence * 10)
            .attr('fill', narrative.color)
            .attr('fill-opacity', 0.3)
            .attr('stroke', narrative.color)
            .attr('stroke-width', 1)
            .attr('stroke-opacity', 0.7);

          featureElement
            .append('circle')
            .attr('r', 3)
            .attr('fill', narrative.color)
            .attr('stroke', '#fff')
            .attr('stroke-width', 1);
        } else if (feature.type === 'valley') {
          featureElement
            .append('circle')
            .attr('r', feature.metrics.prominence * 8)
            .attr('fill', 'none')
            .attr('stroke', narrative.color)
            .attr('stroke-width', 1)
            .attr('stroke-opacity', 0.7)
            .attr('stroke-dasharray', '2,2');

          featureElement
            .append('circle')
            .attr('r', 3)
            .attr('fill', '#fff')
            .attr('stroke', narrative.color)
            .attr('stroke-width', 1);
        } else if (feature.type === 'ridge') {
          featureElement
            .append('circle')
            .attr('r', feature.metrics.prominence * 5)
            .attr('fill', narrative.color)
            .attr('fill-opacity', 0.2)
            .attr('stroke', narrative.color)
            .attr('stroke-width', 1)
            .attr('stroke-opacity', 0.5);
        }

        // Add labels if enabled
        if (showLabels && feature.type === 'peak') {
          featureElement
            .append('text')
            .attr('dy', -feature.metrics.prominence * 10 - 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', 10)
            .attr('fill', narrative.color)
            .text(feature.name);
        }
      });
    }

    // Add legend
    const legend = svg
      .append('g')
      .attr('transform', `translate(${width - 150}, 20)`)
      .attr('style', 'pointer-events: all;');

    legend
      .append('rect')
      .attr('width', 140)
      .attr('height', data.narratives.length * 20 + 30)
      .attr('fill', 'white')
      .attr('fill-opacity', 0.8)
      .attr('rx', 5);

    legend
      .append('text')
      .attr('x', 10)
      .attr('y', 20)
      .attr('font-size', 12)
      .attr('font-weight', 'bold')
      .text('Narratives');

    data.narratives.forEach((narrative, i) => {
      const g = legend
        .append('g')
        .attr('transform', `translate(10, ${35 + i * 20})`);

      g.append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', narrative.color);

      g.append('text')
        .attr('x', 20)
        .attr('y', 10)
        .attr('font-size', 10)
        .text(narrative.name);
    });
  }, [
    data,
    width,
    height,
    showPaths,
    showFeatures,
    showLabels,
    onFeatureClick,
    onPathClick,
  ]);

  return (
    <div
      className="narrative-landscape-container"
      style={{ position: 'relative', width, height }}
    >
      <canvas ref={canvasRef} style={{ width, height }} />
      <svg ref={svgRef} />

      {selectedFeature && (
        <div
          className="feature-details"
          style={{
            position: 'absolute',
            bottom: 10,
            left: 10,
            background: 'rgba(255, 255, 255, 0.9)',
            padding: 10,
            borderRadius: 5,
            maxWidth: 300,
          }}
        >
          <h3 style={{ margin: '0 0 5px 0' }}>{selectedFeature.name}</h3>
          <p style={{ margin: '0 0 5px 0' }}>{selectedFeature.description}</p>
          <p style={{ margin: 0 }}>
            Prominence: {selectedFeature.metrics.prominence.toFixed(2)} |
            Significance: {selectedFeature.metrics.significance.toFixed(2)} |
            Stability: {selectedFeature.metrics.stability.toFixed(2)}
          </p>
        </div>
      )}

      {selectedPath && !selectedFeature && (
        <div
          className="path-details"
          style={{
            position: 'absolute',
            bottom: 10,
            left: 10,
            background: 'rgba(255, 255, 255, 0.9)',
            padding: 10,
            borderRadius: 5,
            maxWidth: 300,
          }}
        >
          <h3 style={{ margin: '0 0 5px 0' }}>{selectedPath.name}</h3>
          <p style={{ margin: '0 0 5px 0' }}>{selectedPath.description}</p>
          <p style={{ margin: 0 }}>
            Points: {selectedPath.points.length} | Gradient:{' '}
            {selectedPath.metrics.gradient.toFixed(2)} | Significance:{' '}
            {selectedPath.metrics.significance.toFixed(2)}
          </p>
        </div>
      )}
    </div>
  );
};
