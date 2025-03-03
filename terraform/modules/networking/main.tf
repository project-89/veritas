/**
 * # Networking Module
 *
 * This module creates the VPC network, subnets, and firewall rules for the Veritas system.
 */

# Create VPC network
resource "google_compute_network" "network" {
  name                    = var.network_name
  project                 = var.project_id
  auto_create_subnetworks = false
  description             = "VPC Network for Veritas system"
}

# Create subnets
resource "google_compute_subnetwork" "subnets" {
  for_each      = { for subnet in var.subnets : subnet.name => subnet }
  name          = each.value.name
  project       = var.project_id
  region        = lookup(each.value, "region", var.region)
  network       = google_compute_network.network.self_link
  ip_cidr_range = each.value.ip_cidr_range
  description   = lookup(each.value, "description", "Subnet for Veritas system")
  
  # Enable flow logs if specified
  dynamic "log_config" {
    for_each = var.enable_flow_logs ? [1] : []
    content {
      aggregation_interval = "INTERVAL_5_SEC"
      flow_sampling        = 0.5
      metadata             = "INCLUDE_ALL_METADATA"
    }
  }

  # Enable private Google access
  private_ip_google_access = true
}

# Create custom firewall rules
resource "google_compute_firewall" "rules" {
  for_each    = { for rule in var.firewall_rules : rule.name => rule }
  name        = each.value.name
  project     = var.project_id
  network     = google_compute_network.network.self_link
  description = lookup(each.value, "description", "Firewall rule for Veritas system")
  
  # Source ranges or tags
  dynamic "source_ranges" {
    for_each = lookup(each.value, "source_ranges", null) != null ? [1] : []
    content {
      ranges = each.value.source_ranges
    }
  }

  dynamic "source_tags" {
    for_each = lookup(each.value, "source_tags", null) != null ? [1] : []
    content {
      tags = each.value.source_tags
    }
  }

  # Destination ranges or tags
  dynamic "destination_ranges" {
    for_each = lookup(each.value, "destination_ranges", null) != null ? [1] : []
    content {
      ranges = each.value.destination_ranges
    }
  }

  dynamic "target_tags" {
    for_each = lookup(each.value, "target_tags", null) != null ? [1] : []
    content {
      tags = each.value.target_tags
    }
  }

  # Direction (ingress or egress)
  direction = lookup(each.value, "direction", "INGRESS")
  
  # Priority
  priority = lookup(each.value, "priority", 1000)
  
  # Allow rules
  dynamic "allow" {
    for_each = lookup(each.value, "allow", null) != null ? each.value.allow : []
    content {
      protocol = allow.value.protocol
      ports    = lookup(allow.value, "ports", null)
    }
  }
  
  # Deny rules
  dynamic "deny" {
    for_each = lookup(each.value, "deny", null) != null ? each.value.deny : []
    content {
      protocol = deny.value.protocol
      ports    = lookup(deny.value, "ports", null)
    }
  }
}

# Create default firewall rules if enabled
# Allow internal communication between instances in the same network
resource "google_compute_firewall" "allow_internal" {
  count       = var.create_default_firewall_rules ? 1 : 0
  name        = "${var.network_name}-allow-internal"
  project     = var.project_id
  network     = google_compute_network.network.self_link
  description = "Allow internal traffic between instances in the same network"
  
  allow {
    protocol = "icmp"
  }
  
  allow {
    protocol = "tcp"
  }
  
  allow {
    protocol = "udp"
  }
  
  source_ranges = [for subnet in var.subnets : subnet.ip_cidr_range]
}

# Allow SSH access
resource "google_compute_firewall" "allow_ssh" {
  count       = var.create_default_firewall_rules ? 1 : 0
  name        = "${var.network_name}-allow-ssh"
  project     = var.project_id
  network     = google_compute_network.network.self_link
  description = "Allow SSH access to instances"
  
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
  
  source_ranges = var.ssh_source_ranges
}

# Allow health checks
resource "google_compute_firewall" "allow_health_checks" {
  count       = var.create_default_firewall_rules ? 1 : 0
  name        = "${var.network_name}-allow-health-checks"
  project     = var.project_id
  network     = google_compute_network.network.self_link
  description = "Allow health checks from Google Cloud"
  
  allow {
    protocol = "tcp"
  }
  
  source_ranges = [
    "35.191.0.0/16",  # GCP health check ranges
    "130.211.0.0/22", # GCP health check ranges
  ]
}

# Create a Cloud NAT for outbound internet access from private instances
resource "google_compute_router" "router" {
  name    = "${var.network_name}-router"
  project = var.project_id
  region  = var.region
  network = google_compute_network.network.self_link
}

resource "google_compute_router_nat" "nat" {
  name                               = "${var.network_name}-nat"
  project                            = var.project_id
  router                             = google_compute_router.router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
} 