# Veritas

Veritas is an advanced narrative analysis platform designed to help researchers, journalists, and analysts understand how information spreads, evolves, and influences perception across digital ecosystems. By combining network analysis, natural language processing, and innovative visualization techniques, Veritas provides unique insights into narrative dynamics that shape our information landscape.

## Project Mission

Veritas aims to:

1. **Map Information Ecosystems**: Visualize and analyze how narratives form, spread, and interact across different sources and communities
2. **Identify Narrative Patterns**: Detect emerging patterns, divergences, and convergences in how stories evolve over time
3. **Understand Reality Tunnels**: Explore how different perspectives create distinct "reality tunnels" that shape perception and belief
4. **Promote Information Literacy**: Provide tools that help users better understand the complex dynamics of modern information environments

## Key Features

- **Multi-dimensional Visualization**: Explore narratives through network graphs, temporal flows, mycelium-like structures, and topographical landscapes
- **Narrative Analysis**: Track how stories evolve, branch, merge, and compete for attention over time
- **Pattern Detection**: Identify recurring patterns, anomalies, and emerging trends in information spread
- **Source Analysis**: Evaluate and compare information sources based on various metrics
- **API Integration**: Connect with external data sources and analysis tools

## Project Structure

The project is organized as follows:

### Applications

- **api**: NestJS backend application
- **visualization-showcase**: React application showcasing all visualization components with mock data

### Libraries

- **analysis**: Analysis modules and utilities
- **content**: Content management modules
- **ingestion**: Data ingestion modules
- **monitoring**: Monitoring and logging modules
- **sources**: Data source modules
- **shared**:
  - **types**: Shared TypeScript types and interfaces
  - **utils**: Shared utility functions
- **visualization**: Visualization components library
  - Contains network graph, reality tunnel, and temporal narrative visualizations

## Development

### Prerequisites

- Node.js (v16 or later)
- npm (v7 or later)

### Getting Started

1. Install dependencies:

```bash
npm install
```

2. Start the development server for the visualization showcase app:

```bash
npm run serve:visualization-showcase
```

3. Start the development server for the API:

```bash
npm run serve:api
```

4. Run both API and visualization showcase in parallel:

```bash
npm run dev:showcase
```

### Building

To build all applications and libraries:

```bash
npm run build
```

To build a specific application:

```bash
npm run build:api
# or
npm run build:visualization-showcase
```

### Testing

To run tests for all applications and libraries:

```bash
npm run test
```

To test a specific application or library:

```bash
npm run test:api
# or
npm run test:visualization
```

### Linting

To lint all applications and libraries:

```bash
npm run lint
```

To fix linting issues:

```bash
npm run lint:fix
```

## Visualization Components

The project includes several visualization components, all of which can be explored in the visualization-showcase app:

- **Network Graph**: A force-directed graph visualization for displaying network relationships between entities
- **Reality Tunnel Visualization**: A visualization for representing how narratives and perspectives evolve and diverge over time
- **Temporal Narrative Visualization**: A visualization for representing how multiple narratives evolve in strength and relationship over time
- **Narrative Mycelium**: An organic visualization that represents narratives as interconnected mycelium-like structures
- **Narrative Landscape**: A topographical landscape visualization where elevation indicates narrative strength
- **Enhanced Reality Tunnel**: An advanced version of the Reality Tunnel with additional features for deeper narrative analysis

## API Endpoints

The API provides several endpoints for data retrieval and analysis:

- `/api/analysis`: Analysis endpoints
- `/api/ingestion`: Data ingestion endpoints
- `/api/content`: Content management endpoints
- `/api/sources`: Data source endpoints
- `/api/visualization`: Visualization data endpoints

## Contributing

1. Create a new branch for your feature or bugfix
2. Make your changes
3. Run tests and linting
4. Submit a pull request

## License

[MIT](LICENSE)
