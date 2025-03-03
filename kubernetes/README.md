# Veritas Kubernetes Manifests

This directory contains Kubernetes manifests for deploying the Veritas system on Google Kubernetes Engine (GKE).

## Overview

The Veritas system consists of the following components:

- **API**: Backend API service for data processing and analysis
- **Frontend**: Web interface for visualizing and interacting with the data
- **Memgraph**: Graph database for storing and querying narrative data
- **Redis**: In-memory cache for performance optimization
- **Kafka**: Message broker for event-driven architecture

## Prerequisites

Before deploying these manifests, ensure you have:

1. A running GKE cluster (deployed via Terraform)
2. `kubectl` configured to connect to your cluster
3. Container images built and pushed to Google Container Registry (GCR)
4. NGINX Ingress Controller installed (optional, for external access)
5. cert-manager installed (optional, for TLS)

## Deployment

### 1. Update Image References

Before deploying, update the image references in the manifests to point to your GCR repository:

```bash
# Replace PROJECT_ID with your actual GCP project ID
sed -i 's/gcr.io\/PROJECT_ID/gcr.io\/your-project-id/g' veritas-deployment.yaml
```

### 2. Create Secrets

Create a Kubernetes secret for sensitive information:

```bash
kubectl create secret generic veritas-secrets \
  --namespace veritas \
  --from-literal=MEMGRAPH_PASSWORD=your-memgraph-password \
  --from-literal=REDIS_AUTH=your-redis-auth-string \
  --from-literal=JWT_SECRET=your-jwt-secret
```

### 3. Deploy the Manifests

Deploy the manifests using `kubectl`:

```bash
kubectl apply -f veritas-deployment.yaml
```

Or use our deployment script:

```bash
../terraform/scripts/deploy-k8s.sh --project-id your-project-id --apply-manifests
```

### 4. Verify the Deployment

Check that all pods are running:

```bash
kubectl get pods -n veritas
```

Check the services:

```bash
kubectl get services -n veritas
```

Check the ingress:

```bash
kubectl get ingress -n veritas
```

## Configuration

### ConfigMaps

The `veritas-config` ConfigMap contains configuration for the application. You can modify it to suit your needs:

```bash
kubectl edit configmap veritas-config -n veritas
```

### Scaling

The deployments include HorizontalPodAutoscalers (HPAs) that automatically scale the pods based on CPU and memory usage. You can modify the scaling parameters:

```bash
kubectl edit hpa veritas-api-hpa -n veritas
kubectl edit hpa veritas-frontend-hpa -n veritas
```

### Resource Limits

The resource requests and limits are set to reasonable defaults. You can adjust them based on your workload:

```bash
kubectl edit deployment veritas-api -n veritas
kubectl edit deployment veritas-frontend -n veritas
kubectl edit statefulset memgraph -n veritas
```

## Customization

### Ingress

The Ingress resource is configured to use NGINX Ingress Controller and Let's Encrypt for TLS. Update the host and annotations as needed:

```bash
kubectl edit ingress veritas-ingress -n veritas
```

### Storage

The Memgraph StatefulSet uses a PersistentVolumeClaim for data storage. You can adjust the storage size and class:

```bash
# Note: Changing storage for an existing StatefulSet requires additional steps
kubectl edit statefulset memgraph -n veritas
```

## Troubleshooting

### Checking Logs

View logs for a specific pod:

```bash
kubectl logs -f <pod-name> -n veritas
```

### Debugging

Execute a shell in a pod for debugging:

```bash
kubectl exec -it <pod-name> -n veritas -- /bin/sh
```

### Common Issues

1. **Pods not starting**: Check events with `kubectl get events -n veritas`
2. **Service not accessible**: Check service endpoints with `kubectl get endpoints -n veritas`
3. **Ingress not working**: Check ingress controller logs and configuration

## Maintenance

### Updating Images

To update the application to a new version:

```bash
kubectl set image deployment/veritas-api api=gcr.io/your-project-id/veritas-api:new-tag -n veritas
kubectl set image deployment/veritas-frontend frontend=gcr.io/your-project-id/veritas-frontend:new-tag -n veritas
```

### Backup and Restore

For Memgraph data, you can create a backup:

```bash
# Create a backup job
kubectl apply -f memgraph-backup-job.yaml
```

## Next Steps

After deploying the Veritas system, you can:

1. Set up monitoring with Prometheus and Grafana
2. Configure logging with Stackdriver or EFK stack
3. Implement CI/CD pipelines for automated deployment
4. Set up regular backups for persistent data 