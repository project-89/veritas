/**
 * # Redis Module Outputs
 * 
 * Outputs from the Google Cloud Memorystore (Redis) module.
 */

output "id" {
  description = "The ID of the Redis instance"
  value       = google_redis_instance.redis.id
}

output "name" {
  description = "The name of the Redis instance"
  value       = google_redis_instance.redis.name
}

output "host" {
  description = "The IP address of the Redis instance"
  value       = google_redis_instance.redis.host
}

output "port" {
  description = "The port of the Redis instance"
  value       = google_redis_instance.redis.port
}

output "region" {
  description = "The region of the Redis instance"
  value       = google_redis_instance.redis.region
}

output "current_location_id" {
  description = "The current zone of the Redis instance"
  value       = google_redis_instance.redis.current_location_id
}

output "persistence_iam_identity" {
  description = "The IAM identity of the Redis instance for persistence"
  value       = google_redis_instance.redis.persistence_iam_identity
}

output "auth_string" {
  description = "The AUTH string for the Redis instance"
  value       = var.auth_enabled ? google_redis_instance.redis.auth_string : null
  sensitive   = true
}

output "connection_string" {
  description = "The connection string for the Redis instance"
  value       = var.auth_enabled ? "redis://:${google_redis_instance.redis.auth_string}@${google_redis_instance.redis.host}:${google_redis_instance.redis.port}" : "redis://${google_redis_instance.redis.host}:${google_redis_instance.redis.port}"
  sensitive   = true
}

output "server_ca_certs" {
  description = "The server CA certificates for the Redis instance"
  value       = var.transit_encryption_mode != "DISABLED" ? google_redis_instance.redis.server_ca_certs : null
  sensitive   = true
} 