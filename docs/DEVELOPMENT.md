# Development Guide

## Project Status

### Core Infrastructure
✅ COMPLETE
- NestJS application with TypeScript
- Docker containerization
- Memgraph database integration
- Redis caching layer
- Kafka/Redpanda event streaming
- Monitoring and logging infrastructure

### Data Processing
✅ COMPLETE
- Data ingestion pipeline
- Schema validation
- Entity processing
- Event processing
- Content storage and caching

### Analysis Features
✅ COMPLETE
- Pattern detection
- Reality deviation measurement
- Source credibility scoring
- Network analysis
- Temporal analysis
- Network influence calculation

### Visualization
✅ COMPLETE
- Network graph visualization
- Temporal views
- Metrics dashboard
- Data export
- Real-time updates

### API Layer
🟨 MOSTLY COMPLETE
- GraphQL resolvers
- REST controllers
- API definitions
- Input validation
- API documentation (in progress)

### Areas for Enhancement
1. Documentation
   - Expand API documentation
   - Add more code examples
   - Update technical documentation

2. Testing
   - Increase coverage for newer components
   - Add more integration tests
   - Expand E2E test suite

3. Features
   - Enhance alert system
   - Add more export formats
   - Improve real-time updates

## Getting Started

### Prerequisites

- Node.js 18+
- Docker
- Kubernetes cluster
- Memgraph
- Kafka/Redpanda

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd veritas
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Start the development environment:
```bash
docker-compose up -d
```

5. Run database migrations:
```bash
npm run migrate
```

6. Start the development server:
```bash
npm run dev
```

## Development Workflow

1. Create a feature branch:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes following our coding standards

3. Write tests for your changes:
```bash
npm run test
npm run test:e2e
```

4. Submit a Pull Request

### Code Style

- Use TypeScript for all new code
- Follow the existing code style
- Use Prettier for code formatting
- Use ESLint for code linting

### Testing

#### Unit Tests
```bash
# Run unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:cov
```

#### E2E Tests
```bash
# Run e2e tests
npm run test:e2e
```

#### Load Tests
```bash
# Run k6 load tests
k6 run tests/load/scenarios.js
```

### Documentation

- Keep documentation up to date with code changes
- Document all new features and APIs
- Update README.md when adding new features
- Use JSDoc for code documentation

### Debugging

1. Start the server in debug mode:
```bash
npm run start:debug
```

2. Use the Node.js debugger in your IDE or Chrome DevTools

### Database Management

#### Memgraph
- Access Memgraph Lab: http://localhost:7444
- Use Cypher queries for direct database manipulation
- Document all schema changes

#### Redis
- Use Redis CLI for cache inspection
- Document caching strategies
- Monitor memory usage

### Monitoring

#### Local Development
- Metrics: http://localhost:9464/metrics
- Traces: http://localhost:4318
- Logs: ELK Stack

#### Production
- Grafana dashboards
- Prometheus alerts
- OpenTelemetry traces

## Contribution Guidelines

### Pull Request Process

1. Update documentation
2. Add/update tests
3. Ensure CI passes
4. Get code review
5. Merge after approval

### Code Review Guidelines

- Review for security
- Check for test coverage
- Verify documentation
- Ensure performance impact is acceptable

### Release Process

1. Version bump
2. Update changelog
3. Create release PR
4. Deploy to staging
5. Deploy to production

## Troubleshooting

### Common Issues

1. Docker Compose Issues
```bash
# Reset containers
docker-compose down -v
docker-compose up -d
```

2. Database Connection Issues
```bash
# Check services
docker-compose ps

# Check logs
docker-compose logs -f memgraph
```

3. Build Issues
```bash
# Clean install
rm -rf node_modules
npm install

# Clear build cache
npm run clean
```

### Getting Help

- Check existing issues
- Review documentation
- Ask in team chat
- Create detailed bug reports 