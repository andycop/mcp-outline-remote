# MCP Server Architecture

## Overview
This MCP server implements OAuth 2.0 authentication with Microsoft Azure and provides a clean, modular structure while maintaining simplicity.

## Project Structure
```
src/
├── server-new.ts          # Main Express application (refactored)
├── auth/
│   ├── oauth.ts           # OAuth 2.0 authorization server
│   └── middleware.ts      # Authentication middleware
├── mcp/
│   └── server.ts          # MCP server factory and management
├── storage/
│   └── tokens.ts          # Token storage (Redis optional)
└── views/
    └── index.html         # HTML template
```

## Key Features

### Modular Design
- **OAuth Server** (`auth/oauth.ts`): Complete OAuth 2.0 authorization server with PKCE support
- **Auth Middleware** (`auth/middleware.ts`): Session and Bearer token authentication
- **MCP Manager** (`mcp/server.ts`): MCP protocol handling and session management
- **Storage Layer** (`storage/tokens.ts`): Pluggable storage for tokens (in-memory or Redis)

### Optional Redis Support
The server automatically detects Redis configuration and falls back to in-memory storage:
- Set `REDIS_URL` environment variable to use Redis
- Without `REDIS_URL`, uses in-memory storage (development only)

### Environment Variables
Required:
- `MS_CLIENT_ID` - Microsoft Azure application client ID
- `MS_CLIENT_SECRET` - Microsoft Azure application client secret  
- `SESSION_SECRET` - Express session secret
- `REDIRECT_URI` - OAuth redirect URI

Optional:
- `MS_TENANT` - Microsoft tenant ID (defaults to 'common')
- `REDIS_URL` - Redis connection string for production storage
- `NODE_ENV` - Environment (affects cookie security)
- `PORT` - Server port (defaults to 3131)

## Benefits of Refactoring

### Before (server.ts)
- Single 540-line file
- Mixed concerns (OAuth + MCP + Express + HTML)
- In-memory only storage
- Difficult to test individual components

### After (server-new.ts + modules)
- Clean separation of concerns
- Each module has single responsibility
- Optional Redis support with graceful fallback
- Easier to test, extend, and maintain
- Template-based HTML rendering

## Running the Server

Development:
```bash
npm run dev          # Uses refactored structure
npm run dev-old      # Uses original single file
```

Production:
```bash
npm run build
npm start
```

## Compatibility
The refactored server maintains 100% API compatibility with the original implementation. All endpoints, authentication flows, and MCP protocol handling work identically.