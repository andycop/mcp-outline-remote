# Outline OAuth 2.0 Authentication Guide

## Overview

**✅ Outline DOES support OAuth 2.0 provider functionality!**

Outline provides OAuth 2.0 endpoints that allow third-party applications to authenticate users and access the API on their behalf. This enables per-user authentication where each user can connect their individual Outline account.

## Authentication Methods

1. **OAuth 2.0** (Recommended) - Per-user authentication, each user acts as themselves
2. **Personal Access Token** (Fallback) - Shared token, all users act as the token owner

## Prerequisites

- Admin access to your Outline instance
- Access to Outline's admin panel/settings
- The MCP server deployed and accessible via HTTPS (required for OAuth)

## Step 1: Check Outline OAuth Support

First, verify that your Outline instance supports OAuth 2.0 applications:

1. **Log into Outline** as an administrator
2. **Navigate to Settings** (usually via your profile menu)
3. **Look for one of these sections:**
   - "API & Integrations" 
   - "Applications"
   - "OAuth Applications"
   - "Developer Settings"
   - "Third-party Apps"

> **Note:** OAuth application support varies by Outline version and deployment type. If you don't see these options, your Outline instance may not support OAuth applications, or it may be located elsewhere in the admin interface.

## Step 2: Register OAuth Application in Outline

### Option A: Via Admin Panel (Most Common)

1. **Access Admin Settings**
   - Go to Outline Settings → Admin/Applications section
   - Look for "OAuth Applications" or "API Applications"

2. **Create New Application**
   - Click "New Application" or "Register Application"
   - Fill in the application details:

   ```
   Application Name: MCP Outline Remote Server
   Description: Model Context Protocol server for Claude.ai integration
   Application Type: Web Application
   Client Type: Confidential
   ```

3. **Configure Redirect URIs**
   - **Production**: `https://outline-mcp.netdaisy.com/auth/outline/callback`
   - **Development**: `http://localhost:3131/auth/outline/callback`
   - Add both if testing locally and in production

4. **Set Scopes/Permissions**
   - Select the minimum required scopes:
     ```
     documents:read
     documents:write
     collections:read
     collections:write
     user:read (for user identification)
     ```

5. **Save and Generate Credentials**
   - Click "Create Application" or "Save"
   - **Copy the Client ID and Client Secret immediately**
   - Store these securely - the Client Secret may only be shown once

### Option B: Via API (Alternative)

If your Outline instance supports API-based app registration:

```bash
curl -X POST https://your-outline-instance.com/api/oauth/applications \
  -H "Authorization: Bearer YOUR_OUTLINE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MCP Outline Remote Server",
    "redirect_uris": ["https://outline-mcp.netdaisy.com/auth/outline/callback"],
    "scopes": ["documents:read", "documents:write", "collections:read", "collections:write", "user:read"]
  }'
```

**Note:** The OAuth endpoints for Outline are:
- **Authorization URL:** `https://your-outline-instance.com/oauth/authorize`
- **Token URL:** `https://your-outline-instance.com/oauth/token` (NOT `/oauth/access_token`)

### Option C: Self-Hosted Outline Configuration

For self-hosted Outline instances, you may need to enable OAuth applications in your configuration:

1. **Check Environment Variables** in your Outline deployment:
   ```env
   # Ensure OAuth is enabled
   OAUTH_ENABLED=true
   
   # Your Outline base URL (no trailing slash)
   URL=https://your-outline-instance.com
   ```

2. **Restart Outline** after making configuration changes

3. **Check Documentation** for your specific Outline version at:
   - [Outline Self-Hosting Guide](https://docs.getoutline.com/s/hosting/)
   - [Outline API Documentation](https://docs.getoutline.com/api)

## Step 3: Configure MCP Server Environment

### Required Environment Variables

Add these variables to your `.env` file:

```env
# Outline OAuth Configuration (REQUIRED for per-user auth)
OUTLINE_OAUTH_CLIENT_ID=your-outline-oauth-client-id-from-step-2
OUTLINE_OAUTH_CLIENT_SECRET=your-outline-oauth-client-secret-from-step-2
OUTLINE_OAUTH_REDIRECT_URI=https://outline-mcp.netdaisy.com/auth/outline/callback

# Outline API Configuration (REQUIRED)
OUTLINE_API_URL=https://your-outline-instance.com/api

# Legacy API Token (OPTIONAL - for fallback during transition)
OUTLINE_API_TOKEN=your-existing-outline-api-token
```

### Production vs Development URLs

**Production (HTTPS required for OAuth):**
```env
OUTLINE_OAUTH_REDIRECT_URI=https://outline-mcp.netdaisy.com/auth/outline/callback
```

**Development (HTTP allowed for localhost):**
```env
OUTLINE_OAUTH_REDIRECT_URI=http://localhost:3131/auth/outline/callback
```

### Example Complete Configuration

```env
# Microsoft OAuth (existing)
MS_CLIENT_ID=your-azure-client-id
MS_CLIENT_SECRET=your-azure-client-secret
MS_TENANT=your-app-tenant-id
SESSION_SECRET=your-random-session-secret
REDIRECT_URI=https://outline-mcp.netdaisy.com/auth/callback

# Outline OAuth (new)
OUTLINE_OAUTH_CLIENT_ID=outline_app_12345abcdef
OUTLINE_OAUTH_CLIENT_SECRET=secret_67890ghijkl
OUTLINE_OAUTH_REDIRECT_URI=https://outline-mcp.netdaisy.com/auth/outline/callback

# Outline API
OUTLINE_API_URL=https://your-outline-instance.com/api
OUTLINE_API_TOKEN=ol_api_legacy_token_for_fallback

# Optional
REDIS_URL=redis://localhost:6379
PORT=3131
NODE_ENV=production
```

## Step 4: Test OAuth Configuration

### 1. Restart MCP Server

```bash
# If using Docker
./reboot.sh

# If running manually
npm run build
npm start
```

### 2. Verify OAuth Service Initialization

Check the server logs for:
```
[INFO] Creating Outline API client {
  "baseURL": "https://your-outline-instance.com/api",
  "hasLegacyToken": true,
  "hasOAuthService": true
}
```

### 3. Test Authentication Flow

1. **Access the MCP Server**: Visit `https://outline-mcp.netdaisy.com`
2. **Login with MS365**: Complete Microsoft authentication
3. **Check Outline Status**: Visit `/auth/outline/status`
   - Should show: `{"status": "not_connected", "connected": false}`
4. **Connect to Outline**: Visit `/auth/outline/connect`
   - Should redirect to Outline OAuth authorization page
5. **Authorize the Application** in Outline
6. **Verify Connection**: Check `/auth/outline/status` again
   - Should show: `{"status": "connected", "connected": true}`

## Step 5: Test MCP Tools with Per-User Authentication

### Test List Documents Tool

The `list_documents` tool has been updated to use per-user authentication:

1. **Use Claude.ai** or another MCP client
2. **Call the list_documents tool**
3. **Expected Behavior:**
   - **If connected**: Returns documents from your Outline account
   - **If not connected**: Returns message asking you to connect via `/auth/outline/connect`

### Legacy Tool Fallback

Other tools (create_document, get_document, etc.) still use the legacy API token during the transition period.

## Troubleshooting

### Common Issues

#### 1. "OAuth not configured" Message

**Problem**: OAuth service not initializing
**Solution**: Verify environment variables are set correctly:
```bash
echo $OUTLINE_OAUTH_CLIENT_ID
echo $OUTLINE_OAUTH_CLIENT_SECRET
```

#### 2. "Application not found" Error

**Problem**: Outline OAuth app not properly registered
**Solutions**:
- Verify the Client ID matches exactly
- Check that the application is active in Outline
- Ensure redirect URI matches exactly (including HTTPS/HTTP)

#### 3. "Invalid redirect_uri" Error

**Problem**: Redirect URI mismatch
**Solutions**:
- Ensure redirect URI in environment matches the one registered in Outline
- Check for trailing slashes or HTTP vs HTTPS mismatches
- Verify the MCP server is accessible at the registered URL

#### 4. "Scope not authorized" Error

**Problem**: Insufficient permissions granted
**Solutions**:
- Check the scopes granted to your OAuth application in Outline
- Ensure your Outline user has permission to access documents/collections
- Try disconnecting and reconnecting to refresh permissions

#### 5. Token Refresh Failures

**Problem**: Access token expired and refresh failed
**Solutions**:
- Check Outline server connectivity
- Verify OAuth application is still active
- Disconnect and reconnect to get fresh tokens

### Debug Commands

```bash
# Check environment variables
env | grep OUTLINE

# Test OAuth endpoints
curl -s http://localhost:3131/auth/outline/status

# Check server logs
docker compose logs -f mcp-outline-server

# Test Outline API connectivity
curl -H "Authorization: Bearer $OUTLINE_API_TOKEN" \
     https://your-outline-instance.com/api/auth.info
```

### Logs to Check

Look for these log messages:

**Successful OAuth Service Creation:**
```json
{
  "level": "info",
  "message": "Creating Outline API client",
  "baseURL": "https://your-outline-instance.com/api",
  "hasOAuthService": true
}
```

**OAuth Flow Initiation:**
```json
{
  "level": "info", 
  "message": "Initiating Outline OAuth connection",
  "userId": "user-123",
  "state": "random-state-string"
}
```

**Successful Token Exchange:**
```json
{
  "level": "info",
  "message": "Successfully exchanged code for Outline tokens",
  "userId": "outline-user-456",
  "hasRefreshToken": true
}
```

## Step 6: Migration Strategy

### Gradual Rollout Plan

1. **Phase 1**: Deploy with OAuth + Legacy fallback (current state)
   - Users can optionally connect OAuth
   - Legacy API token still works for all tools

2. **Phase 2**: Update remaining tools to use per-user context
   - Migrate create_document, get_document, etc.
   - Each tool will check for OAuth first, fallback to legacy

3. **Phase 3**: Make OAuth required for new users
   - New users must connect OAuth to use MCP tools
   - Existing connected users continue seamlessly

4. **Phase 4**: Deprecate legacy API token
   - Remove OUTLINE_API_TOKEN support
   - All users must use OAuth authentication

### Current Status

- ✅ **OAuth Infrastructure**: Complete
- ✅ **list_documents tool**: Uses per-user OAuth
- ⚠️ **Other 11 tools**: Still use legacy token
- 🔄 **Migration needed**: Update remaining tools to use UserContext

## Next Steps

1. **Complete this setup guide** to enable OAuth
2. **Test the OAuth flow** with your user account
3. **Verify list_documents** works with your personal Outline permissions
4. **Request migration** of remaining tools to per-user authentication
5. **Test multi-user scenarios** (Andy + Christina with different permissions)

## Support

- **MCP Server Issues**: Check GitHub repository issues
- **Outline OAuth Issues**: Consult [Outline API Documentation](https://docs.getoutline.com/api)
- **Microsoft OAuth Issues**: See [Azure OAuth Documentation](https://docs.microsoft.com/en-us/azure/active-directory/develop/)

---

This completes the OAuth 2.0 setup for per-user Outline authentication. Users will now authenticate as themselves rather than sharing a single API token!