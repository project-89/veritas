#!/bin/bash

# Script to fix remaining import issues in the migrated files
# This script should be run from the root of the Nx monorepo

set -e

echo "=== Fixing Import Issues in Nx Monorepo ==="
echo "Working directory: $(pwd)"

# Check if we're in the Nx monorepo
if [ ! -f "tsconfig.base.json" ]; then
  echo "Error: This script must be run from the root of the Nx monorepo"
  echo "Please navigate to the Nx monorepo directory: cd ."
  exit 1
fi

# Fix NetworkGraph component exports
echo "Fixing NetworkGraph component exports..."
mkdir -p libs/visualization/network-graph/src
cat > libs/visualization/network-graph/src/index.ts << EOF
export { NetworkGraphVisualization as NetworkGraph } from './lib/NetworkGraph';
export * from './lib/NetworkGraph';
EOF

# Fix RealityTunnelVisualization component exports
echo "Fixing RealityTunnelVisualization component exports..."
mkdir -p libs/visualization/reality-tunnel/src
cat > libs/visualization/reality-tunnel/src/index.ts << EOF
export * from './lib/RealityTunnelVisualization';
EOF

# Fix TemporalNarrativeVisualization component exports
echo "Fixing TemporalNarrativeVisualization component exports..."
mkdir -p libs/visualization/temporal-narrative/src
cat > libs/visualization/temporal-narrative/src/index.ts << EOF
export * from './lib/TemporalNarrativeVisualization';
EOF

# Fix shared visualization types exports
echo "Fixing shared visualization types exports..."
mkdir -p libs/visualization/shared/src
cat > libs/visualization/shared/src/index.ts << EOF
export * from './lib/types';
EOF

# Fix NetworkGraph component types
echo "Fixing NetworkGraph component types..."
if [ -f "libs/visualization/network-graph/src/lib/NetworkGraph.tsx" ]; then
  sed -i '' 's|interface SimulationNode extends Node, d3.SimulationNodeDatum {|interface SimulationNode extends Node, d3.SimulationNodeDatum {\n  metrics?: {\n    size: number;\n    color: string;\n    weight: number;\n  };|g' libs/visualization/network-graph/src/lib/NetworkGraph.tsx
fi

# Create CSS file for NarrativeVisualizationDemo
echo "Creating CSS file for NarrativeVisualizationDemo..."
mkdir -p apps/visualization/src/app
cat > apps/visualization/src/app/NarrativeVisualizationDemo.css << EOF
.narrative-visualization-demo {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.demo-header {
  margin-bottom: 30px;
  text-align: center;
}

.tab-navigation {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}

.tab-navigation button {
  background-color: #f0f0f0;
  border: 1px solid #ddd;
  padding: 10px 20px;
  margin: 0 10px;
  cursor: pointer;
  font-size: 16px;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.tab-navigation button.active {
  background-color: #2B6CB0;
  color: white;
  border-color: #2B6CB0;
}

.visualization-container {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 30px;
  background-color: #f9f9f9;
}

.visualization-description {
  margin-bottom: 20px;
}

.detail-panel {
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  margin-top: 20px;
}

.detail-panel button {
  background-color: #2B6CB0;
  color: white;
  border: none;
  padding: 8px 15px;
  border-radius: 4px;
  cursor: pointer;
  margin-top: 10px;
}

.demo-footer {
  border-top: 1px solid #ddd;
  padding-top: 20px;
}

.demo-footer ul {
  padding-left: 20px;
}

svg {
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 4px;
}
EOF

echo "=== Import Issues Fixed ==="
echo "Next steps:"
echo "1. Install dependencies: npm install"
echo "2. Build the applications: npx nx run-many --target=build --all"
echo "3. Test the applications: npx nx serve api & npx nx serve visualization"
