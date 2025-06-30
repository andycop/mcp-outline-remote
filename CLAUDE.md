# MCP Outline Remote Server v2

## Project Overview
This is version 2 of the remote MCP (Model Context Protocol) server that provides tools for interacting with Outline (document management platform). Version 2 features streamlined Outline OAuth authentication, enhanced security, and production-ready architecture.

## v2 Current Status (2025-06-30)
- ✅ **COMPLETED**: Migrated to OAuth-enabled mcp-server architecture
- ✅ **COMPLETED**: All 12 Outline tools implemented with TypeScript
- ✅ **COMPLETED**: Simplified OAuth 2.0 integration with Outline as primary authentication
- ✅ **COMPLETED**: Comprehensive security features and logging anonymization
- ✅ **COMPLETED**: Modular architecture with clean separation of concerns
- ✅ **COMPLETED**: Optional Redis storage with in-memory fallback
- ✅ **COMPLETED**: Production deployment configuration
- ✅ **COMPLETED**: Direct Outline OAuth integration eliminating dual authentication

## What's New in v2

### 🔐 **Simplified OAuth 2.0 Authentication**
- **Direct Outline OAuth integration** - Single authentication step eliminates dual OAuth complexity
- **Claude.ai seamless flow** - OAuth bridge handles MCP client authentication automatically  
- **One-time authorization** - Users authorize once, automatic token refresh handles renewals
- **Session management** with secure HTTP-only cookies
- **PKCE security** for enhanced OAuth protection

### 🛡️ **Enhanced Security**
- **Logging anonymization system** - Automatically masks sensitive data
  - Anonymization rules: strings ≥8 chars: `sk-1***5678`, <8 chars: `ab*de`
  - Auto-protects tokens, secrets, session IDs, tenant IDs
- **Security headers** via Helmet.js
- **Environment validation** - Fails fast on missing required vars
- **Graceful shutdown** handling

### 🏗️ **Modular Architecture**
- **Separated concerns**: auth, MCP, storage, utils, tools
- **Tool organization**: documents/ and collections/ subdirectories
- **Maintainable structure** for easy expansion

### 📊 **Production Features**
- **Optional Redis support** with automatic fallback
- **Structured logging** throughout all modules
- **Health checks** and monitoring endpoints
- **Network binding** to 0.0.0.0 for Cloudflare tunnel compatibility

## Architecture

### File Structure
```
src/
├── server.ts          # Main Express app with OAuth integration
├── auth/
│   ├── oauth.ts       # OAuth 2.0 authorization server
│   └── middleware.ts  # Authentication middleware  
├── mcp/
│   └── server.ts      # MCP server factory and management
├── tools/
│   ├── documents/     # 7 document management tools
│   │   ├── create.ts, delete.ts, get.ts, list.ts
│   │   ├── move.ts, search.ts, update.ts
│   └── collections/   # 5 collection management tools
│       ├── create.ts, delete.ts, get.ts, list.ts, update.ts
├── storage/
│   └── tokens.ts      # Token storage (Redis optional)
├── utils/
│   ├── logger.ts      # Secure logging with anonymization
│   └── outline.ts     # Outline API client (lazy-loaded)
└── views/
    └── index.html     # HTML template for web interface
```

## Available Tools
All tools migrated from the Fellow Outline MCP server with enhanced security:

### Document Tools (7)
- ✅ `list_documents` - List documents in a collection
- ✅ `create_document` - Create a new document
- ✅ `get_document` - Get a document by ID
- ✅ `update_document` - Update a document
- ✅ `delete_document` - Delete a document
- ✅ `search_documents` - Search documents by query
- ✅ `move_document` - Move a document to another collection

### Collection Tools (5)
- ✅ `list_collections` - List all collections
- ✅ `create_collection` - Create a new collection
- ✅ `get_collection` - Get a collection by ID
- ✅ `update_collection` - Update a collection
- ✅ `delete_collection` - Delete a collection

## Environment Configuration

### Required Variables
```env
# Session Configuration
SESSION_SECRET=your-super-long-random-secret-key

# Outline API Base
OUTLINE_API_URL=https://your-outline-instance.com/api

# Outline OAuth (Primary Authentication - Recommended)
OUTLINE_OAUTH_CLIENT_ID=your-outline-oauth-client-id
OUTLINE_OAUTH_CLIENT_SECRET=your-outline-oauth-client-secret
OUTLINE_OAUTH_REDIRECT_URI=https://your-domain.com/auth/outline/callback

# Legacy API Token (Fallback - Shared Authentication)
OUTLINE_API_TOKEN=your-outline-api-token
```

### Optional Variables
```env
REDIS_URL=redis://localhost:6379      # enables Redis storage
PORT=3131
NODE_ENV=development
```

## Key Technical Features

### Lazy-Loaded Outline Client
The Outline API client is lazy-loaded to ensure environment variables are available:
```typescript
// Creates client only when first used, after dotenv.config()
export const outlineClient = new Proxy({} as AxiosInstance, {
  get(target, prop) {
    const client = createOutlineClient();
    return (client as any)[prop];
  }
});
```

### OAuth Integration
- **Single authentication step**: Direct Outline OAuth integration eliminates dual authentication
- **Claude.ai seamless flow**: OAuth bridge handles MCP client integration automatically
- **Automatic token refresh**: Users authorize once, system handles token renewals transparently
- **Session management**: Secure, HTTP-only cookies with Redis persistence
- **PKCE flow**: Enhanced security for Outline OAuth with code challenge verification

### Authentication Flow
1. **Claude.ai Integration**: User adds MCP server in Claude.ai (seamless)
2. **First Tool Use**: User clicks "Authorize" once on Outline OAuth page
3. **Automatic Operation**: All subsequent tool usage works without re-authentication
4. **Token Management**: System automatically refreshes tokens (access tokens ~1-2 hours, refresh tokens weeks-months)
5. **Re-authorization**: Only required if refresh tokens expire or user manually disconnects

### Network Configuration
- **Binds to `0.0.0.0:3131`** for Cloudflare tunnel compatibility
- **Public URL**: `https://outline-mcp.netdaisy.com`
- **Internal URL**: `http://10.123.1.30:3131`

## Development Commands
```bash
npm run dev      # Development with hot reload
npm run build    # Build TypeScript to JavaScript
npm start        # Production mode
```

## Migration Notes from v1
- **v1**: Simple SSE-based server with basic authentication
- **v2**: Streamlined Outline OAuth integration, enhanced security, modular architecture
- **Breaking changes**: Simplified OAuth flow, removed Microsoft OAuth dependency
- **Backward compatibility**: Same MCP tools, improved authentication and reliability

## Production Deployment
1. Set `NODE_ENV=production`
2. Configure `REDIS_URL` for token storage
3. Use HTTPS for `REDIRECT_URI`
4. Set secure session configuration
5. Monitor logs for security events

The v2 server is production-ready with streamlined Outline OAuth, comprehensive security, and all Outline API functionality from the original Fellow implementation.

## Important Outline API Notes

**⚠️ CRITICAL: All Outline API endpoints use POST requests**
- Every API endpoint in Outline's documentation uses POST, including auth.info
- No GET requests found in the API documentation 
- Always use POST when calling Outline API endpoints
- This includes user info, document operations, collection operations, etc.
- OAuth endpoints (/oauth/authorize, /oauth/token) follow standard OAuth patterns

## What To Work On Next

### 🔧 **Tool Optimizations** (Next Priority)
1. **LLM-optimized tool responses** - Enhance tool outputs for better Claude.ai integration
2. **Response formatting** - Improve data structure and readability for AI consumption  
3. **Tool efficiency** - Reduce API calls and optimize performance
4. **Enhanced error messages** - More descriptive and actionable error responses
5. **Result summarization** - Add intelligent summarization for large result sets

### 🚀 **Future Improvements**
1. **Error handling** - More robust error boundaries and user feedback
2. **Rate limiting** - Add request rate limiting for security
3. **Monitoring** - Add metrics/health checks for production
4. **Testing framework** - Add proper unit/integration tests

## Session Summary (2025-06-30)

### ✅ **Major Accomplishments**
- **OAuth Simplification** - Eliminated dual authentication by using Outline OAuth as primary
- **Seamless Claude.ai Integration** - Implemented OAuth bridge for transparent MCP client authentication  
- **Automatic Token Refresh** - Users authorize once, system handles all token renewals transparently
- **Web Interface Cleanup** - Fixed broken links, updated status endpoints, corrected documentation
- **Production-Ready Authentication** - Single-step OAuth flow with comprehensive error handling

### 🔬 **Technical Details**
- **Simplified Authentication**: Single Outline OAuth step instead of dual Microsoft + Outline
- **OAuth Bridge**: `/authorize` and `/token` endpoints bridge Claude.ai OAuth to Outline authentication
- **Token Management**: Automatic refresh with 5-minute buffer, access tokens ~1-2 hours, refresh tokens weeks-months
- **Bearer Authentication**: MCP endpoints use Bearer tokens, web interface uses session-based auth
- **Environment Simplification**: Removed Microsoft OAuth variables, streamlined configuration

### 🐛 **Critical Fixes**
**Issue**: "Cannot GET /authorize" and "Cannot GET /auth/outline/callback" routing errors
- **Root Cause**: Missing OAuth endpoints and incorrect route mounting after Microsoft OAuth removal
- **Solution**: Implemented OAuth bridge endpoints and corrected callback route mounting
- **Impact**: Claude.ai can now seamlessly authenticate through simplified Outline OAuth flow

### 📋 **Simplified Authentication Flow**
Users now experience a single authentication step:
1. **Claude.ai Integration**: Add MCP server → Automatic OAuth initiation
2. **Outline Authentication**: Single OAuth consent to Outline workspace
3. **Immediate Access**: All MCP tools available without additional authentication steps

## Previous Session (2025-06-29)

### ✅ **Major Accomplishments**
- **OAuth 2.0 Refresh Token Implementation** - Added complete refresh token support
- **Session Persistence** - Fixed Claude.ai timeout issues with automatic token refresh
- **Production Docker Setup** - Redis persistence, health checks, reboot script
- **Documentation Updates** - Fixed MS_TENANT requirements, added comprehensive guides

### 🔬 **Technical Details**
- **Token Lifetimes**: Access tokens (1 hour), Refresh tokens (7 days with rotation)
- **Storage**: Redis persistent storage with in-memory fallback
- **Security**: Proper OAuth 2.0 error codes, token rotation, anonymized logging
- **Development**: Added `./reboot.sh` script for easy container rebuilds