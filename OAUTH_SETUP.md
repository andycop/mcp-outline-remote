# MCP Server OAuth Configuration (v3)

This MCP server features streamlined Outline OAuth 2.0 authentication with Claude.ai integration for seamless user experience.

## Features

- **Outline OAuth**: Primary authentication using Outline workspace credentials
- **Claude.ai Integration**: OAuth bridge for transparent MCP client authentication
- **StreamableHTTP Transport**: Latest MCP SDK transport for remote connections
- **Automatic Token Management**: Smart refresh with persistent authentication
- **Protected Endpoints**: All MCP endpoints require authentication
- **Per-User Context**: Each user accesses their own Outline workspace
- **Clean UI**: Simple web interface for login/logout with OAuth status

## Setup

### 1. Create MS365 App Registration

1. Go to [Azure Portal > App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click "New registration"
3. Set name: `MCP Server OAuth`
4. Set redirect URI: `https://your-domain.com/auth/callback`
5. Copy the **Application (client) ID**
6. Go to "Certificates & secrets" → Create new client secret
7. Copy the **client secret value**

### 2. Set Up Outline OAuth (Recommended)

For per-user authentication, configure Outline OAuth:

1. **Access your Outline instance as an administrator**
2. **Navigate to Settings → API**  
3. **Click "Create Application"**
4. **Configure the application:**
   - **Name**: `MCP Server OAuth`
   - **Redirect URI**: `https://your-domain.com/auth/outline/callback`
   - **Scopes**: Select all available scopes for full functionality
5. **Copy the Client ID and Client Secret**

See [OUTLINE_OAUTH_SETUP.md](./OUTLINE_OAUTH_SETUP.md) for detailed instructions.

### 3. Configure Environment

Create `.env` file with both OAuth configurations:

```bash
# Microsoft OAuth Configuration (Primary Authentication)
MS_CLIENT_ID=your-application-client-id
MS_CLIENT_SECRET=your-client-secret-value
MS_TENANT=your-app-tenant-id
REDIRECT_URI=https://your-domain.com/auth/callback

# Outline OAuth Configuration (Recommended - Per-User Authentication)
OUTLINE_OAUTH_CLIENT_ID=your-outline-oauth-client-id
OUTLINE_OAUTH_CLIENT_SECRET=your-outline-oauth-client-secret
OUTLINE_OAUTH_REDIRECT_URI=https://your-domain.com/auth/outline/callback
OUTLINE_API_URL=https://your-outline-instance.com/api

# Legacy Outline API Token (Fallback - Shared Authentication)
# OUTLINE_API_TOKEN=your-outline-api-token

# Session Configuration (generate a long random string)
SESSION_SECRET=your-super-long-random-secret-key

# Server Configuration
PORT=3131
```

### 3. Required Permissions

In your Azure app registration, configure:
- **API permissions**: `openid`, `profile`, `email`
- **Grant admin consent** for your organization (if required)

### 4. Run the Server

```bash
npm install
npm run build
npm start
```

## Endpoints

| Endpoint | Protection | Description |
|----------|------------|-------------|
| `/` | Public | Landing page with auth status |
| `/health` | Public | Health check with auth status |
| `/login` | Public | Initiates Microsoft OAuth flow |
| `/auth/callback` | Public | Microsoft OAuth callback handler |
| `/logout` | Public | Destroys session |
| `/status` | Protected | User info and server status |
| `/auth/outline/status` | Protected | Outline OAuth connection status |
| `/auth/outline/connect` | Protected | Initiates Outline OAuth flow |
| `/auth/outline/callback` | Protected | Outline OAuth callback handler |
| `/auth/outline/disconnect` | Protected | Disconnects user's Outline account |
| `/v1/mcp` | Protected | MCP StreamableHTTP endpoint |

## Dual Authentication Flow

### Phase 1: Microsoft Azure Authentication (Required)
1. User visits `/` → redirected to `/login` if not authenticated
2. `/login` → redirects to Microsoft login
3. User authenticates with MS365
4. Microsoft redirects to `/auth/callback` with auth code
5. Server exchanges code for tokens, stores user in session
6. User gains access to the MCP server interface

### Phase 2: Outline Authentication (Per-User)
1. Authenticated user visits `/auth/outline/status` to check Outline connection
2. If not connected, user clicks "Connect to Outline" 
3. User is redirected to their Outline instance OAuth authorization
4. User grants permissions to the MCP server
5. Outline redirects to `/auth/outline/callback` with auth code
6. Server exchanges code for Outline tokens, stores per-user
7. User can now access MCP tools with their personal Outline account

### Token Management
- **Microsoft tokens**: Used for MCP server access authentication
- **Outline tokens**: Used for individual API calls, stored per-user
- **Automatic refresh**: Both token types refresh automatically
- **Persistence**: Tokens persist in Redis (or in-memory) across server restarts

## MCP Client Configuration

### Option 1: Browser-based clients
1. First authenticate via web browser at `https://your-domain.com/login`
2. Ensure cookies are sent with requests to `/v1/mcp`
3. Use StreamableHTTP transport (not SSE)

### Option 2: Programmatic clients (CLI, desktop apps, server-to-server)
1. Obtain an access token from Azure AD using standard OAuth flows:
   - **Client Credentials Flow** (for server-to-server)
   - **Authorization Code + PKCE** (for user applications)
   - **Device Code Flow** (for CLI/desktop apps)

2. Send the token in the Authorization header:
   ```
   Authorization: Bearer <access_token>
   ```

3. Example using curl:
   ```bash
   # First get a token (example using client credentials)
   TOKEN=$(curl -X POST "https://login.microsoftonline.com/YOUR_TENANT/oauth2/v2.0/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=client_credentials&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&scope=api://YOUR_API_CLIENT_ID/.default" \
     | jq -r '.access_token')

   # Then call the MCP server
   curl -X POST "https://your-domain.com/v1/mcp" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc": "2.0", "method": "initialize", "id": 1}'
   ```

## Security Notes

- Uses session cookies with `secure` and `sameSite` flags
- Helmet middleware for security headers
- OAuth state parameter validation handled by MSAL
- Sessions expire after 24 hours
- Only OpenID Connect level permissions (no data access)

## Troubleshooting

- Check OAuth configuration logs on startup
- Verify redirect URI matches exactly in Azure and `.env`
- Ensure HTTPS for production (required for secure cookies)
- Check Azure app permissions and admin consent

## Architecture

- **Express.js** server with security middleware
- **MSAL Node** for OAuth/OpenID Connect
- **express-session** for session management  
- **MCP StreamableHTTP** for protocol transport
- Session-based auth (stateful, works with browser cookies)