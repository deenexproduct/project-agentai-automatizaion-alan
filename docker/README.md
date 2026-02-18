# VoiceCommand - Docker Production Setup

## 🚀 Quick Start

1. **Copy and configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

2. **Deploy using the helper script:**
   ```bash
   chmod +x docker/deploy.sh
   ./docker/deploy.sh build
   ./docker/deploy.sh start
   ```

3. **Or use Docker Compose directly:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

## 📁 File Structure

```
docker/
├── Dockerfile.optimized    # Multi-stage optimized Dockerfile
├── docker-compose.prod.yml # Production orchestration
├── nginx/
│   ├── nginx.conf          # Nginx reverse proxy config
│   └── ssl/                # SSL certificates (mount here)
├── deploy.sh               # Deployment helper script
└── README.md               # This file
```

## 🏗️ Architecture

### Multi-Stage Dockerfile

| Stage | Purpose | Size Impact |
|-------|---------|-------------|
| `dependencies` | Install production npm packages | Copied to runtime |
| `builder` | Compile TypeScript to JavaScript | Discarded |
| `runtime` | Final production image with Chrome, ffmpeg | ~400-500MB |

> **Note:** Due to Puppeteer and Chrome requirements, the final image is larger than typical Node.js apps. Chrome alone adds ~300MB.

### Services

| Service | Image | Purpose | Memory Limit |
|---------|-------|---------|--------------|
| `app` | Custom Node.js | Application server | 2GB |
| `mongo` | mongo:7-jammy | Database | 1GB |
| `redis` | redis:7-alpine | Cache & Queue | 256MB |
| `nginx` | nginx:alpine | Reverse Proxy | 128MB |

## 🔒 Security Features

- **Non-root user:** App runs as `voicecommand` user (UID 1000)
- **Health checks:** All services have health check endpoints
- **Resource limits:** CPU and memory limits on all containers
- **Network isolation:** Services communicate via internal Docker network
- **No secrets in images:** Environment variables passed at runtime

## 📊 Monitoring

### Health Check Endpoints

| Service | Endpoint | Command |
|---------|----------|---------|
| App | `GET /api/health` | `curl http://localhost:3000/api/health` |
| Mongo | `db.adminCommand('ping')` | `docker-compose exec mongo mongosh --eval "db.adminCommand('ping')"` |
| Redis | `PING` | `docker-compose exec redis redis-cli ping` |
| Nginx | `GET /health` | `curl http://localhost/health` |

### View Logs

```bash
# All services
./docker/deploy.sh logs

# Specific service
./docker/deploy.sh logs app
```

## 💾 Backup & Restore

### Automated Backup

```bash
./docker/deploy.sh backup
```

This creates a timestamped backup in `backups/YYYYMMHH_HHMMSS/` containing:
- MongoDB dump
- Redis dump
- Uploads archive

### Manual MongoDB Backup

```bash
docker-compose -f docker-compose.prod.yml exec mongo mongodump --archive > backup.archive
```

### Restore MongoDB

```bash
docker-compose -f docker-compose.prod.yml exec -i mongo mongorestore --archive < backup.archive
```

## 🔄 Updates

```bash
# Pull latest images, rebuild, and restart
./docker/deploy.sh update
```

## 🐛 Troubleshooting

### Container won't start

```bash
# Check logs
./docker/deploy.sh logs app

# Check resource usage
./docker/deploy.sh status
```

### MongoDB connection issues

```bash
# Verify MongoDB is running
docker-compose -f docker-compose.prod.yml ps mongo

# Check MongoDB logs
docker-compose -f docker-compose.prod.yml logs mongo
```

### Redis connection issues

```bash
# Test Redis connection
docker-compose -f docker-compose.prod.yml exec redis redis-cli ping
```

### Chrome/Puppeteer issues

Chrome requires specific system libraries. If you see errors:

```bash
# Rebuild with no cache
docker-compose -f docker-compose.prod.yml build --no-cache app
```

## 🔧 Customization

### SSL/HTTPS

1. Place your certificates in `docker/nginx/ssl/`:
   - `cert.pem` - Certificate
   - `key.pem` - Private key

2. Uncomment the HTTPS server block in `docker/nginx/nginx.conf`

3. Restart:
   ```bash
   ./docker/deploy.sh restart
   ```

### Let's Encrypt

For automatic SSL certificates, use certbot:

```bash
# Run certbot
docker run -it --rm \
  -v ./docker/nginx/ssl:/etc/letsencrypt \
  -v ./docker/nginx/www:/var/www/certbot \
  certbot/certbot certonly --webroot -w /var/www/certbot -d yourdomain.com
```

## 📈 Scaling

### Horizontal Scaling (multiple app instances)

Modify `docker-compose.prod.yml`:

```yaml
services:
  app:
    deploy:
      replicas: 3
    # Remove port binding from app service
    # Expose via nginx load balancer
```

Update nginx.conf to use upstream with multiple servers.

## 🧹 Maintenance

```bash
# Clean up unused Docker resources
./docker/deploy.sh cleanup

# View system prune preview (dry run)
docker system prune --dry-run
```

## 📝 Environment Variables

See `.env.example` for all available configuration options.

Required variables:
- `MONGODB_URI` - MongoDB connection string
- `REDIS_URL` - Redis connection string
- `OPENAI_API_KEY` - OpenAI API key
- `GROQ_API_KEY` - Groq API key

## 🆘 Support

For issues or questions, check:
1. Container logs: `./docker/deploy.sh logs`
2. Health status: `./docker/deploy.sh status`
3. Resource usage: `docker stats`
