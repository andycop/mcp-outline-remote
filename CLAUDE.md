# MCP Outline Remote Server v3

## Project Overview
This is version 3 of the remote MCP (Model Context Protocol) server that provides tools for interacting with Outline (document management platform). Version 3 features streamlined Outline OAuth authentication as the primary authentication method, eliminating dual OAuth complexity and providing seamless Claude.ai integration.

## v3 Status - Production Ready ✅

**Completed**: Streamlined Outline OAuth architecture with simplified authentication, all 12 tools, production security, modular structure, optional Redis, Claude.ai integration.

### Key Achievements
- **🔐 Single OAuth Step** - Direct Outline OAuth, eliminated dual authentication complexity
- **⚡ Claude.ai Bridge** - Seamless MCP client authentication via OAuth endpoints
- **🛡️ Production Security** - Logging anonymization, security headers, environment validation
- **🏗️ Clean Architecture** - Modular design with separated concerns
- **📊 Monitoring Ready** - Health checks, structured logging, graceful shutdown

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

**Document Tools (7)**: list, create, get, update, delete, search, move  
**Collection Tools (5)**: list, create, get, update, delete

All tools support per-user authentication and comprehensive error handling.

## Environment Configuration

**Required**: `SESSION_SECRET`, `OUTLINE_API_URL`, `OUTLINE_OAUTH_CLIENT_ID`, `OUTLINE_OAUTH_CLIENT_SECRET`, `OUTLINE_OAUTH_REDIRECT_URI`

**Optional**: `PUBLIC_URL` (production domain), `REDIS_URL` (enables Redis), `PORT` (default: 3131), `NODE_ENV`

## Technical Features

### OAuth Integration
- **Single authentication step**: Direct Outline OAuth (no dual authentication)
- **Claude.ai bridge**: OAuth endpoints handle MCP client integration
- **Auto token refresh**: Access tokens ~1-2 hours, refresh tokens weeks-months
- **PKCE security**: Enhanced OAuth with code challenge verification

### Authentication Flow
1. Claude.ai integration → OAuth bridge initiates Outline authorization
2. User authorizes once on Outline OAuth page
3. System handles all token management automatically
4. Re-authorization only if refresh tokens expire

### Network Configuration
- Binds to `0.0.0.0:3131` for Cloudflare tunnel compatibility
- Configure `PUBLIC_URL` environment variable for production deployments

## Development Commands
```bash
npm run dev      # Development with hot reload
npm run build    # Build TypeScript
npm start        # Production mode
```

## Migration Notes
- **v1 → v3**: Simple SSE → Streamlined Outline OAuth, enhanced security, modular architecture
- **v2 → v3**: Dual OAuth → Single Outline OAuth with Claude.ai bridge  
- **Breaking changes**: Authentication overhaul, simplified configuration
- **Benefits**: Faster onboarding, reduced complexity, better UX

## Production Deployment
1. Set `NODE_ENV=production`
2. Configure `REDIS_URL` for persistence  
3. Use HTTPS for redirect URIs
4. Monitor logs for security events

## Important Notes

**⚠️ CRITICAL: All Outline API endpoints use POST requests** (except OAuth endpoints)

## Next Priorities

### Tool Optimizations
- LLM-optimized responses for better Claude.ai integration
- Enhanced error messages and result summarization
- Performance optimizations

### Future Improvements  
- Enhanced error handling and rate limiting
- Monitoring metrics and testing framework

## Recent Session Summaries

### 🎉 Architectural Success (2025-06-30)
**Major Achievement**: Simplified architecture eliminating dual OAuth complexity

✅ **Authentication Flow Success**:
1. Session Created: temporary ID → Real Outline user ID mapping
2. OAuth Completed: Real user ID (dd22f354-d625-412a-a374-1b95c4353557) obtained  
3. Claude.ai Tokens: Use real user ID directly
4. API Usage: All tools work without authentication errors

✅ **Architecture Benefits**:
- Single token refresh logic (only Outline tokens need management)
- Real user IDs throughout (no fake ID confusion)
- Clean session mapping (temp session ID bridges to permanent real ID)
- Eliminated timing issues (no dual token expiration conflicts)

### Previous Accomplishments (2025-06-29)
- OAuth 2.0 refresh token implementation with session persistence
- Production Docker setup with Redis and health checks  
- Fixed Claude.ai timeout issues with automatic token refresh