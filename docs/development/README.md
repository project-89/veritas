# Veritas Development Documentation

This directory contains documentation for developing and testing the Veritas system locally.

## Contents

- [Local Environment Setup](./local-environment.md) - Instructions for setting up a local development environment
- [API Documentation](./api-docs.md) - Documentation for the Veritas API endpoints
- [Data Model](./data-model.md) - Description of the data model and schema
- [Testing Guide](./testing.md) - Guide for testing the Veritas system

## Quick Start

For a quick start with local development, follow these steps:

1. **Set up the local environment**:
   ```bash
   # Clone the repository
   git clone https://github.com/your-org/veritas.git
   cd veritas
   
   # Install dependencies
   npm install
   
   # Start the development environment with Docker Compose
   docker-compose -f docker-compose.dev.yml up
   ```

2. **Generate mock data**:
   ```bash
   # Install required packages
   npm install @faker-js/faker
   
   # Generate mock data
   node scripts/generate-mock-data.js
   ```

3. **Access the services**:
   - Frontend: http://localhost:3000
   - API: http://localhost:4000
   - Memgraph UI: http://localhost:7687
   - Redis Commander: http://localhost:8081
   - Kafka UI: http://localhost:8080

## Development Workflow

1. Make changes to the code
2. Test your changes locally
3. Write tests for your changes
4. Submit a pull request

## Testing with Kubernetes

For testing with Kubernetes locally:

```bash
# Make the script executable
chmod +x scripts/local-k8s-deploy.sh

# Run the deployment script
./scripts/local-k8s-deploy.sh
```

## Next Steps

After setting up your local environment, you might want to:

1. Explore the [API Documentation](./api-docs.md) to understand the available endpoints
2. Review the [Data Model](./data-model.md) to understand the system's data structure
3. Follow the [Testing Guide](./testing.md) to learn how to test your changes

## Contributing

Please see the [Contributing Guide](../contributing.md) for information on how to contribute to the Veritas project. 