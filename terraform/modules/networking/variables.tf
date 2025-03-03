/**
 * # Variables for Networking Module
 *
 * This file defines all variables used in the networking module.
 */

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region for the subnet"
  type        = string
}

variable "network_name" {
  description = "The name of the VPC network"
  type        = string
}

variable "subnets" {
  description = "List of subnet configurations"
  type = list(object({
    name          = string
    ip_cidr_range = string
    region        = string
  }))
}

variable "enable_flow_logs" {
  description = "Whether to enable flow logs for the subnets"
  type        = bool
  default     = false
}

variable "firewall_rules" {
  description = "List of firewall rule configurations"
  type = list(object({
    name        = string
    description = string
    direction   = string
    ranges      = list(string)
    allow = list(object({
      protocol = string
      ports    = optional(list(string))
    }))
    deny = optional(list(object({
      protocol = string
      ports    = optional(list(string))
    })))
    target_tags = optional(list(string))
    source_tags = optional(list(string))
  }))
  default = []
}

variable "create_default_firewall_rules" {
  description = "Whether to create default firewall rules"
  type        = bool
  default     = true
}

variable "ssh_source_ranges" {
  description = "Source IP ranges for SSH access"
  type        = list(string)
  default     = ["0.0.0.0/0"]
} 