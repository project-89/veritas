/**
 * # GKE Module Variables
 * 
 * Variables for the Google Kubernetes Engine module.
 */

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region for the GKE cluster"
  type        = string
}

variable "zones" {
  description = "The GCP zones for the GKE cluster nodes"
  type        = list(string)
  default     = []
}

variable "network_name" {
  description = "The name of the VPC network"
  type        = string
}

variable "subnet_name" {
  description = "The name of the subnet for the GKE cluster"
  type        = string
}

variable "cluster_name" {
  description = "The name of the GKE cluster"
  type        = string
}

variable "cluster_description" {
  description = "The description of the GKE cluster"
  type        = string
  default     = "GKE cluster for Veritas system"
}

variable "kubernetes_version" {
  description = "The Kubernetes version for the GKE cluster"
  type        = string
  default     = "latest"
}

variable "enable_private_nodes" {
  description = "Whether to enable private nodes"
  type        = bool
  default     = true
}

variable "enable_private_endpoint" {
  description = "Whether to enable private endpoint"
  type        = bool
  default     = false
}

variable "master_ipv4_cidr_block" {
  description = "The IP range for the GKE master network"
  type        = string
  default     = "172.16.0.0/28"
}

variable "node_pools" {
  description = "List of node pool configurations"
  type = list(object({
    name         = string
    machine_type = string
    min_count    = number
    max_count    = number
    auto_scaling = bool
    disk_size_gb = number
    disk_type    = string
    image_type   = string
    preemptible  = bool
    labels       = optional(map(string))
    taints       = optional(list(object({
      key    = string
      value  = string
      effect = string
    })))
  }))
  default = []
}

variable "enable_workload_identity" {
  description = "Whether to enable Workload Identity"
  type        = bool
  default     = true
}

variable "enable_network_policy" {
  description = "Whether to enable Kubernetes Network Policy"
  type        = bool
  default     = true
}

variable "enable_binary_authorization" {
  description = "Whether to enable Binary Authorization"
  type        = bool
  default     = false
}

variable "enable_shielded_nodes" {
  description = "Whether to enable Shielded Nodes"
  type        = bool
  default     = true
}

variable "enable_intranode_visibility" {
  description = "Whether to enable intra-node visibility"
  type        = bool
  default     = true
}

variable "enable_vertical_pod_autoscaling" {
  description = "Whether to enable Vertical Pod Autoscaling"
  type        = bool
  default     = true
}

variable "maintenance_start_time" {
  description = "The start time for maintenance window (RFC3339 format)"
  type        = string
  default     = "2022-01-01T00:00:00Z"
}

variable "maintenance_end_time" {
  description = "The end time for maintenance window (RFC3339 format)"
  type        = string
  default     = "2022-01-01T04:00:00Z"
}

variable "maintenance_recurrence" {
  description = "The recurrence of the maintenance window (RRULE format)"
  type        = string
  default     = "FREQ=WEEKLY;BYDAY=SA,SU"
}

variable "resource_labels" {
  description = "The labels to attach to the GKE cluster"
  type        = map(string)
  default     = {}
} 