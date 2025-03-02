#!/bin/bash

# Exit on error
set -e

# Check if Minikube is running
if ! minikube status | grep -q "Running"; then
  echo "Starting Minikube..."
  minikube start --driver=docker --memory=8g --cpus=4
  
  # Enable necessary addons
  echo "Enabling Ingress addon..."
  minikube addons enable ingress
  
  echo "Enabling Metrics Server addon..."
  minikube addons enable metrics-server
else
  echo "Minikube is already running"
fi

# Set docker to use Minikube's Docker daemon
echo "Configuring Docker to use Minikube's daemon..."
eval $(minikube docker-env)

# Create namespace if it doesn't exist
if ! kubectl get namespace veritas-local &> /dev/null; then
  echo "Creating veritas-local namespace..."
  kubectl create namespace veritas-local
fi

# Build API image
echo "Building API image..."
docker build -t veritas-api:dev -f apps/api/Dockerfile.dev .

# Build Frontend image
echo "Building Frontend image..."
docker build -t veritas-frontend:dev -f apps/visualization-showcase/Dockerfile.dev .

# Apply Kubernetes manifests
echo "Applying Kubernetes manifests..."
kubectl apply -f kubernetes/local/veritas.yaml

# Wait for deployments to be ready
echo "Waiting for deployments to be ready..."
kubectl -n veritas-local wait --for=condition=available --timeout=300s deployment/veritas-api
kubectl -n veritas-local wait --for=condition=available --timeout=300s deployment/veritas-frontend
kubectl -n veritas-local wait --for=condition=available --timeout=300s deployment/veritas-redis
kubectl -n veritas-local wait --for=condition=available --timeout=300s deployment/veritas-zookeeper
kubectl -n veritas-local wait --for=condition=available --timeout=300s deployment/veritas-kafka

# Wait for statefulsets to be ready
echo "Waiting for statefulsets to be ready..."
kubectl -n veritas-local wait --for=condition=ready --timeout=300s pod/veritas-memgraph-0

# Add host entry to /etc/hosts if not already present
if ! grep -q "veritas.local" /etc/hosts; then
  echo "Adding veritas.local to /etc/hosts..."
  echo "$(minikube ip) veritas.local" | sudo tee -a /etc/hosts
fi

# Set up port forwarding for easy access
echo "Setting up port forwarding..."
echo "API will be available at http://localhost:4000"
echo "Frontend will be available at http://localhost:3000"
echo "Memgraph will be available at http://localhost:7687"

# Kill any existing port-forward processes
pkill -f "kubectl port-forward" || true

# Start port forwarding in the background
kubectl -n veritas-local port-forward svc/veritas-api 4000:80 &
kubectl -n veritas-local port-forward svc/veritas-frontend 3000:80 &
kubectl -n veritas-local port-forward svc/veritas-memgraph 7687:7687 &
kubectl -n veritas-local port-forward svc/veritas-redis 6379:6379 &

echo "Deployment complete! The Veritas system is now running in Minikube."
echo "You can access the services at:"
echo "  - Frontend: http://localhost:3000"
echo "  - API: http://localhost:4000"
echo "  - Memgraph: bolt://localhost:7687"
echo "  - Redis: redis://localhost:6379"
echo ""
echo "To view the Kubernetes dashboard, run: minikube dashboard"
echo "To stop port forwarding, run: pkill -f \"kubectl port-forward\"" 