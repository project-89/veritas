# Veritas Administrator Guide

This guide provides detailed information for administrators of the Veritas system, covering system configuration, user management, data management, monitoring, and maintenance tasks.

## Table of Contents

1. [Introduction](#introduction)
2. [System Architecture](#system-architecture)
3. [Installation and Setup](#installation-and-setup)
4. [User Management](#user-management)
5. [Data Management](#data-management)
6. [System Configuration](#system-configuration)
7. [Monitoring and Alerts](#monitoring-and-alerts)
8. [Backup and Recovery](#backup-and-recovery)
9. [Security](#security)
10. [Performance Tuning](#performance-tuning)
11. [Troubleshooting](#troubleshooting)
12. [Maintenance Tasks](#maintenance-tasks)
13. [Upgrading](#upgrading)
14. [API Management](#api-management)
15. [Integration Management](#integration-management)

## Introduction

The Veritas Administrator Guide is designed for system administrators responsible for managing and maintaining the Veritas platform. This guide assumes familiarity with:

- Linux/Unix system administration
- Docker and Kubernetes
- Database management (particularly graph databases)
- Web application administration
- Basic networking concepts

## System Architecture

Veritas is built on a modern, cloud-native architecture:

### Core Components

- **Frontend**: React-based web application
- **Backend API**: Node.js/Express RESTful API
- **Graph Database**: Memgraph for storing and querying relationship data
- **Cache**: Redis for performance optimization
- **Message Queue**: Kafka for event-driven processing
- **Object Storage**: For storing large assets and backups
- **Authentication Service**: For user authentication and authorization

### Infrastructure

- **Kubernetes**: For container orchestration
- **Load Balancer**: For distributing traffic
- **Ingress Controller**: For routing HTTP traffic
- **Persistent Volumes**: For database storage
- **Secrets Management**: For secure credential storage

### Data Flow

1. Data is collected from sources via the ingestion pipeline
2. Raw content is processed and stored in the graph database
3. Analysis services process the content to detect narratives
4. Results are cached for quick access
5. Frontend applications query the API to retrieve and display data

## Installation and Setup

### Prerequisites

- Kubernetes cluster (GKE, EKS, AKS, or self-managed)
- Helm (for package management)
- kubectl (for Kubernetes management)
- Docker (for local development and testing)
- Domain name and SSL certificates
- Google Cloud Platform account (if using GCP)

### Deployment Options

Veritas can be deployed using:

1. **Terraform**: For infrastructure as code deployment (recommended)
2. **Kubernetes Manifests**: For manual deployment
3. **Helm Charts**: For package-based deployment

For detailed deployment instructions, refer to the [Terraform Deployment Guide](../deployment/terraform-deployment-guide.md) or [Kubernetes Deployment Guide](../../kubernetes/README.md).

### Post-Installation Setup

After deployment:

1. Configure the admin account
2. Set up initial data sources
3. Configure system settings
4. Set up monitoring and alerts
5. Perform initial system tests

## User Management

### User Roles

Veritas supports the following user roles:

- **Administrator**: Full system access
- **Analyst**: Access to analysis features and content
- **Editor**: Can manage content and sources
- **Viewer**: Read-only access to content and analyses
- **API User**: Programmatic access only

### Managing Users

To manage users:

1. Navigate to Admin > User Management
2. View the list of users
3. Create, edit, or deactivate users
4. Assign roles and permissions
5. Manage user groups

### Authentication Methods

Configure authentication methods:

1. Navigate to Admin > Authentication
2. Enable/disable authentication methods:
   - Local username/password
   - OAuth (Google, Microsoft, etc.)
   - SAML
   - LDAP/Active Directory
3. Configure authentication settings
4. Set password policies
5. Configure multi-factor authentication

### User Groups

Organize users into groups:

1. Navigate to Admin > User Groups
2. Create and manage groups
3. Assign users to groups
4. Set group permissions
5. Configure group-based access controls

## Data Management

Veritas implements a transform-on-ingest architecture for data privacy and compliance. This means that all raw data from social media platforms is transformed into anonymized insights during ingestion, and no raw identifiable data is stored in the system.

### Data Ingestion Principles

1. **Privacy by Design**: All data is anonymized at the point of ingestion
2. **No Raw Data Storage**: Original identifiable content is never stored
3. **Secure Transformations**: Cryptographic techniques ensure one-way transformation

### Managing Data Sources

As an administrator, you can manage the data sources that feed content into the Veritas system:

1. Navigate to Admin > Data Management
2. Select the "Data Sources" tab
3. From here, you can:
   - Add new data sources
   - Edit connection parameters for existing sources
   - Enable/disable sources
   - View ingestion metrics for each source

### Configuring Transformation Settings

The transform-on-ingest architecture uses various settings that can be configured:

1. Navigate to Admin > System Configuration
2. Select the "Transformation" tab
3. Configure settings such as:
   - Salt rotation frequency (default: 30 days)
   - Anonymization strength levels
   - Temporal generalization settings
   - Engagement categorization thresholds

### Data Retention Policies

Configure how long anonymized insights are retained in the system:

1. Navigate to Admin > Data Management
2. Select the "Retention Policies" tab
3. Configure retention periods for different data categories
4. Set up automatic cleanup schedules

### Monitoring Data Transformation

Monitor the health and performance of the data transformation process:

1. Navigate to Admin > Monitoring
2. Select the "Data Transformation" dashboard
3. View metrics such as:
   - Transformation throughput
   - Processing latency
   - Error rates
   - Source distribution

### Data Export and Backup

While the system doesn't store raw social media data, you can export and backup the anonymized insights:

1. Navigate to Admin > Data Management
2. Select the "Export & Backup" tab
3. Configure automated backups or perform manual exports
4. Choose export formats (JSON, CSV, etc.)

### Handling Deletion Requests

One advantage of the transform-on-ingest architecture is simplified handling of deletion requests:

1. Since no raw identifiable data is stored, there's no need to delete specific content
2. For audit purposes, navigate to Admin > Compliance > Deletion Requests to log any received requests
3. The system will automatically generate compliance responses based on the architecture

## System Configuration

### General Settings

Configure general system settings:

1. Navigate to Admin > System Settings
2. Set system name and branding
3. Configure time zone and locale
4. Set default user preferences
5. Configure email settings

### Analysis Configuration

Configure analysis settings:

1. Navigate to Admin > Analysis Settings
2. Set narrative detection parameters
3. Configure analysis algorithms
4. Set up content classification rules
5. Configure analysis schedules

### Integration Settings

Configure external integrations:

1. Navigate to Admin > Integrations
2. Set up social media API connections
3. Configure web crawlers
4. Set up RSS feed processors
5. Configure external analysis services

### Notification Settings

Configure system notifications:

1. Navigate to Admin > Notifications
2. Set up email notifications
3. Configure in-app notifications
4. Set up webhook notifications
5. Configure notification templates

## Monitoring and Alerts

### System Monitoring

Monitor system health:

1. Navigate to Admin > Monitoring
2. View system metrics:
   - CPU and memory usage
   - Database performance
   - API response times
   - Queue lengths
   - Error rates
3. Set up custom dashboards
4. Configure metric collection

### Alert Configuration

Configure system alerts:

1. Navigate to Admin > Alerts
2. Create and manage alert rules
3. Set thresholds for system metrics
4. Configure alert notifications
5. Set up escalation policies

### Logging

Manage system logs:

1. Navigate to Admin > Logs
2. View system logs
3. Configure log levels
4. Set up log rotation
5. Configure log export to external systems

### Audit Trail

Review system audit logs:

1. Navigate to Admin > Audit
2. View user activity logs
3. Track system changes
4. Export audit logs
5. Configure audit retention

## Backup and Recovery

### Backup Configuration

Configure system backups:

1. Navigate to Admin > Backup
2. Set up backup schedules
3. Configure backup storage
4. Set retention policies for backups
5. Test backup procedures

### Recovery Procedures

Perform system recovery:

1. Stop affected services
2. Restore from backup
3. Verify data integrity
4. Restart services
5. Validate system functionality

### Disaster Recovery

Prepare for disaster recovery:

1. Document recovery procedures
2. Set up cross-region replication
3. Configure failover mechanisms
4. Test disaster recovery plan
5. Maintain recovery documentation

## Security

### Access Control

Manage access control:

1. Navigate to Admin > Security
2. Configure IP restrictions
3. Set up network policies
4. Manage API access
5. Configure role-based access control

### Encryption

Configure encryption:

1. Navigate to Admin > Security > Encryption
2. Manage SSL/TLS certificates
3. Configure data encryption at rest
4. Set up encryption for sensitive data
5. Manage encryption keys

### Security Scanning

Perform security scans:

1. Navigate to Admin > Security > Scanning
2. Run vulnerability scans
3. Perform dependency checks
4. Scan for misconfigurations
5. Review security reports

### Compliance

Ensure compliance:

1. Navigate to Admin > Compliance
2. Configure compliance settings
3. Generate compliance reports
4. Track compliance issues
5. Implement remediation measures

## Performance Tuning

### Resource Allocation

Optimize resource allocation:

1. Navigate to Admin > Performance
2. Adjust CPU and memory limits
3. Configure database resources
4. Optimize cache settings
5. Tune worker processes

### Query Optimization

Optimize database queries:

1. Navigate to Admin > Performance > Database
2. View slow query logs
3. Optimize frequent queries
4. Configure query caching
5. Adjust database parameters

### Caching Strategy

Configure caching:

1. Navigate to Admin > Performance > Caching
2. Set up Redis caching
3. Configure cache TTL
4. Set up cache invalidation
5. Monitor cache hit rates

### Scaling

Configure system scaling:

1. Navigate to Admin > Scaling
2. Set up auto-scaling rules
3. Configure horizontal pod autoscaling
4. Set resource thresholds
5. Monitor scaling events

## Troubleshooting

### Common Issues

Address common issues:

- **Database connectivity**: Check network and credentials
- **API errors**: Review logs and error messages
- **Slow performance**: Check resource usage and query performance
- **Data ingestion failures**: Verify source configurations and API limits
- **Authentication issues**: Check identity provider configuration

### Diagnostic Tools

Use diagnostic tools:

1. Navigate to Admin > Diagnostics
2. Run system health checks
3. Perform connectivity tests
4. Check component status
5. Generate diagnostic reports

### Log Analysis

Analyze system logs:

1. Navigate to Admin > Logs
2. Search for error patterns
3. Correlate events across components
4. Export logs for detailed analysis
5. Set up log alerts for critical issues

## Maintenance Tasks

### Routine Maintenance

Perform routine maintenance:

1. Database optimization
2. Log rotation and cleanup
3. Certificate renewal
4. Dependency updates
5. Configuration backups

### Scheduled Maintenance

Plan scheduled maintenance:

1. Create maintenance schedule
2. Notify users of planned downtime
3. Perform updates during maintenance windows
4. Validate system after maintenance
5. Document maintenance activities

### Health Checks

Perform regular health checks:

1. Navigate to Admin > Health
2. Run automated health checks
3. Verify component status
4. Check data integrity
5. Validate system performance

## Upgrading

### Upgrade Planning

Plan system upgrades:

1. Review release notes
2. Test upgrades in staging environment
3. Create upgrade plan
4. Schedule upgrade window
5. Prepare rollback plan

### Upgrade Procedure

Perform system upgrades:

1. Backup the system
2. Apply database schema changes
3. Update application components
4. Validate the upgrade
5. Update documentation

### Rollback Procedure

Perform rollback if needed:

1. Stop upgraded services
2. Restore from pre-upgrade backup
3. Revert database schema
4. Restart services
5. Validate system functionality

## API Management

### API Configuration

Configure the API:

1. Navigate to Admin > API
2. Set rate limits
3. Configure authentication
4. Set up API versioning
5. Configure CORS settings

### API Keys

Manage API keys:

1. Navigate to Admin > API > Keys
2. Create and revoke API keys
3. Set key permissions
4. Monitor key usage
5. Configure key expiration

### API Documentation

Manage API documentation:

1. Navigate to Admin > API > Documentation
2. Update API documentation
3. Publish documentation changes
4. Configure interactive API explorer
5. Manage API examples

## Integration Management

### External Services

Manage external service integrations:

1. Navigate to Admin > Integrations
2. Configure social media APIs
3. Set up web crawlers
4. Configure RSS feed processors
5. Manage third-party analysis services

### Webhooks

Configure webhooks:

1. Navigate to Admin > Integrations > Webhooks
2. Create and manage webhooks
3. Configure webhook triggers
4. Set up retry policies
5. Monitor webhook deliveries

### Custom Integrations

Develop custom integrations:

1. Use the Veritas API
2. Develop custom connectors
3. Create integration scripts
4. Test integrations
5. Document custom integrations 