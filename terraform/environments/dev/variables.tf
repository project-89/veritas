/**
 * # Variables for Veritas Development Environment
 *
 * This file defines all variables used in the development environment.
 */

# Project variables
variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region to deploy resources"
  type        = string
  default     = "us-central1"
}

variable "zones" {
  description = "The GCP zones to deploy resources"
  type        = list(string)
  default     = ["us-central1-a", "us-central1-b", "us-central1-c"]
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "use_random_suffix" {
  description = "Whether to append a random suffix to resource names"
  type        = bool
  default     = true
}

# Networking variables
variable "subnet_cidr" {
  description = "CIDR range for the subnet"
  type        = string
  default     = "10.0.0.0/20"
}

# GKE variables
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
  }))
  default = [
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
}

# Redis variables
variable "redis_memory_size" {
  description = "Memory size for Redis instance in GB"
  type        = number
  default     = 1
}

# Pub/Sub variables
variable "pubsub_topics" {
  description = "List of Pub/Sub topics to create"
  type        = list(string)
  default = [
    "content.created",
    "content.updated",
    "source.verified",
    "analysis.completed",
    "narrative.detected"
  ]
}

variable "pubsub_subscriptions" {
  description = "List of Pub/Sub subscriptions to create"
  type = list(object({
    name                 = string
    topic                = string
    ack_deadline_seconds = number
  }))
  default = [
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
}

# Database variables
variable "memgraph_replicas" {
  description = "Number of Memgraph replicas"
  type        = number
  default     = 1
}

variable "memgraph_storage" {
  description = "Storage size for Memgraph in GB"
  type        = number
  default     = 10
} 