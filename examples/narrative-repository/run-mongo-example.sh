#!/bin/bash

# Start MongoDB containers if they're not running
if ! docker ps | grep -q veritas-mongodb; then
  echo "Starting MongoDB containers..."
  docker-compose -f docker-compose.mongodb.yml up -d
  
  # Wait for MongoDB to be ready
  echo "Waiting for MongoDB to start..."
  sleep 5
else
  echo "MongoDB containers are already running."
fi

# Compile and run the example
echo "Compiling and running the example..."
npx ts-node examples/narrative-repository/mongo-sample-app.ts

# Check if we should stop MongoDB after running the example
if [ "$1" == "--stop-after" ]; then
  echo "Stopping MongoDB containers..."
  docker-compose -f docker-compose.mongodb.yml down
fi 