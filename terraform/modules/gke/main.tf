/**
 * # GKE Module
 * 
 * This module creates a Google Kubernetes Engine cluster and node pools for the Veritas system.
 */

# Create a service account for the GKE nodes
resource "google_service_account" "gke_sa" {
  project      = var.project_id
  account_id   = "gke-${var.cluster_name}-sa"
  display_name = "GKE Service Account for ${var.cluster_name}"
}

# Grant necessary permissions to the service account
resource "google_project_iam_member" "gke_sa_roles" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/monitoring.viewer",
    "roles/storage.objectViewer",
    "roles/artifactregistry.reader"
  ])
  
  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.gke_sa.email}"
}

# Get the VPC network and subnet details
data "google_compute_network" "network" {
  project = var.project_id
  name    = var.network_name
}

data "google_compute_subnetwork" "subnet" {
  project = var.project_id
  name    = var.subnet_name
  region  = var.region
}

# Create the GKE cluster
resource "google_container_cluster" "cluster" {
  name        = var.cluster_name
  description = var.cluster_description
  project     = var.project_id
  
  # Use regional cluster if zones are not specified
  location = length(var.zones) > 0 ? null : var.region
  
  # Use zonal cluster if zones are specified
  node_locations = length(var.zones) > 0 ? var.zones : null
  
  # Use the latest GKE version if not specified
  min_master_version = var.kubernetes_version == "latest" ? null : var.kubernetes_version
  
  # Network configuration
  network    = data.google_compute_network.network.self_link
  subnetwork = data.google_compute_subnetwork.subnet.self_link
  
  # Private cluster configuration
  private_cluster_config {
    enable_private_nodes    = var.enable_private_nodes
    enable_private_endpoint = var.enable_private_endpoint
    master_ipv4_cidr_block  = var.master_ipv4_cidr_block
  }
  
  # IP allocation policy for pods and services
  ip_allocation_policy {
    cluster_ipv4_cidr_block  = null
    services_ipv4_cidr_block = null
  }
  
  # Enable network policy if specified
  network_policy {
    enabled  = var.enable_network_policy
    provider = "CALICO"
  }
  
  # Enable binary authorization if specified
  dynamic "binary_authorization" {
    for_each = var.enable_binary_authorization ? [1] : []
    content {
      evaluation_mode = "PROJECT_SINGLETON_POLICY_ENFORCE"
    }
  }
  
  # Enable workload identity if specified
  dynamic "workload_identity_config" {
    for_each = var.enable_workload_identity ? [1] : []
    content {
      workload_pool = "${var.project_id}.svc.id.goog"
    }
  }
  
  # Enable shielded nodes if specified
  dynamic "release_channel" {
    for_each = var.kubernetes_version == "latest" ? [1] : []
    content {
      channel = "REGULAR"
    }
  }
  
  # Enable vertical pod autoscaling if specified
  vertical_pod_autoscaling {
    enabled = var.enable_vertical_pod_autoscaling
  }
  
  # Configure maintenance window
  maintenance_policy {
    recurring_window {
      start_time = var.maintenance_start_time
      end_time   = var.maintenance_end_time
      recurrence = var.maintenance_recurrence
    }
  }
  
  # Enable intranode visibility if specified
  enable_intranode_visibility = var.enable_intranode_visibility
  
  # Enable shielded nodes if specified
  enable_shielded_nodes = var.enable_shielded_nodes
  
  # Remove default node pool
  remove_default_node_pool = true
  initial_node_count       = 1
  
  # Add resource labels
  resource_labels = merge(
    var.resource_labels,
    {
      "managed-by" = "terraform"
      "component"  = "gke"
      "part-of"    = "veritas"
    }
  )
  
  # Disable basic authentication
  master_auth {
    client_certificate_config {
      issue_client_certificate = false
    }
  }
  
  # Timeouts for operations
  timeouts {
    create = "45m"
    update = "45m"
    delete = "45m"
  }
}

# Create node pools
resource "google_container_node_pool" "pools" {
  for_each = { for pool in var.node_pools : pool.name => pool }
  
  name     = each.value.name
  project  = var.project_id
  location = google_container_cluster.cluster.location
  cluster  = google_container_cluster.cluster.name
  
  # Node count or autoscaling
  dynamic "autoscaling" {
    for_each = each.value.auto_scaling ? [1] : []
    content {
      min_node_count = each.value.min_count
      max_node_count = each.value.max_count
    }
  }
  
  initial_node_count = each.value.auto_scaling ? each.value.min_count : each.value.min_count
  
  # Node configuration
  node_config {
    machine_type = each.value.machine_type
    disk_size_gb = each.value.disk_size_gb
    disk_type    = each.value.disk_type
    image_type   = each.value.image_type
    preemptible  = each.value.preemptible
    
    # Use the service account
    service_account = google_service_account.gke_sa.email
    
    # OAuth scopes
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]
    
    # Labels
    labels = merge(
      lookup(each.value, "labels", {}),
      {
        "managed-by" = "terraform"
        "component"  = "gke-node"
        "part-of"    = "veritas"
        "node-pool"  = each.value.name
      }
    )
    
    # Taints
    dynamic "taint" {
      for_each = lookup(each.value, "taints", [])
      content {
        key    = taint.value.key
        value  = taint.value.value
        effect = taint.value.effect
      }
    }
    
    # Enable workload identity on nodes
    dynamic "workload_metadata_config" {
      for_each = var.enable_workload_identity ? [1] : []
      content {
        mode = "GKE_METADATA"
      }
    }
    
    # Enable shielded nodes
    dynamic "shielded_instance_config" {
      for_each = var.enable_shielded_nodes ? [1] : []
      content {
        enable_secure_boot          = true
        enable_integrity_monitoring = true
      }
    }
    
    # Add metadata
    metadata = {
      "disable-legacy-endpoints" = "true"
    }
  }
  
  # Management configuration
  management {
    auto_repair  = true
    auto_upgrade = true
  }
  
  # Upgrade settings
  upgrade_settings {
    max_surge       = 1
    max_unavailable = 0
  }
  
  # Timeouts for operations
  timeouts {
    create = "45m"
    update = "45m"
    delete = "45m"
  }
} 