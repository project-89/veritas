/**
 * # Outputs for Veritas Development Environment
 *
 * This file defines all outputs from the development environment.
 */

# GKE outputs
output "kubernetes_cluster_name" {
  description = "GKE cluster name"
  value       = module.gke.cluster_name
}

output "kubernetes_cluster_endpoint" {
  description = "GKE cluster endpoint"
  value       = module.gke.endpoint
}

output "kubernetes_cluster_location" {
  description = "GKE cluster location"
  value       = module.gke.location
}

# For connecting to the GKE cluster
output "kubectl_connection_command" {
  description = "Command to configure kubectl to connect to the GKE cluster"
  value       = "gcloud container clusters get-credentials ${module.gke.cluster_name} --region ${var.region} --project ${var.project_id}"
}

# Networking outputs
output "network_name" {
  description = "The name of the VPC network"
  value       = module.networking.network_name
}

output "subnet_name" {
  description = "The name of the subnet"
  value       = module.networking.subnet_name
}

# Redis outputs
output "redis_instance_name" {
  description = "The name of the Redis instance"
  value       = module.redis.instance_name
}

output "redis_host" {
  description = "The IP address of the Redis instance"
  value       = module.redis.host
}

output "redis_port" {
  description = "The port of the Redis instance"
  value       = module.redis.port
}

# Pub/Sub outputs
output "pubsub_topic_names" {
  description = "The names of the Pub/Sub topics"
  value       = module.pubsub.topic_names
}

output "pubsub_subscription_names" {
  description = "The names of the Pub/Sub subscriptions"
  value       = module.pubsub.subscription_names
}

# Storage outputs
output "storage_bucket_names" {
  description = "The names of the storage buckets"
  value       = module.storage.bucket_names
}

# Database outputs
output "memgraph_service_name" {
  description = "The name of the Memgraph service"
  value       = module.database.service_name
}

output "memgraph_connection_string" {
  description = "The connection string for Memgraph"
  value       = module.database.connection_string
  sensitive   = true
} 