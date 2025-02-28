import { useState } from 'react';
import { Route, Routes, Link, useLocation } from 'react-router-dom';
import {
  NetworkGraphVisualization,
  RealityTunnelVisualization,
  TemporalNarrativeVisualization,
} from '@veritas-nx/visualization';
import {
  generateNetworkData,
  generateRealityTunnelData,
  generateTemporalData,
} from './mock-data';

export function App() {
  const location = useLocation();
  const [networkData] = useState(generateNetworkData());
  const [realityTunnelData] = useState(generateRealityTunnelData());
  const [temporalData] = useState(generateTemporalData());

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
          <div className="flex space-x-8 py-4">
            <Link
              to="/"
              className={`${
                location.pathname === '/'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              } px-3 py-2 text-sm font-medium`}
            >
              Home
            </Link>
            <Link
              to="/network"
              className={`${
                location.pathname === '/network'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              } px-3 py-2 text-sm font-medium`}
            >
              Network Graph
            </Link>
            <Link
              to="/reality-tunnel"
              className={`${
                location.pathname === '/reality-tunnel'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              } px-3 py-2 text-sm font-medium`}
            >
              Reality Tunnel
            </Link>
            <Link
              to="/temporal"
              className={`${
                location.pathname === '/temporal'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              } px-3 py-2 text-sm font-medium`}
            >
              Temporal Narrative
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
        </Routes>
      </main>
    </div>
  );
}

export default App;
