/**
 * # GKE Module Outputs
 * 
 * Outputs from the Google Kubernetes Engine module.
 */

output "cluster_name" {
  description = "The name of the GKE cluster"
  value       = google_container_cluster.cluster.name
}

output "cluster_id" {
  description = "The ID of the GKE cluster"
  value       = google_container_cluster.cluster.id
}

output "cluster_self_link" {
  description = "The self link of the GKE cluster"
  value       = google_container_cluster.cluster.self_link
}

output "cluster_endpoint" {
  description = "The IP address of the Kubernetes master endpoint"
  value       = google_container_cluster.cluster.endpoint
  sensitive   = true
}

output "cluster_ca_certificate" {
  description = "The public certificate of the cluster CA"
  value       = base64decode(google_container_cluster.cluster.master_auth[0].cluster_ca_certificate)
  sensitive   = true
}

output "cluster_location" {
  description = "The location of the GKE cluster"
  value       = google_container_cluster.cluster.location
}

output "node_pools" {
  description = "The node pools in the GKE cluster"
  value       = google_container_node_pool.pools
}

output "service_account" {
  description = "The service account used by the GKE node pools"
  value       = google_service_account.gke_sa.email
}

output "kubectl_connection_command" {
  description = "Command to configure kubectl to connect to the cluster"
  value       = "gcloud container clusters get-credentials ${google_container_cluster.cluster.name} --region ${google_container_cluster.cluster.location} --project ${var.project_id}"
}

output "workload_identity_config" {
  description = "Workload Identity configuration"
  value       = var.enable_workload_identity ? google_container_cluster.cluster.workload_identity_config : null
} 