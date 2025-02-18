# Veritas: Digital Narrative Analysis System

<p align="center">
  <img src="docs/assets/veritas-logo.png" alt="Veritas Logo" width="200"/>
</p>

<p align="center">
  <a href="https://github.com/oneirocom/veritas/actions"><img src="https://github.com/oneirocom/veritas/workflows/CI/badge.svg" alt="CI Status"></a>
  <a href="https://codecov.io/gh/oneirocom/veritas"><img src="https://codecov.io/gh/oneirocom/veritas/branch/main/graph/badge.svg" alt="Coverage Status"></a>
  <a href="https://github.com/oneirocom/veritas/blob/main/LICENSE"><img src="https://img.shields.io/github/license/oneirocom/veritas" alt="License"></a>
  <a href="https://github.com/oneirocom/veritas/releases"><img src="https://img.shields.io/github/v/release/oneirocom/veritas" alt="Latest Release"></a>
</p>

## Overview

Veritas is an open-source platform designed to map and analyze the flow of narratives and information across digital spaces. In an age where digital information's veracity is increasingly complex, Veritas focuses on understanding how different narratives emerge, evolve, and influence consensus reality. The system tracks the formation of belief systems, the branching of alternate perspectives, and the real-world impact of digital information flows.

Using advanced graph-based analytics and machine learning, Veritas maps the intricate pathways of narrative propagation, identifying how stories and beliefs branch into distinct reality tunnels, and analyzing their potential societal implications. Rather than attempting to establish absolute truth, we focus on understanding how different versions of reality form, coexist, and influence human behavior and social dynamics.

### Key Features

- 🌿 **Narrative Mapping**: Track how stories and beliefs branch and evolve across digital spaces
- 🔄 **Reality Tunnel Analysis**: Identify and analyze distinct belief systems and their interconnections
- 🌊 **Information Flow Tracking**: Map the propagation and mutation of information across platforms
- 📊 **Impact Analysis**: Measure and predict real-world implications of narrative adoption
- 🕸️ **Network Dynamics**: Visualize and analyze information ecosystem relationships
- ⚡ **Real-time Pattern Detection**: Identify emerging narrative trends and branching points
- 🎯 **Consensus Tracking**: Monitor the formation and evolution of shared beliefs
- 🔮 **Outcome Prediction**: Forecast potential societal impacts of narrative trajectories
- 🛡️ **Ethical Framework**: Built with strong privacy protections and ethical considerations

## Repository Structure

```
veritas/
├── src/               # Source code
├── test/              # Test files
├── docs/             
│   ├── api/          # API documentation
│   └── deployment/   # Deployment guides
├── .github/          
│   ├── ISSUE_TEMPLATE/    # Issue templates
│   └── PULL_REQUEST_TEMPLATE.md
├── CODE_OF_CONDUCT.md    # Community guidelines
├── CONTRIBUTING.md       # Contribution guidelines
├── LICENSE              # MIT License
├── SECURITY.md         # Security policy
└── docker-compose.yml  # Docker configuration
```

## Documentation

- [Getting Started Guide](docs/getting-started.md)
- [API Documentation](docs/api/README.md)
- [Deployment Guide](docs/deployment/README.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)

## Quick Start

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- Git

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/oneirocom/veritas.git
   cd veritas
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the development environment**
   ```bash
   # Start required services
   docker-compose up -d

   # Start development server
   npm run dev
   ```

5. **Access the application**
   - Web Interface: http://localhost:3000
   - GraphQL Playground: http://localhost:3000/graphql
   - API Documentation: http://localhost:3000/api/docs

## Development

### Running Tests

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run type-check
```

## Deployment

For detailed deployment instructions, see our [Deployment Guide](docs/deployment/README.md).

### Docker

```bash
# Build image
docker build -t veritas .

# Run container
docker run -p 3000:3000 veritas
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

Before contributing, please read our:
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)
- [Contributing Guidelines](CONTRIBUTING.md)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- [GitHub Issues](https://github.com/oneirocom/veritas/issues)
- [GitHub Discussions](https://github.com/oneirocom/veritas/discussions)
- Email: support@veritas-project.com