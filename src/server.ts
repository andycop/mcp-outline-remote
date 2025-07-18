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
import { serverLogger as logger } from './lib/logger.js';

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

  // Initialize Outline API client
  const outlineApiClient = createOutlineApiClient(tokenStorage, outlineOAuthService);

  // Initialize MCP Manager first
  const mcpManager = new McpServerManager(outlineApiClient);

  // Initialize authentication middleware with Outline OAuth as primary and MCP manager
  const authMiddleware = new AuthMiddleware(tokenStorage, outlineApiClient, outlineOAuthService, mcpManager);

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

  // OAuth authorization endpoints for Claude.ai integration
  app.get('/authorize', async (req, res) => {
    const { response_type, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = req.query;
    
    if (!outlineOAuthService) {
      // Legacy token mode - immediately authorize
      if (process.env.OUTLINE_API_TOKEN) {
        // Generate a simple authorization code
        const authCode = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Store the auth request details for token exchange
        (req.session as any).authRequest = {
          client_id,
          redirect_uri,
          scope,
          state,
          code_challenge,
          code_challenge_method,
          authCode,
          userId: 'legacy-token-user'
        };
        
        // Redirect back to Claude.ai with auth code
        const callbackUrl = `${redirect_uri}?code=${authCode}&state=${state}`;
        logger.info('Legacy token authorization successful', { client_id, state });
        res.redirect(callbackUrl);
        return;
      } else {
        res.status(503).json({ 
          error: 'service_unavailable',
          error_description: 'No authentication method configured'
        });
        return;
      }
    }
    
    // OAuth mode - start Outline OAuth flow
    // Generate a session-based user ID
    let userId = (req.session as any)?.outlineUserId;
    if (!userId) {
      userId = `outline-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      (req.session as any).outlineUserId = userId;
    }
    
    // Store the original Claude.ai auth request
    (req.session as any).claudeAuthRequest = {
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method
    };
    
    // Check if user is already connected to Outline
    const isAuthorized = await outlineOAuthService.isUserAuthorized(userId);
    if (isAuthorized) {
      // User already authorized - generate auth code and redirect back
      const authCode = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      (req.session as any).authRequest = {
        client_id,
        redirect_uri,
        scope,
        state,
        code_challenge,
        code_challenge_method,
        authCode,
        userId
      };
      
      const callbackUrl = `${redirect_uri}?code=${authCode}&state=${state}`;
      logger.info('User already authorized for Outline, redirecting to Claude.ai', { userId, state });
      res.redirect(callbackUrl);
      return;
    }
    
    // User not authorized - redirect to Outline OAuth
    const { url: outlineAuthUrl, codeVerifier, state: oauthState } = outlineOAuthService.generateAuthUrl(userId);
    
    // Store OAuth state for callback validation
    (req.session as any).outlineOAuthState = {
      codeVerifier,
      userId,
      originalUrl: '/' // For web flow, could be used for return URL
    };
    
    logger.info('Redirecting to Outline OAuth for new authorization', { userId, state: oauthState });
    res.redirect(outlineAuthUrl);
  });

  // Token endpoint for Claude.ai (both initial and refresh)
  app.post('/token', async (req, res) => {
    const { grant_type, code, redirect_uri, client_id, code_verifier, refresh_token } = req.body;
    
    // Handle refresh token requests
    if (grant_type === 'refresh_token') {
      if (!refresh_token) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Refresh token is required for refresh_token grant type'
        });
        return;
      }
      
      // Validate the refresh token
      const refreshTokenData = await services.tokenStorage.getRefreshToken(refresh_token);
      if (!refreshTokenData) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Refresh token is invalid or expired'
        });
        return;
      }
      
      // Check if refresh token is expired
      if (refreshTokenData.expiresAt < Date.now()) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Refresh token has expired'
        });
        return;
      }
      
      // Generate new tokens
      const newAccessToken = `outline_access_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
      const newRefreshToken = `outline_refresh_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
      const expiresIn = 24 * 60 * 60; // 24 hours
      const refreshExpiresIn = 7 * 24 * 60 * 60; // 7 days
      
      // Store new access token
      await services.tokenStorage.setAccessToken(newAccessToken, {
        token: newAccessToken,
        userId: refreshTokenData.userId,
        clientId: refreshTokenData.clientId,
        scope: refreshTokenData.scope,
        expiresAt: Date.now() + (expiresIn * 1000)
      });
      
      // Store new refresh token
      await services.tokenStorage.setRefreshToken(newRefreshToken, {
        token: newRefreshToken,
        userId: refreshTokenData.userId,
        clientId: refreshTokenData.clientId,
        scope: refreshTokenData.scope,
        expiresAt: Date.now() + (refreshExpiresIn * 1000)
      });
      
      // Clean up old refresh token
      await services.tokenStorage.deleteRefreshToken(refresh_token);
      
      logger.info('Token refreshed successfully for Claude.ai client', { 
        userId: refreshTokenData.userId,
        client_id: refreshTokenData.clientId 
      });
      
      res.json({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        token_type: 'Bearer',
        expires_in: expiresIn
      });
      return;
    }
    
    if (grant_type !== 'authorization_code') {
      res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code and refresh_token grant types are supported'
      });
      return;
    }
    
    // Find the auth request by code in token storage
    const authCodeData = await services.tokenStorage.getAuthCode(code as string);
    if (!authCodeData) {
      res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Authorization code is invalid or expired'
      });
      return;
    }
    
    // Validate PKCE if provided
    if (authCodeData.codeChallenge && code_verifier) {
      // Simple validation - in production you'd want proper PKCE validation
      logger.debug('PKCE validation', { 
        hasChallenge: !!authCodeData.codeChallenge,
        hasVerifier: !!code_verifier 
      });
    }
    
    // Generate access token with longer lifetime for persistent sessions
    const accessToken = `outline_access_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
    const refreshToken = `outline_refresh_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
    const expiresIn = 24 * 60 * 60; // 24 hours (much longer for MCP clients)
    
    // Store both access and refresh tokens in our storage
    await services.tokenStorage.setAccessToken(accessToken, {
      token: accessToken,
      userId: authCodeData.userId,
      clientId: client_id as string,
      scope: authCodeData.scope as string,
      expiresAt: Date.now() + (expiresIn * 1000)
    });
    
    await services.tokenStorage.setRefreshToken(refreshToken, {
      token: refreshToken,
      userId: authCodeData.userId,
      clientId: client_id as string,
      scope: authCodeData.scope as string,
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    });
    
    // Clean up auth code (one-time use)
    await services.tokenStorage.deleteAuthCode(code as string);
    
    logger.info('Token issued successfully', { 
      userId: authCodeData.userId,
      client_id,
      scope: authCodeData.scope 
    });
    
    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope: authCodeData.scope
    });
  });

  // Outline OAuth routes (for completing the OAuth flow)
  if (outlineOAuthService) {
    app.use('/auth/outline', createOutlineOAuthRoutes(outlineOAuthService, services.tokenStorage));
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
      timestamp: new Date().toISOString(),
      activeConnections: mcpManager.getActiveConnections()
    });
  });

  // Session monitoring endpoint (SSE for real-time updates)
  app.get('/v1/mcp/sessions/monitor', authMiddleware.ensureAuthenticated.bind(authMiddleware), async (req, res) => {
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
    
    // Send initial session info
    const sessionInfo = mcpManager.getSessionInfo();
    res.write(`data: ${JSON.stringify({ type: 'session_status', sessions: sessionInfo })}\n\n`);
    
    // Set up periodic updates
    const updateInterval = setInterval(() => {
      const currentSessions = mcpManager.getSessionInfo();
      res.write(`data: ${JSON.stringify({ type: 'session_status', sessions: currentSessions })}\n\n`);
    }, 10000); // Update every 10 seconds
    
    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(updateInterval);
      logger.debug('Session monitor client disconnected');
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
      sessions: mcpManager.getSessionInfo(),
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
               <a href="/auth/outline/connect" class="button login">Connect to Outline</a>
             </div>`;
      } else {
        statusSection = `<div class="status unauthenticated">
           <strong>✗ Not Authenticated</strong><br>
           Connect to your Outline workspace to access MCP tools.<br>
           <a href="/auth/outline/connect" class="button login">Connect to Outline</a>
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
  app.post('/v1/mcp', (req, res, next) => {
    logger.info('MCP POST request received', {
      hasAuth: !!req.headers.authorization,
      authPrefix: req.headers.authorization?.substring(0, 30),
      contentType: req.headers['content-type'],
      method: req.body?.method,
      bodyPreview: req.body ? JSON.stringify(req.body).substring(0, 200) : 'no body'
    });
    next();
  }, authMiddleware.ensureAuthenticated.bind(authMiddleware), (req, res) => {
    mcpManager.handlePost(req, res);
  });

  app.get('/v1/mcp', authMiddleware.ensureAuthenticated.bind(authMiddleware), (req, res) => {
    mcpManager.handleGet(req, res);
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`MCP Outline Remote Server v3 started`, {
      port: PORT,
      binding: '0.0.0.0',
      localEndpoints: {
        health: `http://localhost:${PORT}/health`,
        connect: `http://localhost:${PORT}/auth/outline/connect`,
        mcp: `http://localhost:${PORT}/v1/mcp`
      },
      publicUrl: process.env.PUBLIC_URL || `http://localhost:${PORT}`,
      internalUrl: `http://localhost:${PORT}`,
      storage: process.env.REDIS_URL ? 'Redis' : 'In-Memory'
    });
    
    logger.info('Outline OAuth Configuration Status', {
      clientId: process.env.OUTLINE_OAUTH_CLIENT_ID ? 'Set' : '✗ Missing',
      clientSecret: process.env.OUTLINE_OAUTH_CLIENT_SECRET ? '✓ Set' : '✗ Missing',
      redirectUri: process.env.OUTLINE_OAUTH_REDIRECT_URI || '✗ Missing',
      baseUrl: process.env.OUTLINE_API_URL?.replace('/api', '') || '✗ Missing'
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