# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# MCP Outline Remote Server v3

## Project Overview
This is version 3 of the remote MCP (Model Context Protocol) server that provides tools for interacting with Outline (document management platform). Version 3 features simplified authentication using a single Outline API token for all requests, with MCP OAuth for user authentication (to be implemented).

## Development Commands

### Build and Run
```bash
npm install           # Install dependencies
npm run dev          # Development with hot reload (tsx watch)
npm run dev:debug    # Development with debug logging
npm run dev:trace    # Development with trace-level logging
npm run build        # Build TypeScript and copy views
npm start            # Production mode
npm start:debug      # Production with debug logging
```

### Code Quality
Currently no linting or formatting tools are configured. Consider adding:
- ESLint with TypeScript configuration
- Prettier for consistent formatting
- Pre-commit hooks for quality checks

### Testing
No test framework is currently configured. The test script exits with error code 1.

## Architecture

### File Structure
```
src/
├── server.ts          # Main Express app with OAuth integration
├── auth/
│   ├── oauth.ts       # OAuth 2.0 authorization server with PKCE
│   ├── middleware.ts  # Authentication middleware  
│   └── routes.ts      # OAuth endpoints (/auth/authorize, /auth/callback, /auth/token)
├── mcp/
│   └── server.ts      # MCP server factory with SSE transport
├── tools/
│   ├── documents/     # 7 document management tools
│   │   ├── create.ts  # Create new documents
│   │   ├── delete.ts  # Delete documents
│   │   ├── get.ts     # Get document content
│   │   ├── list.ts    # List documents with filters
│   │   ├── move.ts    # Move documents between collections
│   │   ├── search.ts  # Search documents
│   │   └── update.ts  # Update document content
│   └── collections/   # 5 collection management tools
│       ├── create.ts  # Create new collections
│       ├── delete.ts  # Delete collections
│       ├── get.ts     # Get collection details
│       ├── list.ts    # List collections
│       └── update.ts  # Update collection properties
├── storage/
│   └── tokens.ts      # Token storage abstraction (Redis optional)
├── utils/
│   ├── logger.ts      # Pino logger with security serializers
│   └── outline.ts     # Outline API client (lazy-loaded)
└── views/
    └── index.html     # OAuth consent page template
```

### Key Architectural Patterns

1. **OAuth 2.0 with PKCE**: Secure authorization flow with code challenge
2. **Session-based Authentication**: Maps temporary session IDs to real Outline user IDs
3. **Modular Tool System**: Each tool in separate file with Zod schema validation
4. **Storage Abstraction**: Interface-based design supporting Redis or in-memory
5. **Component Logging**: Pino child loggers for each component
6. **Graceful Shutdown**: Proper cleanup on SIGINT/SIGTERM
7. **Health Checks**: MCP server sessions checked every 2 minutes

## Environment Configuration

### Required Variables
```bash
SESSION_SECRET     # Express session secret
OUTLINE_API_URL    # Outline instance URL (e.g., https://app.getoutline.com)
OUTLINE_API_TOKEN  # Outline API token for server access
```

### Optional Variables
```bash
PUBLIC_URL      # Production domain (for OAuth redirects)
REDIS_URL       # Redis connection string (enables persistence)
PORT            # Server port (default: 3131)
NODE_ENV        # Environment (development/production)
LOG_LEVEL       # Logging level: trace, debug, info, warn, error, fatal (default: info)
```

### API Token Configuration
```bash
OUTLINE_API_TOKEN  # Required: Outline API token for server access
AI_BOT_USER_ID     # Optional: User ID for audit logs (default: api-user)
AI_BOT_NAME        # Optional: Display name for logs (default: API User)
AI_BOT_EMAIL       # Optional: Email for logs (default: api@outline.local)
```

## Authentication Flow

1. **MCP Authentication**: Users authenticate to MCP server via OAuth (TODO: implement provider)
2. **Outline Access**: Server uses single API token for all Outline API calls
3. **User Context**: Authenticated user info passed to tools for audit/logging

## Available Tools

### Document Tools (7)
- `list-documents`: Filter by collection, status, dates, sorting
- `create-document`: Create with title, text, collection, publish status
- `get-document`: Retrieve by ID or path with optional include params
- `update-document`: Update title, text, append content, publish status
- `delete-document`: Permanently remove or archive documents
- `search-documents`: Full-text search with filters
- `move-document`: Move between collections

### Collection Tools (5)
- `list-collections`: List all accessible collections
- `create-collection`: Create with name, description, color, icon
- `get-collection`: Retrieve collection details
- `update-collection`: Update name, description, color, icon, permissions
- `delete-collection`: Remove collections

## Important API Notes

**⚠️ CRITICAL: All Outline API endpoints use POST requests** (except OAuth endpoints which use GET/POST as per OAuth 2.0 spec)

### Common Parameters
- **Statuses**: `active`, `archived`, `published`, `draft`, `template`
- **Date Filters**: `updatedAt`, `archivedAt`, `publishedAt`, `createdAt`
- **Sort Options**: `updatedAt`, `index`, `title`, `createdAt`
- **Directions**: `ASC`, `DESC`
- **Colors**: 12 predefined colors for collections
- **Icons**: 50+ available collection icons
- **Permissions**: `read`, `read_write`, `manage`

## Security Features

- **Helmet.js**: Security headers (CSP, HSTS, etc.)
- **CORS**: Restricted to same origin
- **Session Security**: httpOnly, secure cookies in production
- **Token Expiration**: Automatic cleanup of expired tokens
- **Logging Anonymization**: Sensitive data redaction

## Production Deployment

1. Set `NODE_ENV=production`
2. Configure `REDIS_URL` for token persistence
3. Use HTTPS (set `PUBLIC_URL` with https://)
4. Run behind reverse proxy (app trusts proxy headers)
5. Monitor `/health` endpoint
6. Review logs at configured `LOG_LEVEL`

### Docker Deployment
```bash
docker compose up -d  # Uses docker-compose.yml
```

## Development Tips

1. **Hot Reload**: Use `npm run dev` for automatic restarts
2. **Debugging**: Set `LOG_LEVEL=debug` or use `npm run dev:debug`
3. **Network Issues**: Server binds to `0.0.0.0:3131` for tunnel compatibility
4. **Session Timeouts**: 30min inactive, 5min cleanup interval
5. **Token Refresh**: Handled automatically, logs at debug level

## Common Issues

1. **Authentication Errors**: Check OAuth credentials and redirect URI
2. **Network Timeouts**: Verify Outline API URL accessibility
3. **Session Loss**: Ensure `SESSION_SECRET` is set and stable
4. **Redis Connection**: Falls back to in-memory if Redis unavailable

## Migration Notes

- **v1 → v3**: Simple SSE → Modular architecture with API token auth
- **v2 → v3**: Complex dual OAuth → Simple API token for Outline access
- **Breaking Changes**: Removed Outline OAuth, now uses API token only

## Recent Achievements

- Simplified architecture eliminating dual OAuth complexity
- Real user IDs throughout system (no fake ID confusion)
- Clean session mapping for seamless Claude.ai integration
- Production-ready with comprehensive error handling