# Veritas Infrastructure as Code

This directory contains the Terraform configuration for deploying the Veritas system on Google Cloud Platform (GCP).

## Directory Structure

```
terraform/
├── environments/         # Environment-specific configurations
│   ├── dev/              # Development environment
│   ├── staging/          # Staging/QA environment
│   └── prod/             # Production environment
├── modules/              # Reusable Terraform modules
│   ├── gke/              # Google Kubernetes Engine
│   ├── database/         # Database (Memgraph)
│   ├── networking/       # VPC, subnets, firewall rules
│   ├── memorystore/      # Redis cache
│   ├── pubsub/           # Pub/Sub messaging
│   └── storage/          # Cloud Storage
└── scripts/              # Helper scripts
```

## Prerequisites

- [Terraform](https://www.terraform.io/downloads.html) (v1.0.0+)
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
- GCP account with billing enabled
- GCP project with required APIs enabled:
  - Compute Engine API
  - Kubernetes Engine API
  - Cloud SQL Admin API
  - Redis API
  - Pub/Sub API
  - Cloud Storage API
  - IAM API
  - Cloud Resource Manager API

## Getting Started

### Authentication

Before running Terraform, authenticate with Google Cloud:

```bash
gcloud auth application-default login
```

### Initialize Terraform

```bash
cd terraform/environments/dev
terraform init
```

### Plan and Apply

```bash
# Review the changes
terraform plan

# Apply the changes
terraform apply
```

## Environment Configuration

Each environment directory contains:

- `main.tf` - Main configuration file that calls modules
- `variables.tf` - Input variables
- `outputs.tf` - Output values
- `terraform.tfvars` - Variable values (gitignored for sensitive data)
- `backend.tf` - Terraform backend configuration

## Module Usage

Example of using a module:

```hcl
module "gke" {
  source       = "../../modules/gke"
  project_id   = var.project_id
  region       = var.region
  cluster_name = var.cluster_name
  # Other variables...
}
```

## State Management

We use Google Cloud Storage for remote state management. The bucket is created manually before running Terraform:

```bash
gsutil mb -p [PROJECT_ID] gs://veritas-terraform-state
gsutil versioning set on gs://veritas-terraform-state
```

## Security Considerations

- Sensitive values should be stored in Secret Manager or provided via CI/CD variables
- Use service accounts with minimal permissions
- Enable audit logging for all resources
- Follow the principle of least privilege for IAM roles

## Contributing

When contributing to the infrastructure code:

1. Create a new branch for your changes
2. Test changes in the dev environment first
3. Use `terraform fmt` to format your code
4. Use `terraform validate` to check for errors
5. Run `terraform plan` to review changes
6. Submit a pull request with a detailed description of your changes

## Best Practices

- Keep modules small and focused on a single responsibility
- Use consistent naming conventions
- Document all variables and outputs
- Use data sources instead of hardcoded values when possible
- Tag all resources appropriately
- Use variables for all environment-specific values
- Lock provider and module versions

## License

This code is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details. 