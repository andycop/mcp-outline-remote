# MCP Outline Remote Authentication Simplification Plan

## Current State Analysis

The current implementation has overly complex dual OAuth authentication:
1. Claude.ai authenticates to MCP server via OAuth
2. MCP server authenticates to Outline via OAuth per-user
3. Complex session mapping between temporary session IDs and real Outline user IDs
4. Token refresh logic for both Claude.ai and Outline tokens
5. Multiple auth middleware checks and token validations

## Target State

Simplify to match memory-multiuser pattern:
1. Users authenticate to MCP server via OAuth (Azure AD, Google, etc.)
2. MCP server uses single Outline API key to access Outline
3. User identity from OAuth is used for audit/logging in tools
4. No per-user Outline OAuth complexity

## Implementation Plan

### [x] 1. Remove Outline OAuth Components
- [x] Delete `src/auth/outline-oauth.ts` 
- [x] Delete `src/auth/outline-oauth-routes.ts`
- [x] Remove Outline OAuth config from environment variables
- [x] Remove session mapping complexity

### [x] 2. Simplify Authentication Middleware
- [x] Update `src/auth/middleware.ts` to only check MCP OAuth tokens
- [x] Remove Outline token checks and refresh logic
- [x] Keep user identity from OAuth for tool context
- [x] Remove session user mapping logic

### [x] 3. Update Outline Client
- [x] Modify `src/utils/outline-client.ts` to use API key only
- [x] Remove per-user token logic
- [x] Ensure API key is used for all Outline API calls

### [x] 4. Simplify Token Storage
- [x] Update `src/storage/tokens.ts` to only store MCP OAuth tokens
- [x] Remove Outline token storage methods
- [x] Remove session mapping storage

### [ ] 5. Update Server Configuration
- [ ] Update `src/server.ts` to remove Outline OAuth routes
- [ ] Add MCP OAuth routes (need to implement similar to memory-multiuser)
- [x] Update environment variable handling

### [ ] 6. Update Tools to Include User Context
- [ ] Modify tools to include authenticated user info in API calls
- [ ] Add user email/name to audit logs or document metadata
- [ ] Ensure tools work with API key authentication

### [ ] 7. Update Environment Configuration
- [ ] Keep `OUTLINE_API_TOKEN` as primary auth method
- [ ] Remove Outline OAuth client ID/secret
- [ ] Keep MCP OAuth configuration (Azure AD, etc.)

### [ ] 8. Testing and Validation
- [ ] Test MCP OAuth flow still works
- [ ] Verify API key authentication to Outline
- [ ] Test all tools work with simplified auth
- [ ] Ensure user context is properly passed

## Benefits
- Simpler codebase with single OAuth flow
- No complex token refresh logic for Outline
- No session mapping confusion
- Easier to debug and maintain
- Matches established pattern from memory-multiuser

## Review

### Completed So Far
1. ✅ Removed Outline OAuth components (files deleted)
2. ✅ Simplified authentication middleware to only check Bearer tokens
3. ✅ Updated Outline client to use API key only
4. ✅ Simplified token storage to remove Outline-specific methods
5. 🔄 Server configuration partially updated

### Still Needed
1. Remove OAuth endpoints from server.ts that handle Outline OAuth
2. Implement MCP OAuth routes (similar to memory-multiuser with Azure AD)
3. Clean up landing page and status endpoints
4. Test the simplified authentication flow
5. Update tools to include user context from MCP OAuth

### Current State
- The codebase has been simplified to remove dual OAuth complexity
- Outline API access now uses a single API key
- MCP authentication structure is in place but needs OAuth provider integration
- Ready for testing once OAuth routes are implemented