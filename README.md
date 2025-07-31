# Outline MCP Remote Server v3

Production-ready Model Context Protocol server for [Outline](https://www.getoutline.com/) integration with Claude.ai. Features simplified OAuth authentication and complete API coverage.

## Features

- **🔐 Direct Outline OAuth** - Single authentication step, seamless Claude.ai integration
- **👤 Per-User Authentication** - Each user accesses their own Outline workspace
- **🔄 Auto Token Management** - Smart refresh, users authorize once
- **🐳 Docker Ready** - Complete containerized deployment with Redis
- **📊 Complete API Coverage** - All 12 Outline tools (7 document + 5 collection tools)

## Quick Start

### Docker (Recommended)

1. **Configure**:
   ```bash
   cp .env.docker .env
   # Edit .env with your OAuth credentials
   ```

2. **Deploy**:
   ```bash
   docker compose up -d
   ```

3. **Access**: http://localhost:3131

### Manual Installation

```bash
npm install
cp .env.example .env
# Edit .env with your credentials
npm run build
npm start
```

## Outline API Setup

1. **In Outline Settings → API**, create an API token:
   - Click "Create token"
   - Give it a descriptive name (e.g., `MCP Server`)
   - Copy the token (starts with `ol_api_`)

2. **Configure environment**:
   ```env
   SESSION_SECRET=your-random-session-secret
   OUTLINE_API_URL=https://your-outline-instance.com/api
   OUTLINE_API_TOKEN=your-api-token
   REDIS_URL=redis://localhost:6379  # optional for token persistence
   ```

## Usage

### Claude.ai Integration
1. Add MCP server in Claude.ai
2. The server uses the configured API token for all Outline access
3. User authentication for MCP can be added via OAuth providers (TODO)

### Available Tools
**Document Tools**: search, get, create, update, delete, list, move  
**Collection Tools**: list, get, create, update, delete

## Development

```bash
npm run dev      # Development with hot reload
npm run build    # Build TypeScript
npm start        # Production mode
```

## Attribution

Based on the [Fellow team MCP server](https://github.com/fellowapp/mcp-outline) with enhanced OAuth and production features.

## Support

- **Documentation**: [CLAUDE.md](./CLAUDE.md) for development details
- **Issues**: GitHub issues for bugs and requests

## License

ISC License