# Outline MCP Remote Server v2

> **Latest Version**: v2.0.0 - Enhanced with OAuth authentication and production security features

A secure, production-ready Model Context Protocol (MCP) server that provides tools for interacting with [Outline](https://www.getoutline.com/), a modern wiki and knowledge base platform. This server features Microsoft Azure OAuth authentication, comprehensive security, and Server-Sent Events (SSE) transport for remote connections over HTTP.

## Features

### v2 Enhancements ✨
- **🔐 OAuth 2.0 Authentication** - Microsoft Azure/MS365 integration with PKCE support
- **🐳 Docker Deployment** - Complete containerized setup with Docker Compose and Redis
- **🛡️ Enhanced Security** - Comprehensive logging anonymization, security headers, session management
- **🏗️ Modular Architecture** - Clean separation of concerns for maintainability
- **📊 Production Monitoring** - Structured logging, health checks, graceful shutdown
- **🔄 Redis Integration** - Optional Redis storage with automatic in-memory fallback

### Core Functionality
- **Document Management**: Search, create, retrieve, update, delete, list, and move documents
- **Collection Management**: Create, update, delete, and list collections
- **Remote Access**: SSE-based transport for remote MCP connections
- **Environment Configuration**: Easy setup with environment variables

## Attribution

This implementation is based on the excellent work by the [Fellow team](https://github.com/fellowapp/mcp-outline):

- **Original Project**: https://github.com/fellowapp/mcp-outline
- **License**: ISC License
- **Authors**: Fellow team

All tool schemas, API patterns, and functionality have been migrated from their implementation while adapting to our SSE-based remote server architecture. We gratefully acknowledge their contribution to the MCP ecosystem.

## Available Tools

### Document Tools (7)
- `search_documents` - Search for documents with optional collection filtering
- `get_document` - Retrieve a specific document by ID or shareId
- `create_document` - Create new documents with full customization options
- `update_document` - Update existing documents with append support
- `delete_document` - Delete documents from Outline
- `list_documents` - List documents with filtering and pagination
- `move_document` - Move documents between collections or change hierarchy

### Collection Tools (5)
- `list_collections` - List all collections with pagination
- `get_collection` - Retrieve specific collection details
- `create_collection` - Create new collections with customization
- `update_collection` - Update existing collection properties
- `delete_collection` - Delete collections from Outline

## Quick Start

Choose your deployment method:

### 🐳 **Option 1: Docker (Recommended)**
- ✅ One-command deployment with `docker compose up -d`
- ✅ Automatic Redis setup and networking
- ✅ Production-ready with health checks and logging
- ✅ Easy updates and rollbacks

### 🔧 **Option 2: Manual Installation**
- ✅ Full control over environment
- ✅ Development flexibility
- ✅ Custom Redis configuration

### Prerequisites
- **For Docker**: Docker and Docker Compose
- **For Manual**: Node.js 18+, npm/yarn, optional Redis
- **For Both**: Microsoft Azure application registration ([Setup guide](./OAUTH_SETUP.md))
- **For Both**: Outline API token ([Get one here](https://www.getoutline.com/developers))

### Manual Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd mcp-outline-remote
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Required - Microsoft OAuth
   MS_CLIENT_ID=your-azure-client-id
   MS_CLIENT_SECRET=your-azure-client-secret
   SESSION_SECRET=your-random-session-secret
   REDIRECT_URI=https://your-domain.com/auth/callback
   
   # Required - Outline API
   OUTLINE_API_URL=https://your-outline-instance.com/api
   OUTLINE_API_TOKEN=your-outline-api-token
   
   # Optional
   MS_TENANT=common
   REDIS_URL=redis://localhost:6379
   PORT=3131
   ```

4. **Build and start**
   ```bash
   npm run build
   npm start
   ```

   Or for development:
   ```bash
   npm run dev
   ```

### Docker Deployment (Recommended)

The easiest way to deploy this server is using Docker Compose with automatic Redis integration.

#### Quick Start with Docker

1. **Copy environment template**
   ```bash
   cp .env.docker .env
   ```

2. **Configure your credentials in `.env`**
   ```bash
   # Microsoft OAuth - REQUIRED
   MS_CLIENT_ID=your-azure-client-id
   MS_CLIENT_SECRET=your-azure-client-secret
   SESSION_SECRET=your-super-long-random-secret-key
   REDIRECT_URI=https://your-domain.com/auth/callback

   # Outline API - REQUIRED  
   OUTLINE_API_URL=https://your-outline-instance.com/api
   OUTLINE_API_TOKEN=your-outline-api-token

   # Optional
   MS_TENANT=common
   NODE_ENV=production
   ```

3. **Launch with Docker Compose**
   ```bash
   docker compose up -d
   ```

4. **Verify deployment**
   ```bash
   # Check service status
   docker compose ps

   # View logs
   docker compose logs -f mcp-outline-server

   # Test health endpoint
   curl http://localhost:3131/health
   ```

#### Docker Features

- **🐳 Multi-service setup**: Application + Redis with health checks
- **🔒 Security hardened**: Non-root user, isolated network, proper secrets handling
- **📊 Production ready**: Persistent volumes, restart policies, comprehensive logging
- **🚀 One-command deployment**: `docker compose up -d` and you're running
- **🔄 Automatic Redis**: No manual Redis setup required

#### Service Access

- **Application**: http://localhost:3131
- **Health Check**: http://localhost:3131/health  
- **MCP Endpoint**: http://localhost:3131/v1/mcp (requires authentication)

#### Management Commands

```bash
# Start services
docker compose up -d

# Stop services  
docker compose down

# View logs
docker compose logs -f

# Restart just the app
docker compose restart mcp-outline-server

# Update and rebuild
git pull origin v2
docker compose build --no-cache
docker compose up -d
```

#### Production Notes

- **Data persistence**: Redis data persists in Docker volume `redis_data`
- **Application logs**: Available in `./logs` directory (mounted volume)
- **Health monitoring**: Both services have health checks enabled
- **Auto-restart**: Services restart automatically unless stopped manually
- **Network isolation**: Services communicate via `mcp-network` bridge

#### Troubleshooting Docker

**Container won't start:**
```bash
docker compose logs mcp-outline-server
```

**Reset everything (clean slate):**
```bash
docker compose down -v
docker compose build --no-cache  
docker compose up -d
```

**Check Redis connectivity:**
```bash
docker compose exec redis redis-cli ping
```

**Access container shell:**
```bash
docker compose exec mcp-outline-server sh
```

See [docker-quickstart.md](./docker-quickstart.md) for complete Docker documentation.

### Usage

#### Browser Access
1. Navigate to `http://localhost:3131`
2. Click "Login with MS365"
3. Complete Microsoft authentication
4. Access protected endpoints

#### MCP Client Integration
```json
{
  "mcpServers": {
    "outline-remote": {
      "command": "node",
      "args": ["/path/to/mcp-outline-remote/dist/server.js"],
      "env": {
        "MS_CLIENT_ID": "your-client-id",
        "MS_CLIENT_SECRET": "your-client-secret",
        "SESSION_SECRET": "your-session-secret",
        "REDIRECT_URI": "https://your-domain.com/auth/callback",
        "OUTLINE_API_URL": "https://your-outline-instance.com/api",
        "OUTLINE_API_TOKEN": "your-outline-api-token"
      }
    }
  }
}
```

The server will be available at:
- **Landing Page**: `http://localhost:3131`
- **Health Check**: `http://localhost:3131/health`
- **MCP Endpoint**: `http://localhost:3131/v1/mcp` (protected)
- **Production URL**: `https://outline-mcp.your-domain.com`

## Environment Variables

### Required Variables
| Variable | Description |
|----------|-------------|
| `MS_CLIENT_ID` | Microsoft Azure client ID |
| `MS_CLIENT_SECRET` | Microsoft Azure client secret |
| `SESSION_SECRET` | Random session secret key |
| `REDIRECT_URI` | OAuth redirect URI |
| `OUTLINE_API_URL` | Outline API base URL |
| `OUTLINE_API_TOKEN` | Your Outline API token |

### Optional Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `MS_TENANT` | `common` | Microsoft tenant ID or "common" |
| `REDIS_URL` | - | Redis connection URL for production |
| `PORT` | `3131` | Server port |
| `NODE_ENV` | `development` | Environment mode |

## API Reference

### Document Operations

#### Search Documents
```typescript
search_documents({
  query: string,           // Search query
  collectionId?: string,   // Optional collection filter
  limit?: number          // Max results (default: 25)
})
```

#### Create Document
```typescript
create_document({
  title: string,              // Document title
  text?: string,              // Markdown content
  collectionId: string,       // Target collection
  parentDocumentId?: string,  // Parent for nesting
  templateId?: string,        // Template to use
  publish?: boolean          // Publish immediately (default: true)
})
```

### Collection Operations

#### List Collections
```typescript
list_collections({
  limit?: number,    // Max results (default: 25)
  offset?: number   // Skip count (default: 0)
})
```

#### Create Collection
```typescript
create_collection({
  name: string,                    // Collection name
  description?: string,            // Description
  color?: string,                  // Hex color (#FF0000)
  icon?: string,                   // Icon name
  permission?: 'read' | 'read_write', // Default permission
  sharing?: boolean               // Allow sharing
})
```

## Development

### Scripts

```bash
npm run dev      # Development with watch mode
npm run build    # Build TypeScript to JavaScript
npm start        # Run production build
npm test         # Run tests (to be implemented)
```

### Project Structure

```
src/
├── server.ts          # Main Express application with OAuth integration
├── auth/
│   ├── oauth.ts       # OAuth 2.0 authorization server
│   └── middleware.ts  # Authentication middleware
├── mcp/
│   └── server.ts      # MCP server factory and management
├── tools/
│   ├── documents/     # Document management tools (7 tools)
│   │   ├── create.ts, delete.ts, get.ts, list.ts
│   │   ├── move.ts, search.ts, update.ts
│   └── collections/   # Collection management tools (5 tools)
│       ├── create.ts, delete.ts, get.ts, list.ts, update.ts
├── storage/
│   └── tokens.ts      # Token storage (Redis with in-memory fallback)
├── utils/
│   ├── logger.ts      # Secure logging with data anonymization
│   └── outline.ts     # Lazy-loaded Outline API client
└── views/
    └── index.html     # Web interface HTML template

# Configuration
package.json           # Dependencies and build scripts
tsconfig.json          # TypeScript configuration
.env.docker           # Docker environment template
.env.example          # Local development environment template

# Docker Deployment
Dockerfile             # Multi-stage Node.js Docker build
docker-compose.yml     # Full stack with Redis and networking
.dockerignore         # Docker build exclusions
docker-quickstart.md  # Complete Docker setup guide

# Documentation
README.md             # This file - comprehensive project documentation
ARCHITECTURE.md       # Detailed technical architecture documentation
OAUTH_SETUP.md        # Microsoft Azure OAuth configuration guide
CLAUDE.md            # Project development instructions and context
```

## Architecture

### v2 Architecture
- **Transport**: SSE (Server-Sent Events) over HTTP
- **Framework**: @modelcontextprotocol/sdk with Express.js
- **Authentication**: OAuth 2.0 with Microsoft Azure/MS365
- **Security**: Helmet.js security headers, session management, logging anonymization
- **Storage**: Optional Redis with in-memory fallback
- **Language**: TypeScript with ES modules
- **API Client**: Axios for Outline API requests
- **Configuration**: dotenv for environment management

### Security Features
- **Key Anonymization** - All sensitive data in logs is automatically masked
- **Environment Validation** - Fails fast on missing required configuration
- **Secure Sessions** - HTTP-only cookies with CSRF protection
- **PKCE Support** - Proof Key for Code Exchange for enhanced security
- **Security Headers** - Helmet.js for comprehensive security headers

## Error Handling

All tools include comprehensive error handling:
- API authentication errors
- Network connectivity issues
- Invalid parameters
- Resource not found errors
- Rate limiting responses

Errors are returned in a structured format with helpful messages.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the ISC License - see the LICENSE file for details.

## Support

- **Documentation**: See [CLAUDE.md](./CLAUDE.md) for detailed project information
- **Issues**: Report bugs and feature requests via GitHub issues
- **Outline API**: [Official Outline API Documentation](https://www.getoutline.com/developers)

---

**Production Deployment**: `outline-mcp.your-domain.com:3131`
