import { useState } from 'react';
import { Route, Routes, Link, useLocation } from 'react-router-dom';
import {
  NetworkGraphVisualization,
  RealityTunnelVisualization,
  TemporalNarrativeVisualization,
  NarrativeMyceliumVisualization,
  NarrativeLandscapeVisualization,
  EnhancedRealityTunnelVisualization,
  VisualizationDemo,
  generateMyceliumData,
  generateLandscapeData,
  generateEnhancedTunnelData,
} from '@veritas-nx/visualization';
import {
  generateNetworkData,
  generateRealityTunnelData,
  generateTemporalData,
} from './mock-data';
import NarrativeFlowPage from './pages/narrative-flow-page';

export function App() {
  const location = useLocation();
  const [networkData] = useState(generateNetworkData());
  const [realityTunnelData] = useState(generateRealityTunnelData());
  const [temporalData] = useState(generateTemporalData());
  const [myceliumData] = useState(generateMyceliumData());
  const [landscapeData] = useState(generateLandscapeData());
  const [enhancedTunnelData] = useState(generateEnhancedTunnelData());

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Veritas Visualization Showcase
          </h1>
          <p className="mt-2 text-gray-600">
            Explore different visualization components for data analysis and
            narrative exploration
          </p>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 py-4 overflow-x-auto">
            <Link
              to="/"
              className={`${
                location.pathname === '/'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              } px-3 py-2 text-sm font-medium whitespace-nowrap`}
            >
              Home
            </Link>
            <Link
              to="/network"
              className={`${
                location.pathname === '/network'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              } px-3 py-2 text-sm font-medium whitespace-nowrap`}
            >
              Network Graph
            </Link>
            <Link
              to="/reality-tunnel"
              className={`${
                location.pathname === '/reality-tunnel'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              } px-3 py-2 text-sm font-medium whitespace-nowrap`}
            >
              Reality Tunnel
            </Link>
            <Link
              to="/temporal"
              className={`${
                location.pathname === '/temporal'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              } px-3 py-2 text-sm font-medium whitespace-nowrap`}
            >
              Temporal Narrative
            </Link>
            <Link
              to="/mycelium"
              className={`${
                location.pathname === '/mycelium'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              } px-3 py-2 text-sm font-medium whitespace-nowrap`}
            >
              Narrative Mycelium
            </Link>
            <Link
              to="/landscape"
              className={`${
                location.pathname === '/landscape'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              } px-3 py-2 text-sm font-medium whitespace-nowrap`}
            >
              Narrative Landscape
            </Link>
            <Link
              to="/enhanced-tunnel"
              className={`${
                location.pathname === '/enhanced-tunnel'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              } px-3 py-2 text-sm font-medium whitespace-nowrap`}
            >
              Enhanced Reality Tunnel
            </Link>
            <Link
              to="/narrative-flow"
              className={`${
                location.pathname === '/narrative-flow'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              } px-3 py-2 text-sm font-medium whitespace-nowrap`}
            >
              Narrative Flow
            </Link>
            <Link
              to="/demo"
              className={`${
                location.pathname === '/demo'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              } px-3 py-2 text-sm font-medium whitespace-nowrap`}
            >
              All Visualizations
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <Routes>
          <Route
            path="/"
            element={
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <h3 className="text-lg font-medium text-gray-900">
                      Network Graph
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Visualize network relationships between entities
                    </p>
                    <div className="mt-4">
                      <Link
                        to="/network"
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                      >
                        View Demo
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <h3 className="text-lg font-medium text-gray-900">
                      Reality Tunnel
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Explore how narratives and perspectives evolve over time
                    </p>
                    <div className="mt-4">
                      <Link
                        to="/reality-tunnel"
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                      >
                        View Demo
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <h3 className="text-lg font-medium text-gray-900">
                      Temporal Narrative
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Visualize how multiple narratives evolve in strength over
                      time
                    </p>
                    <div className="mt-4">
                      <Link
                        to="/temporal"
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                      >
                        View Demo
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <h3 className="text-lg font-medium text-gray-900">
                      Narrative Mycelium
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Visualize narratives as organic, interconnected
                      mycelium-like structures
                    </p>
                    <div className="mt-4">
                      <Link
                        to="/mycelium"
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                      >
                        View Demo
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <h3 className="text-lg font-medium text-gray-900">
                      Narrative Landscape
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Explore narratives as a topographical landscape with peaks
                      and valleys
                    </p>
                    <div className="mt-4">
                      <Link
                        to="/landscape"
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                      >
                        View Demo
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <h3 className="text-lg font-medium text-gray-900">
                      Enhanced Reality Tunnel
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Advanced visualization of reality tunnels with enhanced
                      features
                    </p>
                    <div className="mt-4">
                      <Link
                        to="/enhanced-tunnel"
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                      >
                        View Demo
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <h3 className="text-lg font-medium text-gray-900">
                      Narrative Flow
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Visualize how narratives emerge from, diverge from, and
                      sometimes return to consensus reality
                    </p>
                    <div className="mt-4">
                      <Link
                        to="/narrative-flow"
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                      >
                        View Demo
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg col-span-1 sm:col-span-2 lg:col-span-3">
                  <div className="p-5">
                    <h3 className="text-lg font-medium text-gray-900">
                      All Visualizations Demo
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Interactive demo showcasing all visualization types in one
                      place
                    </p>
                    <div className="mt-4">
                      <Link
                        to="/demo"
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                      >
                        View Demo
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            }
          />
          <Route
            path="/network"
            element={
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">
                  Network Graph Visualization
                </h2>
                <p className="mb-4 text-gray-600">
                  This visualization shows network relationships between
                  different entities. Nodes represent content, sources, or
                  accounts, while edges represent relationships between them.
                </p>
                <div className="border rounded-lg overflow-hidden">
                  <NetworkGraphVisualization
                    data={networkData}
                    width={1000}
                    height={600}
                    onNodeClick={(node) => console.log('Node clicked:', node)}
                  />
                </div>
              </div>
            }
          />
          <Route
            path="/reality-tunnel"
            element={
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">
                  Reality Tunnel Visualization
                </h2>
                <p className="mb-4 text-gray-600">
                  This visualization shows how narratives and perspectives
                  evolve and diverge over time, creating "reality tunnels" that
                  shape perception.
                </p>
                <div className="border rounded-lg overflow-hidden">
                  <RealityTunnelVisualization
                    data={realityTunnelData}
                    width={1000}
                    height={600}
                    onNodeClick={(node) => console.log('Node clicked:', node)}
                  />
                </div>
              </div>
            }
          />
          <Route
            path="/temporal"
            element={
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">
                  Temporal Narrative Visualization
                </h2>
                <p className="mb-4 text-gray-600">
                  This visualization shows how multiple narratives evolve in
                  strength and relationship over time.
                </p>
                <div className="border rounded-lg overflow-hidden">
                  <TemporalNarrativeVisualization
                    data={temporalData}
                    width={1000}
                    height={600}
                    onStreamClick={(streamId) =>
                      console.log('Stream clicked:', streamId)
                    }
                    onEventClick={(event) =>
                      console.log('Event clicked:', event)
                    }
                  />
                </div>
              </div>
            }
          />
          <Route
            path="/mycelium"
            element={
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">
                  Narrative Mycelium Visualization
                </h2>
                <p className="mb-4 text-gray-600">
                  This visualization represents narratives as organic,
                  interconnected mycelium-like structures, showing how ideas
                  branch, connect, and form clusters.
                </p>
                <div className="border rounded-lg overflow-hidden">
                  <NarrativeMyceliumVisualization
                    data={myceliumData}
                    width={1000}
                    height={600}
                    onNodeClick={(node) => console.log('Node clicked:', node)}
                    onClusterClick={(cluster) =>
                      console.log('Cluster clicked:', cluster)
                    }
                  />
                </div>
              </div>
            }
          />
          <Route
            path="/landscape"
            element={
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">
                  Narrative Landscape Visualization
                </h2>
                <p className="mb-4 text-gray-600">
                  This visualization presents narratives as a topographical
                  landscape where elevation indicates narrative strength and
                  proximity indicates similarity.
                </p>
                <div className="border rounded-lg overflow-hidden">
                  <NarrativeLandscapeVisualization
                    data={landscapeData}
                    width={1000}
                    height={600}
                    onFeatureClick={(feature) =>
                      console.log('Feature clicked:', feature)
                    }
                    onPathClick={(path) => console.log('Path clicked:', path)}
                  />
                </div>
              </div>
            }
          />
          <Route
            path="/enhanced-tunnel"
            element={
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">
                  Enhanced Reality Tunnel Visualization
                </h2>
                <p className="mb-4 text-gray-600">
                  This advanced visualization extends the reality tunnel concept
                  with enhanced features for deeper narrative analysis and
                  exploration.
                </p>
                <div className="border rounded-lg overflow-hidden">
                  <EnhancedRealityTunnelVisualization
                    data={enhancedTunnelData}
                    width={1000}
                    height={600}
                    onNodeClick={(node) => console.log('Node clicked:', node)}
                    onBranchClick={(branch) =>
                      console.log('Branch clicked:', branch)
                    }
                  />
                </div>
              </div>
            }
          />
          <Route path="/narrative-flow" element={<NarrativeFlowPage />} />
          <Route
            path="/demo"
            element={
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">
                  All Visualizations Demo
                </h2>
                <p className="mb-4 text-gray-600">
                  This interactive demo showcases all visualization types in one
                  place, allowing you to switch between them and compare their
                  features.
                </p>
                <div className="border rounded-lg overflow-hidden">
                  <VisualizationDemo />
                </div>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;
