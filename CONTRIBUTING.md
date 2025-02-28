# Contributing to Veritas

Thank you for your interest in contributing to the Veritas project! This document provides guidelines and instructions for contributing to this Nx monorepo.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/veritas.git`
3. Install dependencies: `npm install`
4. Create a new branch for your feature or bugfix: `git checkout -b feature/your-feature-name`

## Project Structure

The project is organized as an Nx monorepo with the following structure:

### Applications

- **api**: NestJS backend application
- **visualization-showcase**: React application showcasing all visualization components with mock data

### Libraries

- **analysis**: Analysis modules and utilities
- **content**: Content management modules
- **ingestion**: Data ingestion modules
- **monitoring**: Monitoring and logging modules
- **sources**: Data source modules
- **shared**: Shared types and utilities
- **visualization**: Visualization components library

## Development Workflow

### Running the Applications

```bash
# Run the API
npm run serve:api

# Run the visualization showcase
npm run serve:visualization-showcase

# Run both in parallel
npm run dev:showcase
```

### Testing

```bash
# Run all tests
npm run test

# Run tests for a specific project
npm run test:api
npm run test:visualization

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Linting

```bash
# Lint all projects
npm run lint

# Fix linting issues
npm run lint:fix
```

### Building

```bash
# Build all projects
npm run build

# Build specific projects
npm run build:api
npm run build:visualization-showcase
```

## Adding New Features

### Adding a New Component to the Visualization Library

1. Create a new component file in `libs/visualization/src/lib/components/`
2. Add necessary types to `libs/visualization/src/lib/types/`
3. Add utility functions to `libs/visualization/src/lib/utils/` if needed
4. Export the component in the appropriate index files
5. Add tests in a `.spec.tsx` file
6. Update the showcase application to demonstrate the new component

### Adding a New API Endpoint

1. Create or modify the appropriate controller in `apps/api/src/controllers/`
2. Create or modify the appropriate service in `apps/api/src/services/`
3. Add necessary DTOs, entities, and interfaces
4. Add tests for the new functionality
5. Update the API documentation if applicable

## Pull Request Process

1. Ensure your code follows the project's coding standards
2. Update documentation as necessary
3. Add tests for your changes
4. Make sure all tests pass: `npm run test`
5. Make sure there are no linting errors: `npm run lint`
6. Submit a pull request to the `main` branch

## Code Style

- Follow the TypeScript coding guidelines
- Use meaningful variable and function names
- Write clear comments and documentation
- Keep functions small and focused on a single responsibility
- Use proper typing and avoid using `any` when possible

## Commit Messages

- Use clear and descriptive commit messages
- Start with a verb in the present tense (e.g., "Add", "Fix", "Update")
- Reference issue numbers when applicable

Example: `Fix: Resolve network graph rendering issue (#123)`

## License

By contributing to this project, you agree that your contributions will be licensed under the project's [MIT License](LICENSE). 