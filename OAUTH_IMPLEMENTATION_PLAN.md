# MCP Outline OAuth 2.0 Implementation Plan

## 📋 Project Overview

**Goal**: Convert MCP Outline Remote Server from single API key to per-user OAuth 2.0 authentication, enabling each user to act as themselves in Outline.

**Current State**: Single Outline API key shared across all authenticated users
**Target State**: Each user authorizes via OAuth, actions performed with their Outline permissions

## 🏗️ Architecture Changes

### Phase 1: Outline OAuth Application Registration

**Prerequisites:**
1. Admin access to Outline instance settings
2. Find OAuth/API applications section in Outline admin panel
3. Register new application:
   - **Name**: "MCP Outline Remote Server"
   - **Redirect URI**: `https://outline-mcp.netdaisy.com/auth/outline/callback`
   - **Scopes**: `documents.*` (or specific scopes needed)

**Deliverables:**
- Outline `CLIENT_ID` 
- Outline `CLIENT_SECRET`
- Authorization and token endpoint URLs

### Phase 2: Database Schema Extensions

**New Tables/Fields:**
```sql
-- Extend existing user token storage
ALTER TABLE user_tokens ADD COLUMN outline_access_token TEXT ENCRYPTED;
ALTER TABLE user_tokens ADD COLUMN outline_refresh_token TEXT ENCRYPTED;
ALTER TABLE user_tokens ADD COLUMN outline_token_expires_at BIGINT;
ALTER TABLE user_tokens ADD COLUMN outline_scopes TEXT;
ALTER TABLE user_tokens ADD COLUMN outline_authorized_at TIMESTAMP;
```

**Or new dedicated table:**
```sql
CREATE TABLE outline_user_tokens (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL, -- Microsoft oid
  access_token TEXT NOT NULL ENCRYPTED,
  refresh_token TEXT NOT NULL ENCRYPTED, 
  expires_at BIGINT NOT NULL,
  scopes TEXT NOT NULL,
  authorized_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Phase 3: Environment Configuration

**New Environment Variables:**
```env
# Outline OAuth - REQUIRED (Phase 1)
OUTLINE_OAUTH_CLIENT_ID=your-outline-oauth-client-id
OUTLINE_OAUTH_CLIENT_SECRET=your-outline-oauth-client-secret
OUTLINE_OAUTH_REDIRECT_URI=https://outline-mcp.netdaisy.com/auth/outline/callback

# Outline OAuth Endpoints (auto-discovered or manual)
OUTLINE_OAUTH_AUTH_URL=https://outline.netdaisy.com/oauth/authorize
OUTLINE_OAUTH_TOKEN_URL=https://outline.netdaisy.com/oauth/token

# Legacy (keep during transition)
OUTLINE_API_TOKEN=your-fallback-api-token
```

## 🔧 Code Implementation Plan

### Phase 4: OAuth Service Implementation

**File**: `src/auth/outline-oauth.ts`
```typescript
export class OutlineOAuthService {
  // Generate authorization URL for user redirect
  generateAuthUrl(userId: string, state: string): string
  
  // Exchange authorization code for tokens
  exchangeCodeForTokens(code: string, state: string): Promise<TokenData>
  
  // Refresh expired access tokens
  refreshAccessToken(userId: string): Promise<TokenData>
  
  // Revoke user's OAuth tokens
  revokeUserTokens(userId: string): Promise<void>
}
```

**Key Methods:**
- PKCE support for enhanced security
- State parameter validation (CSRF protection)
- Automatic token refresh with retry logic
- Secure token storage/retrieval

### Phase 5: OAuth Endpoints

**File**: `src/auth/outline-oauth-routes.ts`
```typescript
// New OAuth routes to add to main router
router.get('/auth/outline/connect', authenticatedMiddleware, outlineOAuthConnect);
router.get('/auth/outline/callback', authenticatedMiddleware, outlineOAuthCallback);  
router.post('/auth/outline/disconnect', authenticatedMiddleware, outlineOAuthDisconnect);
router.get('/auth/outline/status', authenticatedMiddleware, outlineOAuthStatus);
```

**Route Handlers:**
1. **Connect**: Redirects user to Outline OAuth authorization
2. **Callback**: Handles OAuth response, exchanges code for tokens
3. **Disconnect**: Revokes and removes user's Outline tokens
4. **Status**: Returns user's Outline connection status

### Phase 6: Enhanced Token Storage

**File**: `src/storage/outline-tokens.ts`
```typescript
export interface OutlineTokenStorage {
  setUserTokens(userId: string, tokens: OutlineTokenData): Promise<void>;
  getUserTokens(userId: string): Promise<OutlineTokenData | null>;
  refreshUserTokens(userId: string): Promise<OutlineTokenData>;
  deleteUserTokens(userId: string): Promise<void>;
  isUserAuthorized(userId: string): Promise<boolean>;
}

interface OutlineTokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
}
```

### Phase 7: Updated Outline API Client

**File**: `src/utils/outline-client.ts`
```typescript
export class OutlineApiClient {
  // Replace single API key with per-user token
  async makeRequest(userId: string, endpoint: string, options: RequestOptions) {
    const tokens = await this.tokenStorage.getUserTokens(userId);
    
    if (!tokens) {
      throw new OutlineNotAuthorizedException('User not connected to Outline');
    }
    
    if (this.isTokenExpired(tokens)) {
      tokens = await this.tokenStorage.refreshUserTokens(userId);
    }
    
    return this.httpClient.request({
      ...options,
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        ...options.headers
      }
    });
  }
}
```

### Phase 8: MCP Tool Updates

**Files**: `src/tools/documents/*.ts`, `src/tools/collections/*.ts`

**Changes Required:**
```typescript
// Before (current)
export const listDocumentsHandler = async (args: any) => {
  const response = await outlineClient.get('/api/documents.list', { 
    collection: args.collection_id 
  });
  return { content: [{ type: 'text', text: JSON.stringify(response.data) }] };
};

// After (with user context)
export const listDocumentsHandler = async (args: any, context: { userId: string }) => {
  try {
    const response = await outlineClient.makeRequest(
      context.userId, 
      '/api/documents.list', 
      { method: 'GET', params: { collection: args.collection_id } }
    );
    return { content: [{ type: 'text', text: JSON.stringify(response.data) }] };
  } catch (error) {
    if (error instanceof OutlineNotAuthorizedException) {
      return { 
        content: [{ 
          type: 'text', 
          text: 'Please connect your Outline account first. Visit /auth/outline/connect' 
        }] 
      };
    }
    throw error;
  }
};
```

### Phase 9: MCP Server Context Enhancement

**File**: `src/mcp/server.ts`

**Changes:**
```typescript
// Pass user context to tool handlers
server.tool('list_documents', 'List documents in a collection', 
  listDocumentsSchema, 
  async (args, context) => {
    const userId = context.meta?.userId || context.session?.user?.oid;
    return listDocumentsHandler(args, { userId });
  }
);
```

## 🚀 Implementation Phases

### Phase 1: Foundation (Day 1-2)
- [ ] Register OAuth app in Outline
- [ ] Add environment variables
- [ ] Extend token storage schema
- [ ] Create OutlineOAuthService skeleton

### Phase 2: OAuth Flow (Day 3-4)  
- [ ] Implement OAuth authorization flow
- [ ] Build callback handler with token exchange
- [ ] Add OAuth routes to main server
- [ ] Test complete OAuth round-trip

### Phase 3: API Integration (Day 5-6)
- [ ] Update Outline API client for per-user tokens
- [ ] Implement token refresh logic
- [ ] Add error handling for unauthorized users
- [ ] Test API calls with OAuth tokens

### Phase 4: Tool Migration (Day 7-8)
- [ ] Update all document tools to use user context
- [ ] Update all collection tools to use user context  
- [ ] Add proper error messages for unauthorized users
- [ ] Test all tools with different user accounts

### Phase 5: User Experience (Day 9-10)
- [ ] Add OAuth status to health/status endpoints
- [ ] Create user-friendly connection flow
- [ ] Add disconnect/revoke functionality
- [ ] Test complete user journey

## 🧪 Testing Strategy

### Unit Tests
- OAuth token exchange and refresh
- Token storage encryption/decryption
- API client with user context
- Error handling for unauthorized users

### Integration Tests  
- Complete OAuth authorization flow
- Token refresh scenarios
- Multi-user scenarios (Andy + Christina)
- Tool execution with different user permissions

### User Acceptance Tests
1. **New User Flow**: Christina authenticates → connects Outline → uses tools
2. **Existing User Flow**: Andy continues using tools seamlessly  
3. **Permission Testing**: Users only see their accessible documents
4. **Error Recovery**: Handle expired/revoked tokens gracefully

## 📚 Documentation Updates

### README.md Updates
```markdown
## Outline Authentication

### OAuth 2.0 Setup (Recommended)
1. Register OAuth application in Outline admin panel
2. Configure environment variables:
   ```env
   OUTLINE_OAUTH_CLIENT_ID=your-client-id
   OUTLINE_OAUTH_CLIENT_SECRET=your-client-secret
   ```
3. Users connect via `/auth/outline/connect`

### Legacy API Key (Deprecated)
- Still supported for backward compatibility
- Will be removed in future version
```

### CLAUDE.md Updates
- Add OAuth implementation details
- Document new environment variables
- Update tool behavior with user context
- Add troubleshooting guide

## 🔒 Security Considerations

### Token Security
- Encrypt Outline tokens at rest (same as existing tokens)
- Use secure HTTP-only sessions for OAuth state
- Implement PKCE for additional security
- Regular token rotation via refresh flow

### Error Handling
- Never expose OAuth client secret in logs
- Graceful degradation for unauthorized users
- Clear error messages without sensitive data
- Proper logging with anonymization

### Scope Management
- Request minimal necessary scopes
- Allow scope adjustment in future
- Document permission requirements per tool

## 🎯 Success Criteria

### Functional Requirements
- [ ] Users authenticate as themselves in Outline
- [ ] Permissions match user's actual Outline access
- [ ] Seamless token refresh without user intervention
- [ ] Backward compatibility during transition

### Non-Functional Requirements  
- [ ] Zero downtime deployment
- [ ] Encrypted token storage
- [ ] Performance equivalent to current implementation
- [ ] Clear error messages and user guidance

## 🚧 Migration Strategy

### Gradual Rollout
1. **Phase 1**: Deploy OAuth alongside existing API key
2. **Phase 2**: Encourage users to connect OAuth accounts
3. **Phase 3**: Make OAuth required for new users
4. **Phase 4**: Deprecate API key authentication

### Rollback Plan
- Keep existing API key as fallback
- Feature flag to disable OAuth if needed
- Database schema allows reverting token changes

---

## 📝 Implementation Checklist

### Environment Setup
- [ ] Outline OAuth app registration
- [ ] Environment variables configured
- [ ] Database schema extended

### Core Implementation
- [ ] OutlineOAuthService implemented
- [ ] OAuth routes added
- [ ] Token storage extended
- [ ] API client updated

### Tool Updates
- [ ] All document tools updated
- [ ] All collection tools updated
- [ ] Error handling added
- [ ] User context passed correctly

### Testing & Deployment
- [ ] Unit tests written and passing
- [ ] Integration tests completed
- [ ] Docker container rebuilt
- [ ] Documentation updated
- [ ] User acceptance testing completed

This implementation plan provides a comprehensive roadmap for the next Claude Code session to implement OAuth 2.0 authentication for the MCP Outline Remote Server.