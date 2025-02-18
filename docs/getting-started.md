# Getting Started with Veritas

This guide will help you get up and running with Veritas quickly.

## Quick Setup

1. **Prerequisites**
   ```bash
   # Check Node.js version
   node --version  # Should be 18+
   
   # Check Docker version
   docker --version
   ```

2. **Installation**
   ```bash
   # Clone the repository
   git clone https://github.com/oneirocom/veritas.git
   cd veritas
   
   # Install dependencies
   npm install
   ```

3. **Configuration**
   ```bash
   # Copy example environment file
   cp .env.example .env
   
   # Edit .env with your settings
   nano .env
   ```

## Running the Application

1. **Start Required Services**
   ```bash
   # Start infrastructure
   docker-compose up -d
   ```

2. **Initialize Database**
   ```bash
   # Run migrations
   npm run migrate
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

## Accessing the Application

- Web Interface: http://localhost:3000
- GraphQL Playground: http://localhost:3000/graphql
- API Documentation: http://localhost:3000/api/docs

## Next Steps

1. Read the [Architecture Overview](ARCHITECTURE.md)
2. Check out the [Development Guide](DEVELOPMENT.md)
3. Join our [Discord community](https://discord.gg/veritas)

## Troubleshooting

### Common Issues

1. **Port Conflicts**
   ```bash
   # Check running services
   docker ps
   
   # Stop conflicting services
   docker stop container_name
   ```

2. **Database Connection**
   ```bash
   # Check Memgraph status
   docker-compose logs memgraph
   ```

3. **Build Issues**
   ```bash
   # Clean install
   rm -rf node_modules
   npm install
   ```

### Getting Help

- Check our [FAQ](https://docs.veritas-project.com/faq)
- Ask in [Discord](https://discord.gg/veritas)
- Open an [issue](https://github.com/oneirocom/veritas/issues) 