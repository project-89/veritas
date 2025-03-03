/**
 * # Redis Module Variables
 * 
 * Variables for the Google Cloud Memorystore (Redis) module.
 */

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region for the Redis instance"
  type        = string
}

variable "name" {
  description = "The name of the Redis instance"
  type        = string
}

variable "description" {
  description = "The description of the Redis instance"
  type        = string
  default     = "Redis instance for Veritas system"
}

variable "memory_size_gb" {
  description = "The memory size of the Redis instance in GB"
  type        = number
  default     = 1
}

variable "tier" {
  description = "The tier of the Redis instance (BASIC or STANDARD_HA)"
  type        = string
  default     = "BASIC"
}

variable "redis_version" {
  description = "The version of Redis to use"
  type        = string
  default     = "REDIS_6_X"
}

variable "authorized_network" {
  description = "The name of the network to connect the Redis instance to"
  type        = string
}

variable "connect_mode" {
  description = "The connection mode of the Redis instance (DIRECT_PEERING or PRIVATE_SERVICE_ACCESS)"
  type        = string
  default     = "PRIVATE_SERVICE_ACCESS"
}

variable "redis_configs" {
  description = "Redis configuration parameters"
  type        = map(string)
  default     = {}
}

variable "auth_enabled" {
  description = "Whether to enable authentication for the Redis instance"
  type        = bool
  default     = true
}

variable "transit_encryption_mode" {
  description = "The TLS mode of the Redis instance (DISABLED, SERVER_AUTHENTICATION, or TRANSIT_ENCRYPTION_MODE_UNSPECIFIED)"
  type        = string
  default     = "SERVER_AUTHENTICATION"
}

variable "maintenance_policy" {
  description = "The maintenance policy for the Redis instance"
  type = object({
    day        = string
    start_time = object({
      hours   = number
      minutes = number
      seconds = number
      nanos   = number
    })
  })
  default = {
    day        = "SATURDAY"
    start_time = {
      hours   = 2
      minutes = 0
      seconds = 0
      nanos   = 0
    }
  }
}

variable "labels" {
  description = "Labels to apply to the Redis instance"
  type        = map(string)
  default     = {}
}

variable "read_replicas_mode" {
  description = "Read replicas mode for the Redis instance (READ_REPLICAS_DISABLED or READ_REPLICAS_ENABLED)"
  type        = string
  default     = "READ_REPLICAS_DISABLED"
}

variable "replica_count" {
  description = "The number of read replicas for the Redis instance"
  type        = number
  default     = 0
}

variable "persistence_config" {
  description = "The persistence configuration for the Redis instance"
  type = object({
    persistence_mode    = string
    rdb_snapshot_period = string
  })
  default = {
    persistence_mode    = "DISABLED"
    rdb_snapshot_period = "ONE_HOUR"
  }
} 