# Docker Quick Start Guide

## Prerequisites
- Docker and Docker Compose installed
- Microsoft Azure OAuth app configured
- Outline API token

## Quick Setup

### 1. Copy Environment File
```bash
cp .env.docker .env
```

### 2. Configure Environment Variables
Edit `.env` with your actual values:
```bash
# Microsoft OAuth - REQUIRED
MS_CLIENT_ID=your-azure-client-id
MS_CLIENT_SECRET=your-azure-client-secret  
SESSION_SECRET=your-super-long-random-secret-key
REDIRECT_URI=https://your-domain.com/auth/callback

# Outline API - REQUIRED
OUTLINE_API_URL=https://your-outline-instance.com/api
OUTLINE_API_TOKEN=your-outline-api-token
```

### 3. Launch Services
```bash
docker-compose up -d
```

### 4. Verify Deployment
```bash
# Check service status
docker-compose ps

# View logs
docker-compose logs -f mcp-outline-server

# Test health endpoint
curl http://localhost:3131/health
```

## Service Access

- **Application**: http://localhost:3131
- **Health Check**: http://localhost:3131/health  
- **MCP Endpoint**: http://localhost:3131/v1/mcp (requires auth)

## Management Commands

```bash
# Start services
docker-compose up -d

# Stop services  
docker-compose down

# View logs
docker-compose logs -f

# Restart just the app
docker-compose restart mcp-outline-server

# Update and rebuild
git pull origin v2
docker-compose build --no-cache
docker-compose up -d
```

## Production Notes

- Redis data persists in Docker volume `redis_data`
- Application logs in `./logs` directory
- Health checks enabled for both services
- Automatic restart unless stopped manually
- Network isolation via `mcp-network`

## Troubleshooting

**Container won't start:**
```bash
docker-compose logs mcp-outline-server
```

**Reset everything:**
```bash
docker-compose down -v
docker-compose build --no-cache  
docker-compose up -d
```

**Check Redis:**
```bash
docker-compose exec redis redis-cli ping
```