# MCP Server Architecture v2

## Overview
This MCP server implements dual OAuth 2.0 authentication with Microsoft Azure and Outline, providing per-user authentication and a comprehensive modular structure for production deployment.

## Project Structure
```
src/
├── server.ts              # Main Express application with dual OAuth
├── auth/
│   ├── oauth.ts           # Microsoft OAuth 2.0 authorization server
│   ├── middleware.ts      # Authentication middleware
│   ├── outline-oauth.ts   # Outline OAuth 2.0 service
│   └── outline-oauth-routes.ts # Outline OAuth route handlers
├── mcp/
│   └── server.ts          # MCP server factory with user context
├── tools/
│   ├── documents/         # Document management tools (7 tools)
│   │   ├── create.ts, delete.ts, get.ts, list.ts
│   │   ├── move.ts, search.ts, update.ts
│   └── collections/       # Collection management tools (5 tools)
│       ├── create.ts, delete.ts, get.ts, list.ts, update.ts
├── storage/
│   └── tokens.ts          # Token storage (Redis optional, dual OAuth support)
├── utils/
│   ├── logger.ts          # Secure logging with anonymization
│   └── outline-client.ts  # User-specific Outline API client factory
├── types/
│   └── context.ts         # User context and authentication types
├── resources/
│   └── outline-parameters.md # Comprehensive tool parameter documentation
└── views/
    └── index.html         # Enhanced web interface with OAuth status
```

## Key Features

### Modular Design
- **Microsoft OAuth Server** (`auth/oauth.ts`): Complete OAuth 2.0 authorization server with PKCE support
- **Outline OAuth Service** (`auth/outline-oauth.ts`): Per-user Outline authentication with refresh tokens
- **Auth Middleware** (`auth/middleware.ts`): Session and Bearer token authentication
- **MCP Manager** (`mcp/server.ts`): MCP protocol handling with user context injection
- **Storage Layer** (`storage/tokens.ts`): Pluggable storage for dual OAuth tokens (in-memory or Redis)
- **Tool Architecture** (`tools/`): User-context aware tools with per-user API clients
- **Type System** (`types/context.ts`): Comprehensive TypeScript definitions for user context

### Optional Redis Support
The server automatically detects Redis configuration and falls back to in-memory storage:
- Set `REDIS_URL` environment variable to use Redis
- Without `REDIS_URL`, uses in-memory storage (development only)

### Environment Variables

#### Required - Microsoft OAuth
- `MS_CLIENT_ID` - Microsoft Azure application client ID
- `MS_CLIENT_SECRET` - Microsoft Azure application client secret  
- `MS_TENANT` - Microsoft tenant ID (or 'common')
- `SESSION_SECRET` - Express session secret
- `REDIRECT_URI` - Microsoft OAuth redirect URI
- `OUTLINE_API_URL` - Outline instance API base URL

#### Outline Authentication (Choose One)
**Option 1: Per-User OAuth (Recommended)**
- `OUTLINE_OAUTH_CLIENT_ID` - Outline OAuth application client ID
- `OUTLINE_OAUTH_CLIENT_SECRET` - Outline OAuth application client secret
- `OUTLINE_OAUTH_REDIRECT_URI` - Outline OAuth redirect URI

**Option 2: Shared API Token (Legacy)**
- `OUTLINE_API_TOKEN` - Shared Outline API token

#### Optional
- `REDIS_URL` - Redis connection string for production storage
- `NODE_ENV` - Environment (affects cookie security)
- `PORT` - Server port (defaults to 3131)

## Dual Authentication Architecture

### Authentication Layers
1. **Microsoft OAuth (Primary)**: Controls access to the MCP server itself
2. **Outline OAuth (Secondary)**: Per-user access to Outline workspace data

### User Context Flow
```typescript
interface UserContext {
  userId: string;           // From Microsoft OAuth (user.oid)
  outlineClient: OutlineApiClient;  // User-specific API client
}
```

### Token Storage Design
- **Microsoft Tokens**: Stored in session cookies (short-lived)
- **Outline Tokens**: Stored in Redis/memory per user ID (persistent)
- **Automatic Refresh**: Both OAuth implementations handle token refresh
- **Isolation**: Each user's Outline tokens are completely separate

### Tool Architecture
All MCP tools now receive a `UserContext` parameter:
```typescript
export async function searchDocumentsHandler(
  args: SearchDocumentsArgs, 
  context: UserContext
): Promise<SearchDocumentsResult>
```

## Evolution of the Architecture

### v1 (Original)
- Single shared Outline API token
- All users acted as the same Outline user
- Simple but limited security model

### v2 (Current)
- Per-user Outline authentication via OAuth
- Each user accesses their own Outline workspace
- Enhanced security with token isolation
- Comprehensive logging with data anonymization
- Production-ready with Redis persistence

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