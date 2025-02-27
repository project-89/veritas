# Veritas - Nx Monorepo

This is the Nx monorepo for the Veritas project, which has been migrated from a standard NestJS application to an Nx monorepo structure.

## Project Structure

The project is organized as follows:

### Applications

- **api**: NestJS backend application
- **visualization**: React frontend application for visualizations

### Libraries

- **analysis**: Analysis modules and utilities
- **content**: Content management modules
- **ingestion**: Data ingestion modules
- **monitoring**: Monitoring and logging modules
- **sources**: Data source modules
- **shared**:
  - **types**: Shared TypeScript types and interfaces
  - **utils**: Shared utility functions
- **visualization**:
  - **network-graph**: Network graph visualization components
  - **reality-tunnel**: Reality tunnel visualization components
  - **temporal-narrative**: Temporal narrative visualization components
  - **shared**: Shared visualization types and utilities

## Development

### Prerequisites

- Node.js (v16 or later)
- npm (v7 or later)

### Getting Started

1. Install dependencies:

```bash
npm install
```

2. Start the development server for the visualization app:

```bash
npx nx serve visualization
```

3. Start the development server for the API:

```bash
npx nx serve api
```

### Building

To build all applications and libraries:

```bash
npx nx run-many --target=build --all
```

To build a specific application:

```bash
npx nx build api
# or
npx nx build visualization
```

### Testing

To run tests for all applications and libraries:

```bash
npx nx run-many --target=test --all
```

To test a specific application or library:

```bash
npx nx test api
# or
npx nx test visualization
# or
npx nx test visualization-network-graph
```

### Linting

To lint all applications and libraries:

```bash
npx nx run-many --target=lint --all
```

## Visualization Components

The project includes several visualization components:

- **Network Graph**: A force-directed graph visualization for displaying network relationships
- **Reality Tunnel Visualization**: A visualization for representing reality tunnels
- **Temporal Narrative Visualization**: A visualization for representing temporal narratives

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
