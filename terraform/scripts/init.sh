#!/bin/bash

# Terraform Initialization Script for Veritas
# This script initializes the Terraform environment for Veritas deployment.

set -e

# Default values
PROJECT_ID=""
BUCKET_NAME="veritas-terraform-state"
ENVIRONMENT="dev"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    --project-id)
      PROJECT_ID="$2"
      shift
      shift
      ;;
    --bucket-name)
      BUCKET_NAME="$2"
      shift
      shift
      ;;
    --environment)
      ENVIRONMENT="$2"
      shift
      shift
      ;;
    --help)
      echo "Usage: $0 --project-id PROJECT_ID [--bucket-name BUCKET_NAME] [--environment ENVIRONMENT]"
      echo ""
      echo "Options:"
      echo "  --project-id PROJECT_ID    GCP project ID (required)"
      echo "  --bucket-name BUCKET_NAME  Name of the GCS bucket for Terraform state (default: veritas-terraform-state)"
      echo "  --environment ENVIRONMENT  Environment to initialize (default: dev)"
      echo "  --help                     Show this help message"
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

echo "Initializing Terraform environment for Veritas..."
echo "Project ID: $PROJECT_ID"
echo "Bucket Name: $BUCKET_NAME"
echo "Environment: $ENVIRONMENT"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
  echo "Error: gcloud CLI is not installed."
  echo "Please install the Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

# Check if terraform is installed
if ! command -v terraform &> /dev/null; then
  echo "Error: terraform is not installed."
  echo "Please install Terraform: https://www.terraform.io/downloads.html"
  exit 1
fi

# Authenticate with Google Cloud
echo "Authenticating with Google Cloud..."
gcloud auth application-default login

# Set the project
echo "Setting project to $PROJECT_ID..."
gcloud config set project "$PROJECT_ID"

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable compute.googleapis.com
gcloud services enable container.googleapis.com
gcloud services enable servicenetworking.googleapis.com
gcloud services enable cloudresourcemanager.googleapis.com
gcloud services enable iam.googleapis.com
gcloud services enable redis.googleapis.com
gcloud services enable pubsub.googleapis.com
gcloud services enable storage-api.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Create GCS bucket for Terraform state if it doesn't exist
echo "Checking if Terraform state bucket exists..."
if ! gsutil ls -b "gs://$BUCKET_NAME" &> /dev/null; then
  echo "Creating Terraform state bucket: $BUCKET_NAME..."
  gsutil mb -p "$PROJECT_ID" "gs://$BUCKET_NAME"
  gsutil versioning set on "gs://$BUCKET_NAME"
else
  echo "Terraform state bucket already exists."
fi

# Create a service account for Terraform if it doesn't exist
SA_NAME="terraform-deployer"
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

echo "Checking if Terraform service account exists..."
if ! gcloud iam service-accounts describe "$SA_EMAIL" &> /dev/null; then
  echo "Creating Terraform service account: $SA_EMAIL..."
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Terraform Deployer"
  
  # Grant necessary permissions
  echo "Granting permissions to the service account..."
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/owner"
else
  echo "Terraform service account already exists."
fi

# Create a key for the service account if requested
read -p "Do you want to create a key for the service account? (y/n) " CREATE_KEY
if [[ "$CREATE_KEY" == "y" ]]; then
  echo "Creating key for service account..."
  gcloud iam service-accounts keys create "terraform-key.json" \
    --iam-account="$SA_EMAIL"
  echo "Key created: terraform-key.json"
  echo "IMPORTANT: Keep this key secure and do not commit it to version control!"
fi

# Initialize Terraform
echo "Initializing Terraform..."
cd "../environments/$ENVIRONMENT"
terraform init

echo "Terraform environment initialized successfully!"
echo ""
echo "Next steps:"
echo "1. Navigate to the environment directory: cd ../environments/$ENVIRONMENT"
echo "2. Create a terraform.tfvars file based on the example"
echo "3. Run terraform plan to see what will be created"
echo "4. Run terraform apply to create the resources" 