# Veritas System

![Veritas Logo](docs/assets/veritas-logo.png)

## Overview

Veritas is an advanced narrative tracking and analysis system designed to identify, track, and visualize the flow of information across digital platforms. By leveraging graph database technology and sophisticated analysis algorithms, Veritas provides insights into how narratives form, evolve, and spread across the digital landscape.

## Key Features

- **Narrative Detection**: Automatically identify emerging narratives from content across multiple sources
- **Relationship Mapping**: Visualize connections between content, sources, and narratives
- **Temporal Analysis**: Track how narratives evolve and change over time
- **Source Attribution**: Identify original sources and key amplifiers of narratives
- **Branch Detection**: Recognize when narratives split into sub-narratives or merge
- **Consensus Visualization**: See where different viewpoints converge or diverge
- **Real-time Monitoring**: Track narrative development as it happens
- **Historical Analysis**: Examine past narrative patterns and evolution

## System Architecture

Veritas is built on a modern, cloud-native architecture:

- **Frontend**: React-based web application with D3.js visualizations
- **Backend API**: Node.js/Express RESTful API
- **Graph Database**: Memgraph for storing and querying relationship data
- **Cache**: Redis for performance optimization
- **Message Queue**: Kafka for event-driven processing
- **Infrastructure**: Deployed on Google Cloud Platform using Terraform and Kubernetes

## Documentation

- [Development Documentation](docs/development/)
  - [API Documentation](docs/development/api-docs.md)
  - [Data Model](docs/development/data-model.md)
  - [Frontend Architecture](docs/development/frontend-architecture.md)
  - [Backend Architecture](docs/development/backend-architecture.md)

- [Deployment Documentation](docs/deployment/)
  - [Deployment Status](docs/deployment/deployment-status.md)
  - [Terraform Deployment Guide](docs/deployment/terraform-deployment-guide.md)
  - [Kubernetes Deployment](kubernetes/README.md)

- [User Documentation](docs/user/)
  - [Getting Started](docs/user/getting-started.md)
  - [User Guide](docs/user/user-guide.md)
  - [Admin Guide](docs/user/admin-guide.md)

## Getting Started

### Prerequisites

- Node.js 16+
- Docker and Docker Compose
- Google Cloud SDK (for deployment)
- Terraform 1.0+ (for deployment)
- kubectl (for Kubernetes deployment)

### Local Development

1. Clone the repository:
   ```
   git clone https://github.com/oneirocom/veritas.git
   cd veritas
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development environment:
   ```
   npm run dev
   ```

4. Access the application at http://localhost:3000

### Deployment

For production deployment, follow the [Terraform Deployment Guide](docs/deployment/terraform-deployment-guide.md).

## Project Structure

```
veritas/
├── app/                  # Frontend application
├── server/               # Backend API server
├── docs/                 # Documentation
│   ├── development/      # Development documentation
│   ├── deployment/       # Deployment documentation
│   └── user/             # User documentation
├── kubernetes/           # Kubernetes manifests
├── terraform/            # Terraform configuration
│   ├── environments/     # Environment-specific configurations
│   └── modules/          # Reusable Terraform modules
├── scripts/              # Utility scripts
└── tests/                # Test suites
```

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- The Veritas team at Oneirocom
- All open source projects that made this possible
