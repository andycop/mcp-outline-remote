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

import { OAuthServer } from './auth/oauth.js';
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
const requiredEnvVars = ['MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'SESSION_SECRET', 'REDIRECT_URI'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Initialize services (async initialization)
async function initializeServices() {
  const tokenStorage = await createTokenStorage();
  const authMiddleware = new AuthMiddleware(tokenStorage);

  // Initialize Outline OAuth service if configured
  let outlineOAuthService: OutlineOAuthService | undefined;
  if (process.env.OUTLINE_OAUTH_CLIENT_ID && process.env.OUTLINE_OAUTH_CLIENT_SECRET && process.env.OUTLINE_API_URL) {
    outlineOAuthService = new OutlineOAuthService({
      clientId: process.env.OUTLINE_OAUTH_CLIENT_ID,
      clientSecret: process.env.OUTLINE_OAUTH_CLIENT_SECRET,
      redirectUri: process.env.OUTLINE_OAUTH_REDIRECT_URI || process.env.REDIRECT_URI!,
      baseUrl: process.env.OUTLINE_API_URL.replace('/api', '') // Remove /api suffix for OAuth endpoints
    }, tokenStorage);
    
    logger.info('Outline OAuth service initialized', {
      clientId: process.env.OUTLINE_OAUTH_CLIENT_ID.substring(0, 8) + '...',
      baseUrl: process.env.OUTLINE_API_URL.replace('/api', '')
    });
  } else {
    logger.warn('Outline OAuth not configured - missing required environment variables', {
      hasClientId: !!process.env.OUTLINE_OAUTH_CLIENT_ID,
      hasClientSecret: !!process.env.OUTLINE_OAUTH_CLIENT_SECRET,
      hasApiUrl: !!process.env.OUTLINE_API_URL
    });
  }

  // Initialize Outline API client
  const outlineApiClient = createOutlineApiClient(tokenStorage, outlineOAuthService);

  const mcpManager = new McpServerManager(outlineApiClient);

  const oauthServer = new OAuthServer({
    clientId: process.env.MS_CLIENT_ID!,
    clientSecret: process.env.MS_CLIENT_SECRET!,
    tenant: process.env.MS_TENANT || 'common',
    redirectUri: process.env.REDIRECT_URI!
  }, tokenStorage);

  return {
    tokenStorage,
    authMiddleware,
    outlineOAuthService,
    outlineApiClient,
    mcpManager,
    oauthServer
  };
}

// Main server initialization
async function startServer() {
  const services = await initializeServices();
  const { authMiddleware, outlineOAuthService, mcpManager, oauthServer } = services;

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

  // OAuth routes
  app.use('/', oauthServer.getRouter());

  // Outline OAuth routes (if configured)
  if (outlineOAuthService) {
    app.use('/auth/outline', createOutlineOAuthRoutes(outlineOAuthService));
    logger.info('Outline OAuth routes enabled');
  }

  // Outline authentication info routes (fallback when OAuth not configured)
  if (!outlineOAuthService) {
    app.get('/auth/outline/status', authMiddleware.ensureAuthenticated.bind(authMiddleware), (req, res) => {
      const hasToken = !!process.env.OUTLINE_API_TOKEN;
      res.json({
        status: hasToken ? 'configured' : 'not_configured',
        authentication_method: 'personal_access_token',
        connected: hasToken,
        message: hasToken 
          ? 'Outline API configured with Personal Access Token (shared across all users)'
          : 'Outline API not configured. Set OUTLINE_API_TOKEN environment variable or configure OAuth.',
        note: 'OAuth not configured. Using Personal Access Token fallback.',
        oauth_setup: {
          available: true,
          required_env_vars: [
            'OUTLINE_OAUTH_CLIENT_ID',
            'OUTLINE_OAUTH_CLIENT_SECRET', 
            'OUTLINE_OAUTH_REDIRECT_URI (or uses REDIRECT_URI)'
          ]
        },
        setup_guide: hasToken 
          ? 'Token configured successfully. All users will act as the token owner in Outline.'
          : 'Either: 1) Set up OAuth (recommended) or 2) Generate a Personal Access Token in Outline Settings → API Tokens'
      });
    });
  }
  
  if (!outlineOAuthService) {
    app.get('/auth/outline/connect', authMiddleware.ensureAuthenticated.bind(authMiddleware), (req, res) => {
      const hasToken = !!process.env.OUTLINE_API_TOKEN;
      if (hasToken) {
        res.json({
          status: 'already_configured',
          message: 'Outline API is already configured with a Personal Access Token.',
          note: 'OAuth not configured. Using Personal Access Token fallback.',
          oauth_available: 'Set OUTLINE_OAUTH_CLIENT_ID and OUTLINE_OAUTH_CLIENT_SECRET to enable per-user OAuth'
        });
      } else {
        res.status(503).json({
          error: 'Service not configured',
          message: 'Outline API not configured. Configure OAuth or set Personal Access Token.',
          instructions: [
            'Option 1 (Recommended): Configure OAuth',
            '- Set OUTLINE_OAUTH_CLIENT_ID environment variable',
            '- Set OUTLINE_OAUTH_CLIENT_SECRET environment variable',
            '- Set OUTLINE_OAUTH_REDIRECT_URI environment variable',
            '- Restart the MCP server',
            '',
            'Option 2: Use Personal Access Token',
            '- Log into your Outline instance',
            '- Go to Settings → API Tokens',
            '- Create a new Personal Access Token',
            '- Set OUTLINE_API_TOKEN environment variable',
            '- Restart the MCP server'
          ]
        });
      }
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
    const user = (req.session as any).user || (req as any).user;
    
    const hasOutlineToken = !!process.env.OUTLINE_API_TOKEN;
    const hasOAuthService = !!outlineOAuthService;
    
    const outlineStatus = {
      connected: hasOutlineToken || hasOAuthService,
      configured: hasOutlineToken || hasOAuthService,
      authentication_method: hasOAuthService ? 'oauth2' : 'personal_access_token',
      oauth_enabled: hasOAuthService,
      message: hasOAuthService 
        ? 'Outline OAuth configured - per-user authentication available'
        : hasOutlineToken 
          ? 'Outline API configured (Personal Access Token fallback)'
          : 'Outline API not configured',
      note: hasOAuthService 
        ? 'Users can connect their individual Outline accounts via OAuth'
        : 'OAuth not configured. Using Personal Access Token fallback (shared across all users).'
    };
    
    res.json({
      authenticated: true,
      user: {
        name: user.name,
        email: user.email
      },
      activeConnections: mcpManager.getActiveConnections(),
      outline: outlineStatus
    });
  });

  // Landing page
  app.get('/', (req, res) => {
    const user = (req.session as any)?.user;
    const template = readFileSync(join(__dirname, 'views', 'index.html'), 'utf-8');
    
    const statusSection = user 
      ? `<div class="status authenticated">
           <strong>✓ Authenticated</strong><br>
           Welcome, ${user.name || user.email}!<br>
           <a href="/logout" class="button logout">Logout</a>
           <a href="/status" class="button info">Status</a>
           <a href="/auth/outline/status" class="button ${outlineOAuthService ? 'outline' : process.env.OUTLINE_API_TOKEN ? 'outline' : 'info'}">${outlineOAuthService ? 'Outline OAuth' : 'Outline API'}</a>
         </div>`
      : `<div class="status unauthenticated">
           <strong>✗ Not Authenticated</strong><br>
           Please log in to access the MCP server.<br>
           <a href="/login" class="button login">Login with MS365</a>
         </div>`;
    
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
      publicUrl: `https://outline-mcp.netdaisy.com`,
      internalUrl: `http://10.123.1.30:${PORT}`,
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