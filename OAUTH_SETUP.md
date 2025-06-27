# MCP Server with MS365 OAuth

This MCP server now includes MS365 OAuth authentication using the latest StreamableHTTP transport.

## Features

- **MS365 OAuth Integration**: Uses Azure Active Directory for authentication
- **StreamableHTTP Transport**: Latest MCP SDK transport (replaces SSE)
- **Session-based Authentication**: Simple cookie-based sessions
- **Protected Endpoints**: All MCP endpoints require authentication
- **Clean UI**: Simple web interface for login/logout

## Setup

### 1. Create MS365 App Registration

1. Go to [Azure Portal > App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click "New registration"
3. Set name: `MCP Server OAuth`
4. Set redirect URI: `https://your-domain.com/auth/callback`
5. Copy the **Application (client) ID**
6. Go to "Certificates & secrets" → Create new client secret
7. Copy the **client secret value**

### 2. Configure Environment

Create `.env` file:

```bash
# MS365 OAuth Configuration
MS_CLIENT_ID=your-application-client-id
MS_CLIENT_SECRET=your-client-secret-value
MS_TENANT=common
REDIRECT_URI=https://your-domain.com/auth/callback

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
| `/login` | Public | Initiates OAuth flow |
| `/auth/callback` | Public | OAuth callback handler |
| `/logout` | Public | Destroys session |
| `/status` | Protected | User info and server status |
| `/v1/mcp` | Protected | MCP StreamableHTTP endpoint |

## Authentication Flow

1. User visits `/` → redirected to `/login` if not authenticated
2. `/login` → redirects to Microsoft login
3. User authenticates with MS365
4. Microsoft redirects to `/auth/callback` with auth code
5. Server exchanges code for tokens, stores user in session
6. User can now access protected `/v1/mcp` endpoint

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