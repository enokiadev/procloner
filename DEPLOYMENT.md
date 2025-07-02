# 🚀 ProCloner Deployment Guide

This guide covers multiple deployment options for ProCloner, including Netlify (recommended) and Docker.

## 🌐 Netlify Deployment (Recommended)

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/yourusername/procloner)

### Prerequisites for Netlify

1. **Google OAuth Setup**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable Google+ API
   - Create OAuth 2.0 credentials
   - Add authorized redirect URIs:
     - `https://your-site.netlify.app/auth/google/callback`
     - `http://localhost:5173/auth/google/callback` (for development)

2. **Netlify Account**: Sign up at [netlify.com](https://netlify.com)

### Quick Netlify Deploy

1. **Fork and Clone Repository**:
   ```bash
   git clone https://github.com/yourusername/procloner.git
   cd procloner
   ```

2. **Configure Environment Variables** in Netlify dashboard:
   ```env
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   SESSION_SECRET=your_random_session_secret_here
   ADMIN_EMAILS=admin@example.com,admin2@example.com
   NODE_ENV=production
   ```

3. **Deploy**:
   - Connect GitHub repository to Netlify
   - Build command: `npm run build`
   - Publish directory: `client/dist`
   - Base directory: `client`

---

## 🐳 Docker Deployment

For self-hosted solutions with full crawling capabilities.

## Prerequisites

- Docker and Docker Compose installed
- At least 2GB RAM available
- SSL certificates (for HTTPS)
- Domain name (optional but recommended)

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ProCloner
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your production values
   ```

3. **Build and run with Docker Compose**
   ```bash
   docker-compose up -d
   ```

4. **Check health**
   ```bash
   curl http://localhost/api/health
   ```

## Environment Configuration

### Required Environment Variables

Create a `.env` file in the project root:

```bash
# Security (REQUIRED)
SESSION_SECRET=your-super-secret-session-key-here

# Application
NODE_ENV=production
PORT=3002
LOG_LEVEL=info

# CORS Configuration
CORS_ORIGIN=https://yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000          # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100          # General requests per window
RATE_LIMIT_CRAWL_MAX_REQUESTS=10     # Crawl requests per window

# Crawling Configuration
MAX_CONCURRENT_SESSIONS=5
DEFAULT_CRAWL_TIMEOUT=120000         # 2 minutes
SESSION_TIMEOUT_MS=300000            # 5 minutes
DEFAULT_CRAWL_DEPTH=3
MAX_CRAWL_DEPTH=5

# Browser Configuration
PUPPETEER_HEADLESS=true
PUPPETEER_TIMEOUT=30000

# Storage
TEMP_DIR=/app/temp
MAX_TEMP_AGE_HOURS=24
MAX_TEMP_SIZE_MB=1024

# Security Headers
HSTS_MAX_AGE=31536000
CSP_REPORT_URI=/api/csp-report
```

### Frontend Environment Variables

Create `client/.env.production`:

```bash
REACT_APP_API_BASE_URL=https://yourdomain.com
REACT_APP_WS_URL=wss://yourdomain.com
REACT_APP_EXAMPLE_URLS=https://example.com,https://demo.com
```

## SSL/HTTPS Setup

### Option 1: Let's Encrypt with Certbot

1. **Install Certbot**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   ```

2. **Obtain certificates**
   ```bash
   sudo certbot --nginx -d yourdomain.com
   ```

3. **Update docker-compose.yml to mount certificates**
   ```yaml
   nginx:
     volumes:
       - /etc/letsencrypt:/etc/nginx/ssl:ro
   ```

### Option 2: Custom SSL Certificates

1. **Place certificates in ssl/ directory**
   ```
   ssl/
   ├── cert.pem
   └── key.pem
   ```

2. **Update nginx.conf to enable HTTPS server block**

## Production Deployment Options

### Option 1: Docker Compose (Recommended)

```bash
# Production build
docker-compose -f docker-compose.yml up -d

# View logs
docker-compose logs -f procloner

# Update application
docker-compose pull
docker-compose up -d
```

### Option 2: Docker Only

```bash
# Build image
docker build -t procloner:latest .

# Run container
docker run -d \
  --name procloner \
  --restart unless-stopped \
  -p 3002:3002 \
  --env-file .env \
  -v procloner_temp:/app/temp \
  -v procloner_logs:/app/logs \
  procloner:latest
```

### Option 3: Kubernetes

Create Kubernetes manifests (examples in `k8s/` directory):

```bash
kubectl apply -f k8s/
```

## Monitoring and Logging

### Health Checks

The application provides health endpoints:

- `GET /api/health` - Basic health check
- Container health check runs every 30 seconds

### Logging

Logs are written to:
- Console (Docker logs)
- `/app/logs/` directory (persistent volume)

View logs:
```bash
# Docker Compose
docker-compose logs -f procloner

# Docker
docker logs -f procloner

# Log files
docker exec procloner tail -f /app/logs/app.log
```

### Metrics Collection

For production monitoring, consider integrating:
- Prometheus metrics endpoint
- Grafana dashboards
- Error tracking (Sentry)

## Security Considerations

### Container Security

- Runs as non-root user
- Security capabilities dropped
- Read-only root filesystem (except temp/logs)
- Resource limits applied

### Network Security

- Nginx reverse proxy with rate limiting
- Security headers configured
- HTTPS enforcement
- WebSocket support

### Data Security

- Session secrets properly configured
- No hardcoded credentials
- Temporary files cleaned up automatically
- Input validation on all endpoints

## Performance Tuning

### Resource Limits

Adjust in docker-compose.yml:

```yaml
deploy:
  resources:
    limits:
      memory: 4G      # Increase for more concurrent sessions
      cpus: '2.0'     # Increase for better performance
```

### Browser Configuration

- Headless mode enabled by default
- Memory limits set for Chromium
- Process cleanup after each session

### Caching

- Static assets cached by Nginx
- Browser instances reused where possible
- Temporary files cleaned up automatically

## Troubleshooting

### Common Issues

1. **Memory Issues**
   ```bash
   # Check container memory usage
   docker stats procloner
   
   # Increase memory limits in docker-compose.yml
   ```

2. **Puppeteer Crashes**
   ```bash
   # Check browser permissions
   docker exec procloner ls -la /usr/bin/chromium-browser
   
   # Verify headless mode
   echo $PUPPETEER_HEADLESS
   ```

3. **Network Timeouts**
   ```bash
   # Check nginx logs
   docker logs procloner-nginx
   
   # Adjust timeout settings in nginx.conf
   ```

### Debug Mode

Enable debug logging:

```bash
# Set in .env
LOG_LEVEL=debug

# Restart services
docker-compose restart
```

## Backup and Recovery

### Data to Backup

- Environment configuration (`.env`)
- SSL certificates (`ssl/`)
- Persistent volumes (`temp_data`, `logs_data`)

### Backup Script

```bash
#!/bin/bash
# backup.sh
docker run --rm \
  -v procloner_temp:/backup/temp \
  -v procloner_logs:/backup/logs \
  -v $(pwd):/backup/config \
  alpine tar czf /backup/procloner-backup-$(date +%Y%m%d).tar.gz \
  /backup/temp /backup/logs /backup/config/.env
```

## Scaling

### Horizontal Scaling

For high traffic, consider:

1. **Load Balancer**
   - Multiple ProCloner instances
   - Session affinity for WebSocket connections

2. **Queue System**
   - Redis for job queuing
   - Separate worker processes

3. **Database**
   - Persistent session storage
   - Shared state across instances

### Vertical Scaling

- Increase container resources
- Optimize browser settings
- Tune garbage collection

## Updates and Maintenance

### Regular Maintenance

1. **Update containers**
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

2. **Clean up old images**
   ```bash
   docker system prune -f
   ```

3. **Rotate logs**
   ```bash
   docker exec procloner logrotate /etc/logrotate.conf
   ```

### Version Updates

1. Test in staging environment
2. Backup current deployment
3. Update image tags in docker-compose.yml
4. Deploy with rolling update strategy

For questions or issues, please check the GitHub repository or create an issue.