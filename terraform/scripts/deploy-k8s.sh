#!/bin/bash

# Kubernetes Deployment Script for Veritas
# This script deploys Kubernetes resources for the Veritas system after the infrastructure is set up.

set -e

# Default values
PROJECT_ID=""
ENVIRONMENT="dev"
NAMESPACE="veritas"
APPLY_MANIFESTS=false
INSTALL_HELM=false
INSTALL_CERT_MANAGER=false
INSTALL_INGRESS=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    --project-id)
      PROJECT_ID="$2"
      shift
      shift
      ;;
    --environment)
      ENVIRONMENT="$2"
      shift
      shift
      ;;
    --namespace)
      NAMESPACE="$2"
      shift
      shift
      ;;
    --apply-manifests)
      APPLY_MANIFESTS=true
      shift
      ;;
    --install-helm)
      INSTALL_HELM=true
      shift
      ;;
    --install-cert-manager)
      INSTALL_CERT_MANAGER=true
      shift
      ;;
    --install-ingress)
      INSTALL_INGRESS=true
      shift
      ;;
    --help)
      echo "Usage: $0 --project-id PROJECT_ID [--environment ENVIRONMENT] [--namespace NAMESPACE] [--apply-manifests] [--install-helm] [--install-cert-manager] [--install-ingress]"
      echo ""
      echo "Options:"
      echo "  --project-id PROJECT_ID        GCP project ID (required)"
      echo "  --environment ENVIRONMENT      Environment to deploy to (default: dev)"
      echo "  --namespace NAMESPACE          Kubernetes namespace to deploy to (default: veritas)"
      echo "  --apply-manifests              Apply Kubernetes manifests"
      echo "  --install-helm                 Install Helm and Tiller"
      echo "  --install-cert-manager         Install cert-manager"
      echo "  --install-ingress              Install NGINX Ingress Controller"
      echo "  --help                         Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $key"
      echo "Use --help for usage information."
      exit 1
      ;;
  esac
done

# Check if project ID is provided
if [ -z "$PROJECT_ID" ]; then
  echo "Error: Project ID is required."
  echo "Use --help for usage information."
  exit 1
fi

echo "Deploying Kubernetes resources for Veritas..."
echo "Project ID: $PROJECT_ID"
echo "Environment: $ENVIRONMENT"
echo "Namespace: $NAMESPACE"

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
  echo "Error: kubectl is not installed."
  echo "Please install kubectl: https://kubernetes.io/docs/tasks/tools/install-kubectl/"
  exit 1
fi

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
  echo "Error: gcloud CLI is not installed."
  echo "Please install the Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

# Get Terraform outputs
cd "../environments/$ENVIRONMENT"
CLUSTER_NAME=$(terraform output -raw kubernetes_cluster_name)
CLUSTER_LOCATION=$(terraform output -raw kubernetes_cluster_location)

# Configure kubectl to connect to the cluster
echo "Configuring kubectl to connect to the cluster..."
gcloud container clusters get-credentials "$CLUSTER_NAME" --region "$CLUSTER_LOCATION" --project "$PROJECT_ID"

# Create namespace if it doesn't exist
echo "Creating namespace $NAMESPACE if it doesn't exist..."
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

# Set the current namespace
kubectl config set-context --current --namespace="$NAMESPACE"

# Install Helm if requested
if [ "$INSTALL_HELM" = true ]; then
  echo "Installing Helm..."
  if ! command -v helm &> /dev/null; then
    echo "Helm is not installed. Installing Helm..."
    curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
  else
    echo "Helm is already installed."
  fi
  
  echo "Initializing Helm..."
  helm repo add stable https://charts.helm.sh/stable
  helm repo update
fi

# Install cert-manager if requested
if [ "$INSTALL_CERT_MANAGER" = true ]; then
  echo "Installing cert-manager..."
  kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.11.0/cert-manager.yaml
  
  # Wait for cert-manager to be ready
  echo "Waiting for cert-manager to be ready..."
  kubectl wait --for=condition=ready pod -l app=cert-manager --namespace cert-manager --timeout=300s
  kubectl wait --for=condition=ready pod -l app=cainjector --namespace cert-manager --timeout=300s
  kubectl wait --for=condition=ready pod -l app=webhook --namespace cert-manager --timeout=300s
fi

# Install NGINX Ingress Controller if requested
if [ "$INSTALL_INGRESS" = true ]; then
  echo "Installing NGINX Ingress Controller..."
  helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
  helm repo update
  helm install nginx-ingress ingress-nginx/ingress-nginx \
    --namespace "$NAMESPACE" \
    --set controller.publishService.enabled=true
  
  # Wait for Ingress Controller to be ready
  echo "Waiting for NGINX Ingress Controller to be ready..."
  kubectl wait --for=condition=ready pod -l app.kubernetes.io/component=controller --namespace "$NAMESPACE" --timeout=300s
fi

# Apply Kubernetes manifests if requested
if [ "$APPLY_MANIFESTS" = true ]; then
  echo "Applying Kubernetes manifests..."
  
  # Create ConfigMaps from Terraform outputs
  echo "Creating ConfigMaps from Terraform outputs..."
  
  # Redis ConfigMap
  REDIS_HOST=$(terraform output -raw redis_host)
  REDIS_PORT=$(terraform output -raw redis_port)
  
  cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: redis-config
  namespace: $NAMESPACE
data:
  REDIS_HOST: "$REDIS_HOST"
  REDIS_PORT: "$REDIS_PORT"
EOF
  
  # Apply Kubernetes manifests
  echo "Applying Kubernetes manifests..."
  kubectl apply -f ../../kubernetes/
fi

echo "Kubernetes resources deployed successfully!"
echo ""
echo "Next steps:"
echo "1. Access the Veritas application at the Ingress IP address"
echo "2. Configure DNS to point to the Ingress IP address"
echo "3. Set up monitoring and logging" 