import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import helmet from 'helmet';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { AuthMiddleware } from './auth/middleware.js';
import { OutlineOAuthService } from './auth/outline-oauth.js';
import { createOutlineOAuthRoutes } from './auth/outline-oauth-routes.js';
import { McpServerManager } from './mcp/server.js';
import { createTokenStorage } from './storage/tokens.js';
import { createOutlineApiClient } from './utils/outline-client.js';
import { logger, anonymizeKey } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3131', 10);

// Trust proxy for proper HTTPS detection behind reverse proxy
app.set('trust proxy', true);

// Validate required environment variables
const requiredEnvVars = ['SESSION_SECRET', 'OUTLINE_API_URL'];
const outlineOAuthVars = ['OUTLINE_OAUTH_CLIENT_ID', 'OUTLINE_OAUTH_CLIENT_SECRET', 'OUTLINE_OAUTH_REDIRECT_URI'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Check for Outline authentication configuration
const hasOutlineOAuth = outlineOAuthVars.every(envVar => process.env[envVar]);
const hasOutlineToken = !!process.env.OUTLINE_API_TOKEN;

if (!hasOutlineOAuth && !hasOutlineToken) {
  logger.error('Missing Outline authentication configuration. Required either:', {
    oauth: 'OUTLINE_OAUTH_CLIENT_ID, OUTLINE_OAUTH_CLIENT_SECRET, OUTLINE_OAUTH_REDIRECT_URI',
    token: 'OUTLINE_API_TOKEN (legacy mode)'
  });
  process.exit(1);
}

// Initialize services (async initialization)
async function initializeServices() {
  const tokenStorage = await createTokenStorage();
  
  // Initialize Outline OAuth service (required for OAuth mode)
  let outlineOAuthService: OutlineOAuthService | undefined;
  if (hasOutlineOAuth) {
    outlineOAuthService = new OutlineOAuthService({
      clientId: process.env.OUTLINE_OAUTH_CLIENT_ID!,
      clientSecret: process.env.OUTLINE_OAUTH_CLIENT_SECRET!,
      redirectUri: process.env.OUTLINE_OAUTH_REDIRECT_URI!,
      baseUrl: process.env.OUTLINE_API_URL!.replace('/api', '') // Remove /api suffix for OAuth endpoints
    }, tokenStorage);
    
    logger.info('Outline OAuth service initialized (primary authentication)', {
      clientId: process.env.OUTLINE_OAUTH_CLIENT_ID!.substring(0, 8) + '...',
      baseUrl: process.env.OUTLINE_API_URL!.replace('/api', '')
    });
  } else {
    logger.info('Using Outline API token authentication (legacy mode)', {
      hasToken: hasOutlineToken,
      apiUrl: process.env.OUTLINE_API_URL
    });
  }

  // Initialize authentication middleware with Outline OAuth as primary
  const authMiddleware = new AuthMiddleware(tokenStorage, outlineOAuthService);

  // Initialize Outline API client
  const outlineApiClient = createOutlineApiClient(tokenStorage, outlineOAuthService);

  const mcpManager = new McpServerManager(outlineApiClient);

  return {
    tokenStorage,
    authMiddleware,
    outlineOAuthService,
    outlineApiClient,
    mcpManager
  };
}

// Main server initialization
async function startServer() {
  const services = await initializeServices();
  const { authMiddleware, outlineOAuthService, mcpManager } = services;

  // Express middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    proxy: true, // Trust proxy for secure cookies
    cookie: { 
      sameSite: 'lax',
      secure: false, // Allow HTTP for Docker internal, proxy handles HTTPS 
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Outline OAuth routes (primary authentication)
  if (outlineOAuthService) {
    app.use('/auth', createOutlineOAuthRoutes(outlineOAuthService));
    logger.info('Outline OAuth routes enabled as primary authentication');
  }

  // Legacy token mode routes (when OAuth not configured)
  if (!outlineOAuthService) {
    app.get('/auth/status', (req, res) => {
      const hasToken = !!process.env.OUTLINE_API_TOKEN;
      res.json({
        status: hasToken ? 'configured' : 'not_configured',
        authentication_method: 'personal_access_token',
        connected: hasToken,
        message: hasToken 
          ? 'Outline API configured with Personal Access Token (shared across all users)'
          : 'Outline API not configured. Set OUTLINE_API_TOKEN environment variable.',
        setup_guide: hasToken 
          ? 'Token configured successfully. All users will act as the token owner in Outline.'
          : 'Generate a Personal Access Token in Outline Settings → API Tokens and set OUTLINE_API_TOKEN environment variable'
      });
    });
  }

  // Health endpoint (no auth required)
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString()
    });
  });

  // Protected status endpoint
  app.get('/status', authMiddleware.ensureAuthenticated.bind(authMiddleware), async (req, res) => {
    const user = (req as any).user;
    const userId = user?.oid;
    
    const hasOutlineToken = !!process.env.OUTLINE_API_TOKEN;
    const hasOAuthService = !!outlineOAuthService;
    
    let userOutlineStatus = false;
    if (hasOAuthService && userId) {
      userOutlineStatus = await outlineOAuthService.isUserAuthorized(userId);
    }
    
    const outlineStatus = {
      connected: hasOutlineToken || userOutlineStatus,
      configured: hasOutlineToken || hasOAuthService,
      authentication_method: hasOAuthService ? 'oauth2' : 'personal_access_token',
      user_connected: userOutlineStatus,
      oauth_enabled: hasOAuthService,
      message: hasOAuthService 
        ? `User ${userOutlineStatus ? 'connected' : 'not connected'} to Outline via OAuth`
        : hasOutlineToken 
          ? 'Using shared Outline API token'
          : 'Outline API not configured'
    };
    
    res.json({
      authenticated: true,
      user: {
        id: userId,
        name: user.name,
        email: user.email
      },
      activeConnections: mcpManager.getActiveConnections(),
      outline: outlineStatus
    });
  });

  // Landing page
  app.get('/', async (req, res) => {
    const sessionUserId = (req.session as any)?.outlineUserId;
    const template = readFileSync(join(__dirname, 'views', 'index.html'), 'utf-8');
    
    let statusSection;
    
    if (outlineOAuthService) {
      if (sessionUserId) {
        const isConnected = await outlineOAuthService.isUserAuthorized(sessionUserId);
        statusSection = isConnected 
          ? `<div class="status authenticated">
               <strong>✓ Connected to Outline</strong><br>
               You are authenticated with your Outline workspace.<br>
               <a href="/status" class="button info">Status</a>
               <a href="/auth/disconnect" class="button logout">Disconnect</a>
             </div>`
          : `<div class="status unauthenticated">
               <strong>⚠ Outline Not Connected</strong><br>
               Connect to your Outline workspace to use MCP tools.<br>
               <a href="/auth/connect" class="button login">Connect to Outline</a>
             </div>`;
      } else {
        statusSection = `<div class="status unauthenticated">
           <strong>✗ Not Authenticated</strong><br>
           Connect to your Outline workspace to access MCP tools.<br>
           <a href="/auth/connect" class="button login">Connect to Outline</a>
         </div>`;
      }
    } else {
      // Legacy token mode
      const hasToken = !!process.env.OUTLINE_API_TOKEN;
      statusSection = `<div class="status ${hasToken ? 'authenticated' : 'unauthenticated'}">
         <strong>${hasToken ? '✓ API Token Mode' : '✗ Not Configured'}</strong><br>
         ${hasToken ? 'Using shared Outline API token.' : 'No authentication configured.'}<br>
         <a href="/auth/status" class="button info">Status</a>
       </div>`;
    }
    
    const html = template.replace('{{STATUS_SECTION}}', statusSection);
    res.send(html);
  });

  // MCP endpoints (protected)
  app.post('/v1/mcp', authMiddleware.ensureAuthenticated.bind(authMiddleware), (req, res) => {
    mcpManager.handlePost(req, res);
  });

  app.get('/v1/mcp', authMiddleware.ensureAuthenticated.bind(authMiddleware), (req, res) => {
    mcpManager.handleGet(req, res);
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`MCP Server with OAuth started`, {
      port: PORT,
      binding: '0.0.0.0',
      localEndpoints: {
        health: `http://localhost:${PORT}/health`,
        login: `http://localhost:${PORT}/login`,
        mcp: `http://localhost:${PORT}/v1/mcp`
      },
      publicUrl: `https://outline-mcp.your-domain.com`,
      internalUrl: `http://127.0.0.1:${PORT}`,
      storage: process.env.REDIS_URL ? 'Redis' : 'In-Memory'
    });
    
    logger.info('OAuth Configuration Status', {
      clientId: process.env.MS_CLIENT_ID ? anonymizeKey(process.env.MS_CLIENT_ID) : '✗ Missing',
      clientSecret: process.env.MS_CLIENT_SECRET ? '✓ Set' : '✗ Missing',
      redirectUri: process.env.REDIRECT_URI || '✗ Missing',
      tenant: process.env.MS_TENANT ? anonymizeKey(process.env.MS_TENANT) : 'common'
    });
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down server...');
    await mcpManager.closeAllTransports();
    server.close(() => {
      logger.info('Server shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

// Start the server
startServer().catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

export default app;