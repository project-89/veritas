import {
  NarrativeBranch,
  NarrativeConnection,
  NarrativeFlowData,
} from '../types/narrative-flow-types';

const connectionTypes = ['merge', 'split', 'influence', 'conflict'] as const;

const getArrayItem = <T,>(values: T[], index: number, fallback: T): T => values[index] ?? fallback;

/**
 * Generates sample data for the Narrative Flow visualization
 * @param startDate The start date for the visualization timeframe
 * @param endDate The end date for the visualization timeframe
 * @param numBranches The number of narrative branches to generate
 * @returns Sample NarrativeFlowData
 */
export const generateSampleNarrativeFlowData = (
  startDate: Date = new Date(2020, 0, 1),
  endDate: Date = new Date(2023, 0, 1),
  numBranches = 5,
): NarrativeFlowData => {
  // Generate time points (one per month)
  const timePoints: Date[] = [];
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    timePoints.push(new Date(currentDate));
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  // Generate consensus band data
  const consensusStrengthValues = timePoints.map(() => {
    // Consensus strength varies between 0.5 and 0.9 with some randomness
    const baseStrength = 0.7;
    const variation = 0.2;
    const noise = Math.random() * variation - variation / 2;
    return Math.max(0.4, Math.min(0.9, baseStrength + noise));
  });

  // Generate narrative branches
  const branches: NarrativeBranch[] = [];
  const branchColors = [
    '#4299e1', // blue
    '#48bb78', // green
    '#ed8936', // orange
    '#9f7aea', // purple
    '#f56565', // red
    '#38b2ac', // teal
    '#d69e2e', // yellow
    '#667eea', // indigo
    '#ed64a6', // pink
  ];

  // Generate connections between branches
  const connections: NarrativeConnection[] = [];

  for (let i = 0; i < numBranches; i++) {
    // Determine when this branch emerges
    const emergenceIndex = Math.floor(Math.random() * (timePoints.length / 3)) + 3;
    const emergencePoint = timePoints[emergenceIndex] ?? endDate;

    // Determine if and when this branch terminates
    const hasTermination = Math.random() > 0.6;
    const terminationIndex = hasTermination
      ? Math.floor(Math.random() * (timePoints.length - emergenceIndex - 5)) + emergenceIndex + 5
      : null;
    const terminationPoint =
      terminationIndex !== null ? (timePoints[terminationIndex] ?? endDate) : undefined;

    // Generate strength values for this branch
    const strengthValues = timePoints.map((_, timeIndex) => {
      if (timeIndex < emergenceIndex) return 0;
      if (terminationIndex && timeIndex > terminationIndex) return 0;

      // Branch strength grows, peaks, then may decline
      const relativePosition =
        (timeIndex - emergenceIndex) /
        (terminationIndex ? terminationIndex - emergenceIndex : timePoints.length - emergenceIndex);

      // Create a curve that peaks in the middle
      let strength = 0;
      if (relativePosition < 0.5) {
        // Growth phase
        strength = relativePosition * 2 * 0.7; // Max strength 0.7
      } else {
        // Decline phase
        strength = (1 - (relativePosition - 0.5) * 2) * 0.7;
      }

      // Add some noise
      const noise = Math.random() * 0.1 - 0.05;
      return Math.max(0.05, Math.min(0.7, strength + noise));
    });

    // Generate divergence values (how far from consensus)
    const divergenceDirection = Math.random() > 0.5 ? 1 : -1; // Above or below consensus
    const maxDivergence = 0.3 + Math.random() * 0.6; // Between 0.3 and 0.9

    const divergenceValues = timePoints.map((_, timeIndex) => {
      if (timeIndex < emergenceIndex) return 0;
      if (terminationIndex && timeIndex > terminationIndex) return 0;

      // Divergence increases over time
      const relativePosition =
        (timeIndex - emergenceIndex) /
        (terminationIndex ? terminationIndex - emergenceIndex : timePoints.length - emergenceIndex);

      // Create a curve that increases, then stabilizes
      let divergence = 0;
      if (relativePosition < 0.3) {
        // Initial rapid divergence
        divergence = relativePosition * (1 / 0.3) * maxDivergence;
      } else {
        // Stabilized divergence with slight fluctuations
        const stabilizedDivergence = maxDivergence;
        const fluctuation = Math.sin(relativePosition * 10) * 0.1 * maxDivergence;
        divergence = stabilizedDivergence + fluctuation;
      }

      return divergenceDirection * divergence;
    });

    // Generate some events for this branch
    const events = [];
    const numEvents = Math.floor(Math.random() * 3) + 1;

    for (let j = 0; j < numEvents; j++) {
      const eventIndex =
        emergenceIndex +
        Math.floor(
          Math.random() *
            (terminationIndex
              ? terminationIndex - emergenceIndex
              : timePoints.length - emergenceIndex),
        );

      events.push({
        id: `event-${i}-${j}`,
        timestamp: timePoints[eventIndex] ?? endDate,
        description: `Significant event in narrative "${getArrayItem(
          narrativeNames,
          i % narrativeNames.length,
          narrativeNames[0] ?? 'Narrative',
        )}"`,
        impact: 0.3 + Math.random() * 0.7, // Between 0.3 and 1.0
      });
    }

    // Calculate metrics
    const peakStrength = Math.max(...strengthValues);
    const longevity =
      terminationIndex && terminationPoint
        ? Math.round(
            (terminationPoint.getTime() - emergencePoint.getTime()) / (1000 * 60 * 60 * 24),
          )
        : Math.round((endDate.getTime() - emergencePoint.getTime()) / (1000 * 60 * 60 * 24));

    const branchName = getArrayItem(
      narrativeNames,
      i % narrativeNames.length,
      narrativeNames[0] ?? 'Narrative',
    );
    const branchDescription = getArrayItem(
      narrativeDescriptions,
      i % narrativeDescriptions.length,
      narrativeDescriptions[0] ?? 'Narrative description',
    );
    const branchColor = getArrayItem(branchColors, i % branchColors.length, branchColors[0] ?? '#4299e1');

    branches.push({
      id: `branch-${i}`,
      name: branchName,
      description: branchDescription,
      color: branchColor,
      parentId: null, // All branches emerge from consensus in this sample
      emergencePoint,
      terminationPoint,
      timePoints,
      strengthValues,
      divergenceValues,
      metrics: {
        peakStrength,
        longevity,
        volatility: Math.random() * 0.5, // Random volatility between 0 and 0.5
        influence: Math.random() * 0.8, // Random influence between 0 and 0.8
      },
      sources: generateRandomSources(3 + Math.floor(Math.random() * 3)),
      events,
    });

    // Potentially create connections to other branches
    if (i > 0 && Math.random() > 0.5) {
      const targetBranchIndex = Math.floor(Math.random() * i);
      const connectionType = getArrayItem(connectionTypes, Math.floor(Math.random() * 4), 'merge');
      const connectionIndex =
        emergenceIndex +
        Math.floor(
          (Math.random() *
            (terminationIndex
              ? terminationIndex - emergenceIndex
              : timePoints.length - emergenceIndex)) /
            2,
        );

      const targetBranchName = getArrayItem(
        narrativeNames,
        targetBranchIndex % narrativeNames.length,
        narrativeNames[0] ?? 'Narrative',
      );

      connections.push({
        id: `connection-${i}-${targetBranchIndex}`,
        sourceId: `branch-${i}`,
        targetId: `branch-${targetBranchIndex}`,
        timestamp: timePoints[connectionIndex] ?? endDate,
        strength: 0.3 + Math.random() * 0.7,
        type: connectionType,
        description: `${
          connectionType.charAt(0).toUpperCase() + connectionType.slice(1)
        } between "${branchName}" and "${targetBranchName}"`,
      });
    }
  }

  return {
    timeframe: {
      start: startDate,
      end: endDate,
    },
    consensus: {
      id: 'consensus',
      name: 'Consensus Reality',
      description: 'The mainstream understanding accepted by the majority',
      color: '#718096', // slate gray
      timePoints,
      strengthValues: consensusStrengthValues,
      metrics: {
        stability: 0.75,
        confidence: 0.85,
        diversity: 0.6,
      },
    },
    branches,
    connections,
    metadata: {
      title: 'Sample Narrative Flow',
      description: 'A demonstration of the Narrative Flow visualization with sample data',
      topics: ['politics', 'health', 'technology', 'environment', 'economy'],
      sources: 25 + Math.floor(Math.random() * 50), // Random number of sources between 25 and 75
      timestamp: new Date(),
    },
  };
};

// Helper function to generate random sources
const generateRandomSources = (count: number) => {
  const sources = [];
  for (let i = 0; i < count; i++) {
    sources.push({
      id: `source-${i}`,
      name: getArrayItem(
        sourceNames,
        Math.floor(Math.random() * sourceNames.length),
        sourceNames[0] ?? 'Source',
      ),
      weight: 0.2 + Math.random() * 0.8, // Between 0.2 and 1.0
    });
  }
  return sources;
};

// Sample narrative names
const narrativeNames = [
  'Climate Crisis',
  'Economic Recovery',
  'Technological Disruption',
  'Healthcare Reform',
  'Political Polarization',
  'Social Justice Movement',
  'Educational Transformation',
  'Energy Revolution',
  'Cultural Shift',
  'Global Cooperation',
];

// Sample narrative descriptions
const narrativeDescriptions = [
  'A perspective emphasizing the urgent need for climate action and systemic change',
  'A narrative focused on economic rebuilding and financial system reform',
  'A viewpoint centered on how technology is fundamentally changing society',
  'A perspective on transforming healthcare systems for better outcomes',
  'A narrative about increasing division in political discourse and identity',
  'A viewpoint focused on addressing systemic inequalities and injustice',
  'A perspective on reimagining education for the modern world',
  'A narrative about transitioning to sustainable energy sources',
  'A viewpoint on shifting cultural values and social norms',
  'A perspective emphasizing international collaboration on global challenges',
];

// Sample source names
const sourceNames = [
  'Global News Network',
  'The Daily Chronicle',
  'Tech Insights',
  'Policy Review',
  'Science Today',
  'Economic Observer',
  'Social Trends',
  'The Analyst',
  'Future Perspectives',
  'Cultural Commentary',
  'Academic Journal',
  'Industry Report',
  'Public Opinion Survey',
  'Expert Panel',
  'Community Forum',
];
