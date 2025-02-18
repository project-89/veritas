# Veritas Deployment Guide

This guide covers deploying Veritas in various environments, from development to production.

## Deployment Options

1. [Docker Compose](#docker-compose) (Development)
2. [Kubernetes](#kubernetes) (Production)
3. [Manual Installation](#manual-installation)

## Prerequisites

- Node.js 18+
- Docker and Docker Compose
- Kubernetes cluster (for production)
- Domain name and SSL certificates
- Infrastructure access keys

## Docker Compose

### Local Development
```bash
# Start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

### Configuration
```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      
  memgraph:
    image: memgraph/memgraph-platform
    ports:
      - "7687:7687"
      - "7444:7444"
      
  redis:
    image: redis:6
    ports:
      - "6379:6379"
      
  kafka:
    image: redpandadata/redpanda
    ports:
      - "9092:9092"
```

## Kubernetes

### Prerequisites
- Kubernetes cluster
- kubectl configured
- Helm installed

### Installation

1. **Add Helm Repository**
```bash
helm repo add veritas https://charts.veritas-project.com
helm repo update
```

2. **Create Values File**
```yaml
# values.yaml
replicaCount: 3
image:
  repository: veritas
  tag: latest

ingress:
  enabled: true
  hosts:
    - host: veritas.yourdomain.com
      paths: ["/"]

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 500m
    memory: 512Mi
```

3. **Deploy**
```bash
helm install veritas veritas/veritas -f values.yaml
```

### Monitoring

```bash
# Check deployment status
kubectl get deployments

# View pods
kubectl get pods

# Check logs
kubectl logs -f deployment/veritas
```

## Manual Installation

### System Requirements
- 4+ CPU cores
- 8GB+ RAM
- 50GB+ storage
- Ubuntu 20.04 LTS or similar

### Installation Steps

1. **System Preparation**
```bash
# Update system
sudo apt-get update
sudo apt-get upgrade

# Install dependencies
sudo apt-get install -y curl build-essential
```

2. **Install Node.js**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. **Install Memgraph**
```bash
# Add Memgraph repository
wget -O- https://packages.memgraph.com/memgraph.public | sudo apt-key add -
echo "deb https://packages.memgraph.com/ubuntu/ focal main" > /etc/apt/sources.list.d/memgraph.list
sudo apt-get update
sudo apt-get install memgraph-platform
```

4. **Application Setup**
```bash
# Clone repository
git clone https://github.com/oneirocom/veritas.git
cd veritas

# Install dependencies
npm install

# Build application
npm run build

# Start application
npm run start:prod
```

## Security Considerations

### SSL/TLS
- Use Let's Encrypt for SSL certificates
- Configure SSL termination
- Enable HSTS

### Access Control
- Set up authentication
- Configure RBAC
- Implement API key management

### Network Security
- Configure firewalls
- Set up VPC/subnet
- Implement rate limiting

## Monitoring and Logging

### Prometheus Setup
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'veritas'
    static_configs:
      - targets: ['localhost:9464']
```

### Grafana Dashboards
- Import provided dashboards
- Set up alerts
- Configure notification channels

## Backup and Recovery

### Database Backup
```bash
# Backup Memgraph
mgbackup -d /path/to/backup

# Backup Redis
redis-cli SAVE
```

### Recovery Procedures
```bash
# Restore Memgraph
mgrestore -d /path/to/backup

# Restore Redis
cp dump.rdb /var/lib/redis/
```

## Scaling

### Horizontal Scaling
- Add application replicas
- Configure load balancer
- Set up session management

### Vertical Scaling
- Increase resource limits
- Optimize configurations
- Monitor performance

## Troubleshooting

### Common Issues

1. **Connection Issues**
```bash
# Check network connectivity
netstat -tulpn

# Verify service status
systemctl status veritas
```

2. **Performance Issues**
```bash
# Check resource usage
top
htop
```

3. **Log Analysis**
```bash
# View application logs
tail -f /var/log/veritas/app.log

# Check system logs
journalctl -u veritas
```

## Support

- [Deployment Forum](https://forum.veritas-project.com/deployment)
- [Documentation](https://docs.veritas-project.com)
- Email: devops@veritas-project.com 