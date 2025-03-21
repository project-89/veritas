# Visualization Showcase

This application showcases the visualization components from the Veritas project. It provides interactive demos of various visualization types used for data analysis and narrative exploration.

## Components Showcased

### Network Graph Visualization

A force-directed graph visualization for displaying network relationships between entities. Useful for showing connections, clusters, and influence patterns.

### Reality Tunnel Visualization

A visualization that represents how narratives and perspectives evolve and diverge over time, creating "reality tunnels" that shape perception.

### Temporal Narrative Visualization

A time-series visualization showing how multiple narratives evolve in strength and relationship over time.

### Narrative Mycelium Visualization

An organic visualization that represents narratives as interconnected mycelium-like structures, highlighting nodes of strength and rhizome-like connections.

### Narrative Landscape Visualization

A topographical landscape visualization where elevation indicates narrative strength and proximity indicates similarity between narratives.

### Enhanced Reality Tunnel Visualization

An advanced version of the Reality Tunnel visualization with additional features for deeper narrative analysis and exploration.

### All Visualizations Demo

An interactive demo that allows you to switch between all visualization types in one place, making it easy to compare their features and capabilities.

## Development

### Running the app

```bash
# Start the development server
npm run serve:visualization-showcase

# Or use the combined dev command to run both API and showcase
npm run dev:showcase
```

### Building for production

```bash
npm run build:visualization-showcase
```

## Data

The application uses mock data generators to create sample data for each visualization. In a production environment, this would be replaced with real data from the API.

## Technologies Used

- React
- D3.js
- Tailwind CSS
- Nx Monorepo 