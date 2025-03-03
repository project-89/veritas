# Veritas Terraform Deployment Guide

This guide provides step-by-step instructions for deploying the Veritas system on Google Cloud Platform (GCP) using Terraform.

## Prerequisites

Before you begin, ensure you have the following:

1. **Google Cloud Platform Account**: You need a GCP account with billing enabled.
2. **Project**: Create a GCP project or use an existing one.
3. **Terraform**: Install [Terraform](https://www.terraform.io/downloads.html) (v1.0.0+).
4. **Google Cloud SDK**: Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install).
5. **Permissions**: Ensure you have the necessary permissions to create resources in your GCP project.

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/veritas.git
cd veritas
```

### 2. Initialize the Environment

We provide a helper script to initialize the Terraform environment. This script will:

- Authenticate with Google Cloud
- Enable required APIs
- Create a GCS bucket for Terraform state
- Create a service account for Terraform
- Initialize Terraform

Run the script with your project ID:

```bash
chmod +x terraform/scripts/init.sh
./terraform/scripts/init.sh --project-id YOUR_PROJECT_ID
```

You can customize the script with additional options:

```bash
./terraform/scripts/init.sh --project-id YOUR_PROJECT_ID --bucket-name custom-bucket-name --environment dev
```

### 3. Configure Environment Variables

Create a `terraform.tfvars` file in the environment directory (e.g., `terraform/environments/dev/terraform.tfvars`) based on the example file:

```bash
cd terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars
```

Edit the `terraform.tfvars` file to customize your deployment:

```hcl
# Project variables
project_id = "your-project-id"
region     = "us-central1"
zones      = ["us-central1-a", "us-central1-b", "us-central1-c"]

# Resource naming
environment      = "dev"
use_random_suffix = true

# Networking
subnet_cidr = "10.0.0.0/20"

# GKE configuration
node_pools = [
  {
    name         = "default-pool"
    machine_type = "e2-standard-4"
    min_count    = 1
    max_count    = 3
    auto_scaling = true
    disk_size_gb = 100
    disk_type    = "pd-standard"
    image_type   = "COS_CONTAINERD"
    preemptible  = true
  },
  {
    name         = "high-memory-pool"
    machine_type = "e2-highmem-4"
    min_count    = 1
    max_count    = 2
    auto_scaling = true
    disk_size_gb = 100
    disk_type    = "pd-standard"
    image_type   = "COS_CONTAINERD"
    preemptible  = true
  }
]

# Redis configuration
redis_memory_size = 1

# Database configuration
memgraph_replicas = 1
memgraph_storage  = 10

# Pub/Sub configuration
pubsub_topics = [
  "content.created",
  "content.updated",
  "source.verified",
  "analysis.completed",
  "narrative.detected"
]

pubsub_subscriptions = [
  {
    name                 = "content-analysis-sub"
    topic                = "content.created"
    ack_deadline_seconds = 60
  },
  {
    name                 = "narrative-detection-sub"
    topic                = "content.updated"
    ack_deadline_seconds = 60
  }
]
```

## Deployment

### 1. Plan the Deployment

Run the following command to see what resources will be created:

```bash
terraform plan
```

Review the plan to ensure it matches your expectations.

### 2. Apply the Deployment

Run the following command to create the resources:

```bash
terraform apply
```

Type `yes` when prompted to confirm the deployment.

The deployment will take approximately 15-20 minutes to complete.

### 3. Access the Cluster

After the deployment is complete, you can access the GKE cluster using the following command:

```bash
gcloud container clusters get-credentials $(terraform output -raw kubernetes_cluster_name) \
  --region $(terraform output -raw kubernetes_cluster_location) \
  --project $(terraform output -raw project_id)
```

### 4. Deploy the Veritas Application

Once the infrastructure is deployed, you can deploy the Veritas application using Kubernetes manifests or Helm charts.

```bash
kubectl apply -f kubernetes/
```

## Environment Management

### Multiple Environments

The Terraform configuration supports multiple environments (dev, staging, prod). To deploy to a different environment:

```bash
cd terraform/environments/staging
terraform init
terraform apply
```

### Updating the Environment

To update an existing environment:

1. Make changes to the `terraform.tfvars` file
2. Run `terraform plan` to see the changes
3. Run `terraform apply` to apply the changes

### Destroying the Environment

To destroy the environment:

```bash
terraform destroy
```

Type `yes` when prompted to confirm the destruction.

## Monitoring and Maintenance

### Monitoring

You can monitor your GCP resources using the Google Cloud Console or set up monitoring using Cloud Monitoring.

### Maintenance

Regular maintenance tasks include:

1. **Updating Terraform**: Keep Terraform and provider versions up to date
2. **GKE Updates**: GKE will automatically update the control plane, but you may need to update node pools
3. **Security Updates**: Regularly review and apply security updates

## Troubleshooting

### Common Issues

1. **Permission Errors**: Ensure the service account has the necessary permissions
2. **API Errors**: Ensure all required APIs are enabled
3. **Quota Errors**: Check your GCP quotas and request increases if needed

### Getting Help

If you encounter issues, check the following resources:

1. Terraform logs: Run `terraform apply -debug` for detailed logs
2. GCP logs: Check the Cloud Logging console
3. Support: Contact your organization's support team

## Security Considerations

### Best Practices

1. **Least Privilege**: Use the principle of least privilege for service accounts
2. **Network Security**: Use private clusters and restrict network access
3. **Secrets Management**: Use Secret Manager for sensitive information
4. **Audit Logging**: Enable audit logging for all resources

## Cost Optimization

### Reducing Costs

1. **Right-sizing**: Use appropriate machine types for your workload
2. **Preemptible VMs**: Use preemptible VMs for non-critical workloads
3. **Autoscaling**: Enable autoscaling to scale down during low usage
4. **Storage**: Use appropriate storage classes for your needs

## Next Steps

After deploying the infrastructure, you can:

1. Set up CI/CD pipelines for your application
2. Configure monitoring and alerting
3. Set up backup and disaster recovery
4. Implement security best practices

## Conclusion

You have successfully deployed the Veritas system on Google Cloud Platform using Terraform. This infrastructure provides a solid foundation for running the Veritas application in a scalable, secure, and maintainable way. 