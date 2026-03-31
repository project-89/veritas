import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 overflow-hidden shadow-lg rounded-lg col-span-1 sm:col-span-2 lg:col-span-3">
        <div className="p-5">
          <h3 className="text-lg font-medium text-white">
            Live Narrative Analysis
          </h3>
          <p className="mt-1 text-sm text-indigo-200">
            Search any topic across Reddit, Twitter/X, YouTube and more.
            Content is scraped, classified, and visualized in real-time.
          </p>
          <div className="mt-4">
            <Link
              href="/search"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-indigo-700 bg-white hover:bg-indigo-50"
            >
              Start Analyzing
            </Link>
          </div>
        </div>
      </div>

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
              href="/network"
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
              href="/reality-tunnel"
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
              href="/temporal"
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
              href="/mycelium"
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
              href="/landscape"
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
              href="/enhanced-tunnel"
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
              href="/narrative-flow"
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
              href="/demo"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              View Demo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
