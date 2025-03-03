/**
 * # Outputs for Networking Module
 *
 * This file defines all outputs from the networking module.
 */

output "network_name" {
  description = "The name of the VPC network"
  value       = google_compute_network.network.name
}

output "network_id" {
  description = "The ID of the VPC network"
  value       = google_compute_network.network.id
}

output "network_self_link" {
  description = "The self link of the VPC network"
  value       = google_compute_network.network.self_link
}

output "subnet_names" {
  description = "The names of the subnets"
  value       = { for k, v in google_compute_subnetwork.subnets : k => v.name }
}

output "subnet_self_links" {
  description = "The self links of the subnets"
  value       = { for k, v in google_compute_subnetwork.subnets : k => v.self_link }
}

output "subnet_regions" {
  description = "The regions of the subnets"
  value       = { for k, v in google_compute_subnetwork.subnets : k => v.region }
}

output "subnet_cidrs" {
  description = "The CIDR ranges of the subnets"
  value       = { for k, v in google_compute_subnetwork.subnets : k => v.ip_cidr_range }
}

output "subnet_name" {
  description = "The name of the first subnet (for backward compatibility)"
  value       = length(var.subnets) > 0 ? google_compute_subnetwork.subnets[var.subnets[0].name].name : null
}

output "subnet_self_link" {
  description = "The self link of the first subnet (for backward compatibility)"
  value       = length(var.subnets) > 0 ? google_compute_subnetwork.subnets[var.subnets[0].name].self_link : null
}

output "firewall_rule_names" {
  description = "The names of the firewall rules"
  value       = { for k, v in google_compute_firewall.rules : k => v.name }
}

output "firewall_rule_self_links" {
  description = "The self links of the firewall rules"
  value       = { for k, v in google_compute_firewall.rules : k => v.self_link }
} 