# Contributing to Veritas

Thank you for your interest in contributing to Veritas! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. We expect all contributors to be respectful, inclusive, and considerate of others.

## How to Contribute

### Reporting Bugs

If you find a bug in the project, please create an issue on GitHub with the following information:

1. A clear, descriptive title
2. A detailed description of the issue
3. Steps to reproduce the bug
4. Expected behavior
5. Actual behavior
6. Screenshots (if applicable)
7. Environment information (OS, browser, etc.)

### Suggesting Enhancements

If you have an idea for an enhancement, please create an issue on GitHub with the following information:

1. A clear, descriptive title
2. A detailed description of the enhancement
3. The motivation behind the enhancement
4. Any potential implementation details
5. Any potential drawbacks or considerations

### Pull Requests

We welcome pull requests for bug fixes, enhancements, and documentation improvements. To submit a pull request:

1. Fork the repository
2. Create a new branch for your changes
3. Make your changes
4. Run tests and ensure they pass
5. Submit a pull request with a clear description of the changes

#### Pull Request Process

1. Ensure your code follows the project's coding standards
2. Update documentation as necessary
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit the pull request
6. Address any feedback from reviewers

## Development Setup

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

## Coding Standards

### JavaScript/TypeScript

- Use TypeScript for all new code
- Follow the ESLint configuration provided in the project
- Use async/await for asynchronous code
- Use meaningful variable and function names
- Add JSDoc comments for functions and complex code blocks

### React

- Use functional components with hooks
- Use TypeScript for component props and state
- Follow the component structure used in the project
- Use CSS modules for styling

### Testing

- Write unit tests for all new functionality
- Ensure all tests pass before submitting a pull request
- Use Jest and React Testing Library for testing

### Git Workflow

- Use descriptive commit messages
- Reference issue numbers in commit messages when applicable
- Keep pull requests focused on a single issue or feature
- Rebase your branch before submitting a pull request

## Branch Naming Convention

- `feature/short-description` for new features
- `bugfix/short-description` for bug fixes
- `docs/short-description` for documentation changes
- `refactor/short-description` for code refactoring
- `test/short-description` for test additions or changes

## Versioning

We use [Semantic Versioning](https://semver.org/) for versioning. For the versions available, see the tags on this repository.

## License

By contributing to Veritas, you agree that your contributions will be licensed under the project's MIT license.

## Questions

If you have any questions about contributing, please reach out to the project maintainers at dev@veritas-system.com.

Thank you for contributing to Veritas! 