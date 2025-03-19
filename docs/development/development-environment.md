# Development Environment Guide

**Status: Current**  
**Last Updated: [Current Date]**

This guide provides comprehensive instructions for setting up and working with the Veritas system in a local development environment.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start with Docker Compose](#quick-start-with-docker-compose)
3. [Project Structure](#project-structure)
4. [Running Components Individually](#running-components-individually)
5. [Working with Core Services](#working-with-core-services)
6. [Local Kubernetes Development](#local-kubernetes-development)
7. [Mock Data and Services](#mock-data-and-services)
8. [Testing](#testing)
9. [Debugging](#debugging)
10. [Common Issues and Solutions](#common-issues-and-solutions)
11. [Best Practices](#best-practices)
12. [Additional Resources](#additional-resources)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16 or higher)
- **npm** (v7 or higher)
- **Docker** and **Docker Compose**
- **Git**
- **Visual Studio Code** or preferred IDE
- **Kubernetes CLI** (kubectl) - optional for Kubernetes development
- **Minikube** or Docker Desktop with Kubernetes enabled - optional for Kubernetes development

## Quick Start with Docker Compose

The fastest way to get started is using our Docker Compose setup:

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/veritas.git
cd veritas
```

### 2. Run the Setup Script (Optional)

We provide a setup script that will check for required tools, install dependencies, create environment files, and build Docker images:

```bash
./scripts/setup-dev.sh
```

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
- **Memgraph UI**: [http://localhost:7687](http://localhost:7687)
- **Redis Commander** (Redis UI): [http://localhost:8081](http://localhost:8081)
- **Kafka UI**: [http://localhost:8080](http://localhost:8080)
- **Twitter Mock Service**: [http://localhost:4001](http://localhost:4001)

## Project Structure

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

## Running Components Individually

If you prefer to run specific components individually:

### API Server

```bash
# In the project root
cd apps/api

# Install dependencies
npm install

# Start in development mode
npm run start:dev
```

### Frontend Application

```bash
# In the project root
cd apps/visualization-showcase

# Install dependencies
npm install

# Start in development mode
npm run start
```

### Memgraph Database

```bash
# Run Memgraph using Docker
docker run -it --rm \
  -p 7687:7687 -p 7444:7444 -p 3000:3000 \
  -v mg_lib:/var/lib/memgraph \
  -v mg_log:/var/log/memgraph \
  -v mg_etc:/etc/memgraph \
  memgraph/memgraph-platform
```

### Redis Cache

```bash
# Run Redis using Docker
docker run -it --rm \
  -p 6379:6379 \
  redis:6
```

## Working with Core Services

### Memgraph Graph Database

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

### Kafka Event Streaming

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

### Redis Cache

You can interact with Redis using:

1. **Redis Commander**: Web UI for Redis at [http://localhost:8081](http://localhost:8081)

2. **Redis CLI**: Command-line interface for Redis
   ```bash
   docker exec -it veritas_redis_1 redis-cli
   ```

## Local Kubernetes Development

For testing the full deployment locally:

```bash
# Start Minikube
minikube start --driver=docker --memory=8g --cpus=4

# Enable necessary addons
minikube addons enable ingress
minikube addons enable metrics-server

# Apply Kubernetes manifests
kubectl apply -f kubernetes/local/

# Forward ports for local access
kubectl port-forward svc/veritas-api 4000:80
kubectl port-forward svc/veritas-frontend 3000:80
```

Alternatively, use our local Kubernetes script:

```bash
# Make the script executable
chmod +x scripts/local-k8s-deploy.sh

# Run the deployment script
./scripts/local-k8s-deploy.sh
```

## Mock Data and Services

### Mock Social Media Data

We provide mock data generators for testing:

```bash
# Generate mock data
npm run generate-mock-data

# Start with mock data enabled
MOCK_DATA=true npm run start:dev
```

### Mock External Services

For testing connectors without real API access:

```bash
# Start mock services
docker-compose -f docker-compose.mock.yml up

# Configure API to use mock endpoints
cp .env.mock .env.local
```

The mock services include:

- **Twitter Mock**: Simulates the Twitter API at [http://localhost:4001](http://localhost:4001)
  - Endpoints:
    - `GET /tweets?query=<search_term>&count=<count>`
    - `GET /users/<user_id>/tweets`

## Testing

### Unit Tests

```bash
# Run all unit tests
npm test

# Run tests for a specific component
npm test -- --projects=api
npm test -- --projects=visualization
```

### Integration Tests

```bash
# Start the test environment
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
npm run test:integration
```

### End-to-End Tests

```bash
# Start the full environment
docker-compose up -d

# Run E2E tests
npm run test:e2e
```

For more detailed information, see the [Testing Guide](./testing.md).

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
         "remoteRoot": "/app",
         "restart": true
       }
     ]
   }
   ```

2. **Use Chrome DevTools**: Open Chrome and navigate to `chrome://inspect`, then click on the API process under "Remote Target".

3. **Start in debug mode**:
   ```bash
   npm run start:debug
   ```

### Frontend Debugging

For the frontend, you can use:

1. **Browser DevTools**: Open your browser's developer tools (F12 or Ctrl+Shift+I)
2. **React DevTools**: Install the React DevTools browser extension
3. **VS Code Debugger**: Configure launch.json for browser debugging
4. **Enable source maps** in your browser for better debugging experience

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

### API Startup Failures

**Issue**: API fails to start.
**Solution**: Check logs for detailed error messages:
```bash
docker-compose logs api
```
or rebuild the API container:
```bash
docker-compose build api
```

### Frontend Build Errors

**Issue**: Dependency or build issues.
**Solution**: Clear dependencies and reinstall:
```bash
rm -rf node_modules
npm install

# Clear npm cache if needed
npm cache clean --force
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

5. **Environment Variables**: Never commit sensitive credentials to Git. Use `.env.example` files instead.

6. **Performance**: Consider the performance implications of your changes, especially for database queries.

## Additional Resources

- [API Documentation](./api-docs.md)
- [Data Model Documentation](./data-model.md)
- [Testing Guide](./testing.md)
- [Transform-on-Ingest Architecture](./transform-on-ingest-consolidated.md)
- [Deployment Guide](../deployment/terraform-deployment-guide.md) 