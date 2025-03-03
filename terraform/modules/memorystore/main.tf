/**
 * # Redis Module
 * 
 * This module creates a Google Cloud Memorystore (Redis) instance for the Veritas system.
 */

# Get the VPC network details
data "google_compute_network" "network" {
  project = var.project_id
  name    = var.authorized_network
}

# Create the Redis instance
resource "google_redis_instance" "redis" {
  name           = var.name
  project        = var.project_id
  region         = var.region
  tier           = var.tier
  memory_size_gb = var.memory_size_gb
  
  # Redis version
  redis_version = var.redis_version
  
  # Network configuration
  authorized_network = data.google_compute_network.network.id
  connect_mode       = var.connect_mode
  
  # Redis configuration
  redis_configs = var.redis_configs
  
  # Authentication
  auth_enabled = var.auth_enabled
  
  # Encryption
  transit_encryption_mode = var.transit_encryption_mode
  
  # Maintenance policy
  maintenance_policy {
    weekly_maintenance_window {
      day = var.maintenance_policy.day
      start_time {
        hours   = var.maintenance_policy.start_time.hours
        minutes = var.maintenance_policy.start_time.minutes
        seconds = var.maintenance_policy.start_time.seconds
        nanos   = var.maintenance_policy.start_time.nanos
      }
    }
  }
  
  # Read replicas
  read_replicas_mode = var.read_replicas_mode
  replica_count      = var.replica_count
  
  # Persistence
  persistence_config {
    persistence_mode    = var.persistence_config.persistence_mode
    rdb_snapshot_period = var.persistence_config.rdb_snapshot_period
  }
  
  # Labels
  labels = merge(
    var.labels,
    {
      "managed-by" = "terraform"
      "component"  = "redis"
      "part-of"    = "veritas"
    }
  )
  
  # Description
  display_name = var.description
  
  # Timeouts for operations
  timeouts {
    create = "30m"
    update = "30m"
    delete = "30m"
  }
}

# Create a secret for the Redis AUTH string if authentication is enabled
resource "google_secret_manager_secret" "redis_auth" {
  count     = var.auth_enabled ? 1 : 0
  project   = var.project_id
  secret_id = "redis-auth-${var.name}"
  
  replication {
    automatic = true
  }
  
  labels = {
    "managed-by" = "terraform"
    "component"  = "redis"
    "part-of"    = "veritas"
  }
}

# Store the Redis AUTH string in Secret Manager if authentication is enabled
resource "google_secret_manager_secret_version" "redis_auth" {
  count       = var.auth_enabled ? 1 : 0
  secret      = google_secret_manager_secret.redis_auth[0].id
  secret_data = google_redis_instance.redis.auth_string
}

# Create a secret for the Redis connection string
resource "google_secret_manager_secret" "redis_connection" {
  project   = var.project_id
  secret_id = "redis-connection-${var.name}"
  
  replication {
    automatic = true
  }
  
  labels = {
    "managed-by" = "terraform"
    "component"  = "redis"
    "part-of"    = "veritas"
  }
}

# Store the Redis connection string in Secret Manager
resource "google_secret_manager_secret_version" "redis_connection" {
  secret      = google_secret_manager_secret.redis_connection.id
  secret_data = var.auth_enabled ? "redis://:${google_redis_instance.redis.auth_string}@${google_redis_instance.redis.host}:${google_redis_instance.redis.port}" : "redis://${google_redis_instance.redis.host}:${google_redis_instance.redis.port}"
} 