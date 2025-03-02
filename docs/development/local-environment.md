# Local Development Environment

This guide provides instructions for setting up a local development environment for the Veritas system, allowing you to test and develop components without deploying to GCP.

## Prerequisites

- Docker and Docker Compose (latest version)
- Node.js (v16+) and npm (v8+)
- Git
- Visual Studio Code or preferred IDE
- Kubernetes CLI (kubectl)
- Minikube or Docker Desktop with Kubernetes enabled

## Quick Start with Docker Compose

The fastest way to get started is using our Docker Compose setup, which includes all core services:

```bash
# Clone the repository
git clone https://github.com/your-org/veritas.git
cd veritas

# Start the development environment
docker-compose -f docker-compose.dev.yml up
```

This will start:
- NestJS API server
- React frontend with hot reloading
- Memgraph database
- Redis cache
- Mock social media services

Access the services:
- Frontend: http://localhost:3000
- API: http://localhost:4000
- Memgraph UI: http://localhost:7687
- Redis Commander: http://localhost:8081

## Component-by-Component Setup

If you prefer to run specific components individually:

### 1. API Server

```bash
# In the project root
cd apps/api

# Install dependencies
npm install

# Start in development mode
npm run start:dev
```

### 2. Frontend Application

```bash
# In the project root
cd apps/visualization-showcase

# Install dependencies
npm install

# Start in development mode
npm run start
```

### 3. Memgraph Database

```bash
# Run Memgraph using Docker
docker run -it --rm \
  -p 7687:7687 -p 7444:7444 -p 3000:3000 \
  -v mg_lib:/var/lib/memgraph \
  -v mg_log:/var/log/memgraph \
  -v mg_etc:/etc/memgraph \
  memgraph/memgraph-platform
```

### 4. Redis Cache

```bash
# Run Redis using Docker
docker run -it --rm \
  -p 6379:6379 \
  redis:6
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

## Development Workflow

1. **Start the environment**: Use Docker Compose to start all services
2. **Make code changes**: Edit code in your preferred IDE
3. **Test changes**: Most services support hot reloading
4. **Run tests**: Execute `npm test` in the relevant component directory
5. **Commit changes**: Follow the project's Git workflow

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

## Debugging

### API Debugging

1. Add the following to `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Attach to API",
      "port": 9229,
      "restart": true
    }
  ]
}
```

2. Start the API with debugging enabled:
```bash
npm run start:debug
```

3. Use the VS Code debugger to attach to the process

### Frontend Debugging

1. Use Chrome DevTools or React Developer Tools
2. Enable source maps in your browser
3. Set breakpoints directly in the browser or IDE

## Common Issues and Solutions

### Database Connection Issues

If you can't connect to Memgraph:
```bash
# Check if container is running
docker ps | grep memgraph

# Reset the database
docker-compose down -v
docker-compose up -d
```

### API Startup Failures

If the API fails to start:
```bash
# Check logs
docker-compose logs api

# Rebuild the container
docker-compose build api
```

### Frontend Build Errors

For dependency or build issues:
```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install

# Clear npm cache
npm cache clean --force
```

## Performance Testing

For local performance testing:

```bash
# Install k6 load testing tool
docker pull grafana/k6

# Run a load test
docker run --rm -i grafana/k6 run - <scripts/load-test.js
```

## Next Steps

After successfully testing locally:

1. Review the [Deployment Documentation](../deployment/README.md)
2. Set up CI/CD pipelines for automated testing
3. Deploy to a development environment on GCP 