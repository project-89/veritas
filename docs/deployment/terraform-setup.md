# Terraform Setup Guide for Veritas on GCP

## Overview

This guide outlines the Terraform configuration for deploying the Veritas system on Google Cloud Platform (GCP). The infrastructure is defined as code using Terraform, enabling consistent, repeatable deployments and infrastructure management.

## Prerequisites

- GCP account with billing enabled
- GCP project with required APIs enabled
- Terraform CLI (version 1.0.0+) installed
- Google Cloud SDK installed
- Service account with appropriate permissions

## Project Structure

```
terraform/
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── terraform.tfvars
│   ├── staging/
│   │   └── ...
│   └── prod/
│       └── ...
├── modules/
│   ├── gke/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── database/
│   │   └── ...
│   ├── networking/
│   │   └── ...
│   ├── memorystore/
│   │   └── ...
│   ├── pubsub/
│   │   └── ...
│   └── storage/
│       └── ...
├── scripts/
│   ├── init.sh
│   └── apply.sh
└── README.md
```

## Getting Started

### 1. Initialize the Project

```bash
# Clone the repository
git clone <repository-url>
cd veritas/terraform

# Set up GCP authentication
gcloud auth application-default login

# Initialize Terraform
cd environments/dev
terraform init
```

### 2. Configure Variables

Edit the `terraform.tfvars` file in your environment directory to set the required variables:

```hcl
# terraform.tfvars
project_id         = "veritas-dev-123456"
region             = "us-central1"
zones              = ["us-central1-a", "us-central1-b", "us-central1-c"]
cluster_name       = "veritas-cluster"
node_count         = 3
machine_type       = "e2-standard-4"
redis_memory_size  = 4
```

## Core Infrastructure Modules

### GKE Cluster

The GKE module creates a Kubernetes cluster for running the Veritas application components:

```hcl
module "gke" {
  source       = "../../modules/gke"
  project_id   = var.project_id
  region       = var.region
  zones        = var.zones
  cluster_name = var.cluster_name
  node_count   = var.node_count
  machine_type = var.machine_type
  
  # Network configuration
  network    = module.networking.network_name
  subnetwork = module.networking.subnet_name
  
  # Node pool configuration
  node_pools = [
    {
      name         = "default-pool"
      machine_type = "e2-standard-4"
      min_count    = 3
      max_count    = 10
      auto_scaling = true
      disk_size_gb = 100
      disk_type    = "pd-standard"
      image_type   = "COS_CONTAINERD"
      preemptible  = false
    },
    {
      name         = "high-memory-pool"
      machine_type = "e2-highmem-8"
      min_count    = 1
      max_count    = 5
      auto_scaling = true
      disk_size_gb = 200
      disk_type    = "pd-ssd"
      image_type   = "COS_CONTAINERD"
      preemptible  = false
    }
  ]
}
```

### Networking

The networking module sets up the VPC, subnets, and firewall rules:

```hcl
module "networking" {
  source     = "../../modules/networking"
  project_id = var.project_id
  region     = var.region
  
  network_name = "veritas-network"
  subnets = [
    {
      name          = "veritas-subnet"
      ip_cidr_range = "10.0.0.0/20"
      region        = var.region
    }
  ]
  
  # Firewall rules
  firewall_rules = [
    {
      name        = "allow-internal"
      description = "Allow internal traffic"
      direction   = "INGRESS"
      ranges      = ["10.0.0.0/20"]
      allow = [
        {
          protocol = "tcp"
          ports    = ["0-65535"]
        },
        {
          protocol = "udp"
          ports    = ["0-65535"]
        },
        {
          protocol = "icmp"
        }
      ]
    }
  ]
}
```

### Database (Memgraph)

For the graph database (Memgraph), we'll deploy it on GKE using StatefulSets:

```hcl
module "memgraph" {
  source       = "../../modules/database"
  project_id   = var.project_id
  cluster_name = module.gke.cluster_name
  
  # Memgraph configuration
  memgraph_replicas = 3
  memgraph_storage  = 100 # GB
  memgraph_version  = "2.4.1"
  
  # Persistence
  storage_class = "standard"
  backup_bucket = "${var.project_id}-memgraph-backups"
}
```

### Redis (Memorystore)

For caching, we'll use Google Cloud Memorystore for Redis:

```hcl
module "redis" {
  source     = "../../modules/memorystore"
  project_id = var.project_id
  region     = var.region
  
  # Redis configuration
  name           = "veritas-redis"
  memory_size_gb = var.redis_memory_size
  tier           = "STANDARD_HA"
  redis_version  = "REDIS_6_X"
  
  # Network
  authorized_network = module.networking.network_id
}
```

### Pub/Sub

For the messaging system, we'll use Google Cloud Pub/Sub:

```hcl
module "pubsub" {
  source     = "../../modules/pubsub"
  project_id = var.project_id
  
  # Topics
  topics = [
    "content.created",
    "content.updated",
    "source.verified",
    "analysis.completed",
    "narrative.detected"
  ]
  
  # Subscriptions
  subscriptions = [
    {
      name  = "content-analysis-sub"
      topic = "content.created"
      ack_deadline_seconds = 60
    },
    {
      name  = "narrative-detection-sub"
      topic = "content.updated"
      ack_deadline_seconds = 60
    }
  ]
}
```

### Storage

For object storage, we'll use Google Cloud Storage:

```hcl
module "storage" {
  source     = "../../modules/storage"
  project_id = var.project_id
  region     = var.region
  
  # Buckets
  buckets = [
    {
      name          = "${var.project_id}-assets"
      storage_class = "STANDARD"
      versioning    = true
    },
    {
      name          = "${var.project_id}-backups"
      storage_class = "NEARLINE"
      versioning    = false
      lifecycle_rules = [
        {
          action = {
            type = "Delete"
          }
          condition = {
            age = 90 # days
          }
        }
      ]
    }
  ]
}
```

## Deployment Process

### 1. Plan the Deployment

```bash
terraform plan -out=tfplan
```

Review the plan to ensure it matches your expectations.

### 2. Apply the Configuration

```bash
terraform apply tfplan
```

### 3. Access the Cluster

After deployment, configure kubectl to access the GKE cluster:

```bash
gcloud container clusters get-credentials $(terraform output -raw cluster_name) \
    --region $(terraform output -raw region) \
    --project $(terraform output -raw project_id)
```

## Managing Multiple Environments

For different environments (dev, staging, prod), use separate state files and variable configurations:

```bash
# For development
cd environments/dev
terraform apply

# For staging
cd environments/staging
terraform apply

# For production
cd environments/prod
terraform apply
```

## Remote State Management

Store the Terraform state in a GCS bucket for team collaboration:

```hcl
# In each environment's main.tf
terraform {
  backend "gcs" {
    bucket = "veritas-terraform-state"
    prefix = "env/dev"  # Different prefix for each environment
  }
}
```

## CI/CD Integration

Integrate Terraform with your CI/CD pipeline for automated infrastructure deployment:

```yaml
# Example GitHub Actions workflow
name: Deploy Infrastructure

on:
  push:
    branches: [ main ]
    paths:
      - 'terraform/**'

jobs:
  terraform:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v1
        
      - name: Terraform Init
        run: |
          cd terraform/environments/dev
          terraform init
          
      - name: Terraform Plan
        run: |
          cd terraform/environments/dev
          terraform plan -out=tfplan
          
      - name: Terraform Apply
        if: github.ref == 'refs/heads/main'
        run: |
          cd terraform/environments/dev
          terraform apply -auto-approve tfplan
```

## Cost Optimization

Implement cost optimization strategies in your Terraform configuration:

- Use preemptible VMs for non-critical workloads
- Set up autoscaling to match demand
- Implement lifecycle policies for storage
- Use committed use discounts for predictable workloads

## Security Best Practices

- Use service accounts with minimal permissions
- Enable VPC Service Controls
- Implement network policies
- Use Secret Manager for sensitive information
- Enable Cloud Audit Logs

## Next Steps

After deploying the infrastructure, proceed with:

1. Deploying Kubernetes manifests for application components
2. Setting up CI/CD for application deployment
3. Configuring monitoring and alerting
4. Implementing backup and disaster recovery procedures

## Troubleshooting

Common issues and their solutions:

- **Permission errors**: Ensure your service account has the necessary roles
- **Quota limits**: Request quota increases if needed
- **Dependency issues**: Check the order of resource creation
- **State lock issues**: Release the state lock if a previous operation was interrupted 