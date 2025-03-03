#!/bin/bash

# Veritas Development Environment Setup Script
# This script helps developers set up their local environment for the Veritas project.

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Print header
echo -e "${GREEN}=======================================${NC}"
echo -e "${GREEN}  Veritas Development Environment Setup ${NC}"
echo -e "${GREEN}=======================================${NC}"
echo ""

# Check for required tools
echo -e "${YELLOW}Checking for required tools...${NC}"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed. Please install Node.js v16 or higher.${NC}"
    echo "Visit https://nodejs.org/ to download and install."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d 'v' -f 2)
echo -e "Node.js ${GREEN}✓${NC} (v$NODE_VERSION)"

# Check for npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm is not installed. Please install npm.${NC}"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo -e "npm ${GREEN}✓${NC} (v$NPM_VERSION)"

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed. Please install Docker.${NC}"
    echo "Visit https://docs.docker.com/get-docker/ to download and install."
    exit 1
fi

DOCKER_VERSION=$(docker --version | cut -d ' ' -f 3 | tr -d ',')
echo -e "Docker ${GREEN}✓${NC} (v$DOCKER_VERSION)"

# Check for Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed. Please install Docker Compose.${NC}"
    echo "Visit https://docs.docker.com/compose/install/ to download and install."
    exit 1
fi

DOCKER_COMPOSE_VERSION=$(docker-compose --version | cut -d ' ' -f 3 | tr -d ',')
echo -e "Docker Compose ${GREEN}✓${NC} (v$DOCKER_COMPOSE_VERSION)"

# Check for Git
if ! command -v git &> /dev/null; then
    echo -e "${RED}Git is not installed. Please install Git.${NC}"
    echo "Visit https://git-scm.com/downloads to download and install."
    exit 1
fi

GIT_VERSION=$(git --version | cut -d ' ' -f 3)
echo -e "Git ${GREEN}✓${NC} (v$GIT_VERSION)"

echo -e "${GREEN}All required tools are installed.${NC}"
echo ""

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install
echo -e "${GREEN}Dependencies installed successfully.${NC}"
echo ""

# Create .env files if they don't exist
echo -e "${YELLOW}Setting up environment files...${NC}"

# API .env file
if [ ! -f "apps/api/.env" ]; then
    echo -e "Creating ${YELLOW}apps/api/.env${NC} file..."
    cat > apps/api/.env << EOL
NODE_ENV=development
PORT=4000
LOG_LEVEL=debug

# Database
MEMGRAPH_HOST=localhost
MEMGRAPH_PORT=7687
MEMGRAPH_USERNAME=memgraph
MEMGRAPH_PASSWORD=memgraph

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Kafka
KAFKA_BROKERS=localhost:9092

# JWT
JWT_SECRET=dev-secret-key
JWT_EXPIRES_IN=1d

# Content Sources
TWITTER_API_KEY=mock
TWITTER_API_SECRET=mock
TWITTER_BEARER_TOKEN=mock
EOL
    echo -e "${GREEN}Created apps/api/.env file.${NC}"
else
    echo -e "${GREEN}apps/api/.env file already exists.${NC}"
fi

# Frontend .env file
if [ ! -f "apps/visualization-showcase/.env" ]; then
    echo -e "Creating ${YELLOW}apps/visualization-showcase/.env${NC} file..."
    cat > apps/visualization-showcase/.env << EOL
VITE_API_URL=http://localhost:4000
EOL
    echo -e "${GREEN}Created apps/visualization-showcase/.env file.${NC}"
else
    echo -e "${GREEN}apps/visualization-showcase/.env file already exists.${NC}"
fi

echo -e "${GREEN}Environment files set up successfully.${NC}"
echo ""

# Build Docker images
echo -e "${YELLOW}Building Docker images...${NC}"
echo -e "This may take a few minutes..."
docker-compose -f docker-compose.dev.yml build
echo -e "${GREEN}Docker images built successfully.${NC}"
echo ""

# Create Docker volumes if they don't exist
echo -e "${YELLOW}Creating Docker volumes...${NC}"
docker volume create --name=memgraph-data
docker volume create --name=redis-data
echo -e "${GREEN}Docker volumes created successfully.${NC}"
echo ""

# Setup complete
echo -e "${GREEN}=======================================${NC}"
echo -e "${GREEN}  Development Environment Setup Complete ${NC}"
echo -e "${GREEN}=======================================${NC}"
echo ""
echo -e "To start the development environment, run:"
echo -e "${YELLOW}docker-compose -f docker-compose.dev.yml up${NC}"
echo ""
echo -e "To start the development environment in detached mode, run:"
echo -e "${YELLOW}docker-compose -f docker-compose.dev.yml up -d${NC}"
echo ""
echo -e "To stop the development environment, run:"
echo -e "${YELLOW}docker-compose -f docker-compose.dev.yml down${NC}"
echo ""
echo -e "Access the services at:"
echo -e "- API: ${YELLOW}http://localhost:4000${NC}"
echo -e "- Frontend: ${YELLOW}http://localhost:3000${NC}"
echo -e "- Memgraph: ${YELLOW}bolt://localhost:7687${NC}"
echo -e "- Redis Commander: ${YELLOW}http://localhost:8081${NC}"
echo -e "- Kafka UI: ${YELLOW}http://localhost:8080${NC}"
echo -e "- Twitter Mock: ${YELLOW}http://localhost:4001${NC}"
echo ""
echo -e "Happy coding! 🚀" 