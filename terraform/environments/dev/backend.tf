/**
 * # Terraform Backend Configuration
 *
 * This file configures the Terraform backend to store state in Google Cloud Storage.
 * The bucket must be created manually before running Terraform.
 */

terraform {
  backend "gcs" {
    bucket = "veritas-terraform-state"
    prefix = "dev"
  }
} 