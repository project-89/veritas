# Veritas: Open Source Truth Analysis System

## Overview

Veritas is an open-source platform designed to track, analyze, and visualize information propagation across digital media. The system aims to distinguish factual information from coordinated narrative campaigns by measuring degrees of separation from verifiable reality.

## Core Objectives

- Track and analyze information propagation across digital platforms
- Measure deviation between narratives and verifiable reality
- Identify coordinated information campaigns
- Detect automated propagation networks
- Provide transparent analysis of information sources
- Enable data-driven understanding of narrative impact

## Technology Stack

- Backend: Node.js, TypeScript, NestJS, Kafka/Redpanda, Memgraph, Redis
- API Layer: GraphQL, REST with Zodios, OpenAPI/Swagger
- Frontend: Next.js, React Query, D3.js/Cytoscape.js, TailwindCSS
- Testing: Jest, SuperTest, Cypress, k6
- Monitoring: OpenTelemetry, Prometheus, ELK Stack, Grafana
- DevOps: Docker, Kubernetes, GitHub Actions, ArgoCD

## Getting Started

### Prerequisites

- Node.js 18+
- Docker
- Kubernetes cluster
- Memgraph
- Kafka/Redpanda

### Installation

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Start development environment
docker-compose up -d

# Run migrations
npm run migrate

# Start development server
npm run dev
```

### Development Workflow

1. Create feature branch
2. Implement changes
3. Write tests
4. Submit PR
5. Review and merge

## License

MIT License