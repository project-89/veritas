# Local Development Guide

This guide provides instructions for setting up and working with the Veritas system in a local development environment.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16 or higher)
- **npm** (v7 or higher)
- **Docker** and **Docker Compose**
- **Git**

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/veritas.git
cd veritas
```

### 2. Run the Setup Script

We provide a setup script that will check for required tools, install dependencies, create environment files, and build Docker images:

```bash
./scripts/setup-dev.sh
```

This script will:
- Check for required tools (Node.js, npm, Docker, Docker Compose, Git)
- Install npm dependencies
- Create default `.env` files if they don't exist
- Build Docker images
- Create Docker volumes

### 3. Start the Development Environment

Start all services using Docker Compose:

```bash
docker-compose -f docker-compose.dev.yml up
```

Or run in detached mode:

```bash
docker-compose -f docker-compose.dev.yml up -d
```

### 4. Access the Services

Once the environment is running, you can access the following services:

- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **API**: [http://localhost:4000](http://localhost:4000)
- **Memgraph**: bolt://localhost:7687
- **Redis Commander** (Redis UI): [http://localhost:8081](http://localhost:8081)
- **Kafka UI**: [http://localhost:8080](http://localhost:8080)
- **Twitter Mock Service**: [http://localhost:4001](http://localhost:4001)

## Development Workflow

### Project Structure

The Veritas project follows a monorepo structure:

```
veritas/
├── apps/                  # Application code
│   ├── api/               # Backend API
│   └── visualization-showcase/ # Frontend visualization
├── libs/                  # Shared libraries
│   ├── common/            # Common utilities
│   ├── data-models/       # Data models and types
│   └── graph-utils/       # Graph database utilities
├── tools/                 # Development tools
│   └── mocks/             # Mock services
├── kubernetes/            # Kubernetes manifests
├── terraform/             # Infrastructure as Code
└── scripts/               # Utility scripts
```

### Running Services Individually

If you prefer to run services individually during development:

#### API Service

```bash
cd apps/api
npm run dev
```

#### Frontend Service

```bash
cd apps/visualization-showcase
npm run dev
```

### Working with Memgraph

Memgraph is the graph database used by Veritas. You can interact with it using:

1. **Memgraph Lab**: A web-based interface for querying and visualizing graph data
   - When running with Docker Compose, access at [http://localhost:3001](http://localhost:3001)

2. **Cypher Shell**: A command-line interface for executing Cypher queries
   ```bash
   docker exec -it veritas_memgraph_1 mgconsole
   ```

3. **Programmatically**: Using the Memgraph JavaScript driver in your code

Example Cypher queries:

```cypher
// Create a source node
CREATE (s:Source {id: "source1", name: "Example Source", url: "https://example.com"});

// Create a content node
CREATE (c:Content {id: "content1", title: "Example Content", text: "This is example content."});

// Create a relationship between source and content
MATCH (s:Source {id: "source1"}), (c:Content {id: "content1"})
CREATE (s)-[:PUBLISHED {timestamp: timestamp()}]->(c);

// Query content from a specific source
MATCH (s:Source {name: "Example Source"})-[:PUBLISHED]->(c:Content)
RETURN c;
```

### Working with Kafka

Kafka is used for event-driven communication between services. You can:

1. **View Topics and Messages**: Use the Kafka UI at [http://localhost:8080](http://localhost:8080)

2. **Produce Messages**: Use the Kafka UI or the Kafka CLI:
   ```bash
   docker exec -it veritas_kafka_1 kafka-console-producer --bootstrap-server kafka:9092 --topic content.created
   ```

3. **Consume Messages**: Use the Kafka UI or the Kafka CLI:
   ```bash
   docker exec -it veritas_kafka_1 kafka-console-consumer --bootstrap-server kafka:9092 --topic content.created --from-beginning
   ```

### Mock Services

For development, we provide mock services that simulate external APIs:

- **Twitter Mock**: Simulates the Twitter API at [http://localhost:4001](http://localhost:4001)
  - Endpoints:
    - `GET /tweets?query=<search_term>&count=<count>`
    - `GET /users/<user_id>/tweets`

## Testing

See the [Testing Guide](./testing.md) for detailed information on running and writing tests.

## Debugging

### API Debugging

The API service is configured with Node.js debugging enabled on port 9229. You can:

1. **Use VS Code**: Add a launch configuration in `.vscode/launch.json`:
   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "type": "node",
         "request": "attach",
         "name": "Attach to API",
         "port": 9229,
         "address": "localhost",
         "localRoot": "${workspaceFolder}",
         "remoteRoot": "/app"
       }
     ]
   }
   ```

2. **Use Chrome DevTools**: Open Chrome and navigate to `chrome://inspect`, then click on the API process under "Remote Target".

### Frontend Debugging

For the frontend, you can use:

1. **Browser DevTools**: Open your browser's developer tools (F12 or Ctrl+Shift+I)

2. **React DevTools**: Install the React DevTools browser extension

## Common Issues and Solutions

### Docker Compose Issues

**Issue**: Services fail to start or connect to each other.
**Solution**: Ensure all required ports are available and not used by other applications.

**Issue**: Changes to code are not reflected in the running containers.
**Solution**: Ensure volume mounts are correctly configured in `docker-compose.dev.yml`.

### Memgraph Issues

**Issue**: Cannot connect to Memgraph.
**Solution**: Check if the Memgraph container is running and the port 7687 is exposed.

**Issue**: Data is lost after restarting containers.
**Solution**: Ensure the Memgraph volume is correctly configured and persisted.

### API Issues

**Issue**: API returns 500 errors.
**Solution**: Check the API logs for detailed error messages:
```bash
docker logs veritas_api_1
```

## Best Practices

1. **Code Style**: Follow the project's ESLint and Prettier configurations.

2. **Git Workflow**:
   - Create feature branches from `main`
   - Make small, focused commits
   - Write descriptive commit messages
   - Create pull requests for review

3. **Documentation**: Update documentation when making significant changes.

4. **Testing**: Write tests for new features and bug fixes.

## Additional Resources

- [API Documentation](../development/api-docs.md)
- [Data Model Documentation](../development/data-model.md)
- [Testing Guide](../development/testing.md)
- [Deployment Guide](../deployment/terraform-deployment-guide.md)
- [Kubernetes Guide](../../kubernetes/README.md) 