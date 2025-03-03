/**
 * # Veritas Development Environment
 *
 * This Terraform configuration deploys the Veritas infrastructure in the development environment.
 */

terraform {
  required_version = ">= 1.0.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 4.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# Configure the Kubernetes provider after the GKE cluster is created
provider "kubernetes" {
  host                   = "https://${module.gke.endpoint}"
  token                  = data.google_client_config.default.access_token
  cluster_ca_certificate = base64decode(module.gke.ca_certificate)
}

data "google_client_config" "default" {}

# Random suffix for resource names to avoid conflicts
resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  resource_suffix = var.use_random_suffix ? random_id.suffix.hex : ""
}

# Networking module - Creates VPC, subnets, and firewall rules
module "networking" {
  source     = "../../modules/networking"
  project_id = var.project_id
  region     = var.region
  
  network_name = "veritas-network-${var.environment}${local.resource_suffix}"
  subnets = [
    {
      name          = "veritas-subnet-${var.environment}"
      ip_cidr_range = var.subnet_cidr
      region        = var.region
    }
  ]
}

# GKE module - Creates Kubernetes cluster
module "gke" {
  source       = "../../modules/gke"
  project_id   = var.project_id
  region       = var.region
  zones        = var.zones
  cluster_name = "veritas-cluster-${var.environment}${local.resource_suffix}"
  
  network    = module.networking.network_name
  subnetwork = module.networking.subnet_name
  
  node_pools = var.node_pools
  
  depends_on = [module.networking]
}

# Redis (Memorystore) module
module "redis" {
  source     = "../../modules/memorystore"
  project_id = var.project_id
  region     = var.region
  
  name           = "veritas-redis-${var.environment}${local.resource_suffix}"
  memory_size_gb = var.redis_memory_size
  
  authorized_network = module.networking.network_id
  
  depends_on = [module.networking]
}

# Pub/Sub module
module "pubsub" {
  source     = "../../modules/pubsub"
  project_id = var.project_id
  
  topics        = var.pubsub_topics
  subscriptions = var.pubsub_subscriptions
}

# Storage module
module "storage" {
  source     = "../../modules/storage"
  project_id = var.project_id
  region     = var.region
  
  buckets = [
    {
      name     = "veritas-assets-${var.environment}${local.resource_suffix}"
      location = var.region
    },
    {
      name     = "veritas-backups-${var.environment}${local.resource_suffix}"
      location = var.region
    }
  ]
}

# Database module (Memgraph on GKE)
module "database" {
  source       = "../../modules/database"
  project_id   = var.project_id
  
  cluster_name     = module.gke.cluster_name
  memgraph_replicas = var.memgraph_replicas
  memgraph_storage  = var.memgraph_storage
  
  backup_bucket = module.storage.bucket_names["veritas-backups-${var.environment}${local.resource_suffix}"]
  
  depends_on = [module.gke, module.storage]
} 