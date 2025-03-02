# Veritas

Veritas is an advanced narrative analysis platform designed to help researchers, journalists, policymakers, and analysts understand how information spreads, evolves, and influences perception across digital ecosystems. By combining network analysis, natural language processing, and innovative visualization techniques, Veritas provides unique insights into narrative dynamics that shape our information landscape and societal discourse.

## Project Mission

Veritas aims to:

1. **Map Information Ecosystems**: Visualize and analyze how narratives form, spread, and interact across different sources and communities
2. **Identify Narrative Patterns**: Detect emerging patterns, divergences, and convergences in how stories evolve over time
3. **Understand Reality Tunnels**: Explore how different perspectives create distinct "reality tunnels" that shape perception and belief
4. **Promote Information Literacy**: Provide tools that help users better understand the complex dynamics of modern information environments
5. **Enhance Transparency**: Illuminate the origins, evolution, and impact of narratives that shape public discourse
6. **Support Evidence-Based Decision Making**: Equip stakeholders with data-driven insights about information flows and their societal impacts

## Why Veritas Matters

In today's complex information environment, understanding how narratives form and spread is crucial for:

- **Democratic Resilience**: Helping citizens navigate information spaces with greater awareness and critical thinking
- **Policy Development**: Enabling evidence-based approaches to addressing societal challenges
- **Media Literacy**: Empowering individuals to recognize patterns in how information is presented and framed
- **Research Advancement**: Providing researchers with tools to study information dynamics at scale
- **Crisis Response**: Identifying and understanding narrative developments during critical events
- **Social Cohesion**: Bridging divides by making different perspectives more visible and understandable

## Key Features

- **Multi-dimensional Visualization**: Explore narratives through network graphs, temporal flows, mycelium-like structures, and topographical landscapes
- **Narrative Analysis**: Track how stories evolve, branch, merge, and compete for attention over time
- **Pattern Detection**: Identify recurring patterns, anomalies, and emerging trends in information spread
- **Source Analysis**: Evaluate and compare information sources based on various metrics
- **Impact Assessment**: Measure the reach, engagement, and influence of different narratives
- **Cross-Platform Tracking**: Follow narratives across different media platforms and communities
- **Temporal Analysis**: Understand how narratives evolve and shift over time
- **API Integration**: Connect with external data sources and analysis tools

## Ethical Considerations

Veritas is developed with strong ethical principles:

- **Transparency**: All methodologies and algorithms are documented and explained
- **Privacy**: Data collection respects privacy norms and regulations
- **Neutrality**: The platform avoids built-in biases in how narratives are analyzed
- **Accessibility**: Insights are presented in ways that diverse audiences can understand
- **Responsibility**: The platform is designed to promote understanding, not manipulation
- **Inclusivity**: Multiple perspectives are represented in analysis and visualization

## Real-World Applications

Veritas can be applied to understand narratives in various domains:

- **Public Health**: Tracking information flows during health crises
- **Environmental Issues**: Mapping discourse around climate change and sustainability
- **Political Discourse**: Understanding how political narratives form and evolve
- **Economic Trends**: Analyzing narratives around economic policies and developments
- **Cultural Phenomena**: Exploring how cultural narratives spread and influence society
- **Science Communication**: Tracking how scientific findings are communicated and understood

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
- Docker and Docker Compose (for local development environment)

### Getting Started

1. Install dependencies:

```bash
npm install
```

2. Start the development environment with Docker Compose:

```bash
docker-compose -f docker-compose.dev.yml up
```

3. Or start individual components:

```bash
# Start the visualization showcase app
npm run serve:visualization-showcase

# Start the API
npm run serve:api

# Run both in parallel
npm run dev:showcase
```

4. Generate mock data for testing:

```bash
node scripts/generate-mock-data.js
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

## Deployment

For information on deploying Veritas to production environments, see the [deployment documentation](docs/deployment/README.md).

## Local Development

For detailed instructions on setting up a local development environment, see the [local development guide](docs/development/README.md).

## Contributing

1. Create a new branch for your feature or bugfix
2. Make your changes
3. Run tests and linting
4. Submit a pull request

See the [contributing guide](docs/contributing.md) for more details.

## License

[MIT](LICENSE)
