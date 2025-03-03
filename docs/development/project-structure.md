# Project Structure

This document provides an overview of the Veritas project structure and the purpose of each directory and file.

## Directory Structure

```
veritas/
├── .github/                    # GitHub configuration
│   └── workflows/              # GitHub Actions workflows
│       ├── ci.yml              # CI/CD pipeline
│       └── security.yml        # Security scanning
├── apps/                       # Application code
│   ├── api/                    # Backend API
│   │   ├── Dockerfile          # API Docker image definition
│   │   └── Dockerfile.dev      # Development Docker image
│   └── visualization-showcase/ # Frontend visualization
│       ├── Dockerfile          # Frontend Docker image definition
│       └── Dockerfile.dev      # Development Docker image
├── docs/                       # Documentation
│   ├── deployment/             # Deployment guides
│   │   └── terraform-deployment-guide.md
│   └── development/            # Development guides
│       ├── api-docs.md         # API documentation
│       ├── data-model.md       # Data model documentation
│       ├── local-development.md # Local development guide
│       ├── project-structure.md # This file
│       └── testing.md          # Testing guide
├── kubernetes/                 # Kubernetes manifests
│   ├── README.md               # Kubernetes documentation
│   ├── memgraph-backup-job.yaml # Memgraph backup job
│   └── veritas-deployment.yaml # Main deployment manifest
├── libs/                       # Shared libraries
│   ├── common/                 # Common utilities
│   ├── data-models/            # Data models and types
│   └── graph-utils/            # Graph database utilities
├── migrations/                 # Database migrations
│   └── 1689123456789_initial_schema.js # Initial schema migration
├── scripts/                    # Utility scripts
│   ├── migrate-memgraph.js     # Memgraph migration script
│   └── setup-dev.sh            # Development environment setup
├── terraform/                  # Infrastructure as Code
│   ├── environments/           # Environment-specific configurations
│   │   ├── dev/                # Development environment
│   │   ├── prod/               # Production environment
│   │   └── staging/            # Staging environment
│   ├── modules/                # Terraform modules
│   │   ├── gke/                # Google Kubernetes Engine
│   │   ├── memorystore/        # Redis (Memorystore)
│   │   └── networking/         # VPC and networking
│   └── scripts/                # Terraform scripts
│       ├── deploy-k8s.sh       # Kubernetes deployment script
│       └── init.sh             # Terraform initialization script
├── tools/                      # Development tools
│   └── mocks/                  # Mock services
│       └── Dockerfile.twitter  # Twitter mock service
├── .gitignore                  # Git ignore file
├── docker-compose.dev.yml      # Development Docker Compose
├── package.json                # Project dependencies
└── README.md                   # Project README
```

## Key Components

### Applications

- **API**: The backend service that provides data processing, analysis, and API endpoints.
- **Frontend**: The web interface for visualizing and interacting with narrative data.

### Infrastructure

- **Terraform**: Infrastructure as Code for provisioning cloud resources on Google Cloud Platform.
- **Kubernetes**: Container orchestration for deploying and managing the application.

### Data Storage

- **Memgraph**: Graph database for storing and querying narrative data.
- **Redis**: In-memory cache for performance optimization.

### Development Tools

- **Docker Compose**: Local development environment setup.
- **Migration Scripts**: Database schema management.
- **Mock Services**: Simulated external APIs for development.

### CI/CD

- **GitHub Actions**: Automated workflows for continuous integration and deployment.
- **Security Scanning**: Automated security checks for code and dependencies.

## Development Workflow

1. **Setup**: Use `scripts/setup-dev.sh` to set up the development environment.
2. **Local Development**: Use Docker Compose to run the application locally.
3. **Testing**: Follow the testing guide to run and write tests.
4. **Deployment**: Use Terraform and Kubernetes for cloud deployment.

## Documentation

- **API Documentation**: Details on API endpoints and usage.
- **Data Model**: Information on the graph data model.
- **Deployment Guides**: Instructions for deploying to different environments.
- **Local Development**: Guide for setting up and working with the local development environment.
- **Testing Guide**: Information on running and writing tests.

## Best Practices

- **Code Organization**: Keep related code together in modules.
- **Documentation**: Document code, APIs, and processes.
- **Testing**: Write tests for all new features and bug fixes.
- **Security**: Follow security best practices and run regular scans.
- **Infrastructure**: Use Infrastructure as Code for all environments. 