import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import helmet from 'helmet';
import { csrfSync } from 'csrf-sync';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { AuthMiddleware } from './auth/middleware.js';
import { McpServerManager } from './mcp/server.js';
import { createTokenStorage } from './storage/tokens.js';
import { createOutlineApiClient } from './utils/outline-client.js';
import { serverLogger as logger } from './lib/logger.js';
import oauthRoutes from './auth/oauth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3131', 10);

// Trust proxy for proper HTTPS detection behind reverse proxy
app.set('trust proxy', true);

// Validate required environment variables
const requiredEnvVars = ['SESSION_SECRET', 'OUTLINE_API_URL', 'OUTLINE_API_TOKEN'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Initialize services (async initialization)
async function initializeServices() {
  const tokenStorage = await createTokenStorage();
  
  logger.info('Using Outline API token authentication', {
    apiUrl: process.env.OUTLINE_API_URL
  });

  // Initialize Outline API client with API token
  const outlineApiClient = createOutlineApiClient();

  // Initialize MCP Manager
  const mcpManager = new McpServerManager(outlineApiClient);

  // Initialize authentication middleware for MCP OAuth
  const authMiddleware = new AuthMiddleware(tokenStorage);

  return {
    tokenStorage,
    authMiddleware,
    outlineApiClient,
    mcpManager
  };
}

// Main server initialization
async function startServer() {
  const services = await initializeServices();
  const { authMiddleware, mcpManager } = services;

  // Express middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for our simple page
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        frameAncestors: ["'none'"], // Prevent clickjacking
        upgradeInsecureRequests: null, // Cloudflare handles HTTPS upgrades
      }
    },
    hsts: false, // Cloudflare handles HSTS
    hidePoweredBy: true, // Hide X-Powered-By header
    noSniff: true, // X-Content-Type-Options: nosniff
    xssFilter: true, // X-XSS-Protection
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));
  app.use(cors());
  app.use(express.json({ limit: '10mb' })); // Add request size limit
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    proxy: true, // Trust proxy for secure cookies
    cookie: { 
      httpOnly: true, // Prevent XSS attacks
      sameSite: 'lax',
      secure: false, // Allow HTTP for Docker internal, proxy handles HTTPS 
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Configure CSRF protection
  const {
    csrfSynchronisedProtection,
    generateToken,
    revokeToken
  } = csrfSync({
    // Use default session-based storage
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getTokenFromRequest: (req) => {
      // Check multiple locations for the token
      return req.body?._csrf || 
             req.headers['x-csrf-token'] as string ||
             req.headers['csrf-token'] as string;
    }
  });

  // CSRF protection middleware - must be after session
  // Note: We exclude certain paths that don't need CSRF protection
  const csrfExcludedPaths = [
    '/health',
    '/authorize', // OAuth flow
    '/auth/callback', // OAuth callback
    '/token', // OAuth token endpoint has PKCE
    '/introspect', // OAuth introspection
    '/register', // OAuth registration
    '/.well-known', // Discovery endpoints
    '/v1/mcp', // MCP protocol uses bearer tokens
    '/mcp' // MCP protocol uses bearer tokens
  ];

  app.use((req, res, next) => {
    // Skip CSRF for excluded paths
    const shouldSkipCsrf = csrfExcludedPaths.some(path => 
      req.path.startsWith(path)
    );
    
    if (shouldSkipCsrf) {
      return next();
    }
    
    // Apply CSRF protection to other routes
    csrfSynchronisedProtection(req, res, next);
  });

  // OAuth endpoints for MCP authentication
  app.use('/', oauthRoutes);

  // API status route - protected
  app.get('/auth/status', authMiddleware.ensureAuthenticated.bind(authMiddleware), (req, res) => {
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

  // Health endpoint (no auth required) - minimal info for Cloudflare tunnel
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString()
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
    const userId = user?.userId;
    
    const hasOutlineToken = !!process.env.OUTLINE_API_TOKEN;
    
    const outlineStatus = {
      connected: hasOutlineToken,
      configured: hasOutlineToken,
      authentication_method: 'api_token',
      message: hasOutlineToken 
        ? 'Using Outline API token'
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

  // CSRF token endpoint - protected
  app.get('/csrf-token', authMiddleware.ensureAuthenticated.bind(authMiddleware), (req, res) => {
    // Generate CSRF token for authenticated users
    const csrfToken = generateToken(req);
    res.json({ csrfToken });
  });

  // Landing page
  app.get('/', async (req, res) => {
    const template = readFileSync(join(__dirname, 'views', 'index.html'), 'utf-8');
    
    // Minimal status section - no configuration details exposed
    const statusSection = '';
    
    const html = template.replace('{{STATUS_SECTION}}', statusSection);
    res.send(html);
  });

  // MCP endpoints (protected) - both /mcp and /v1/mcp supported
  const mcpPostHandler = [
    (req: Request, res: Response, next: NextFunction) => {
      logger.info('MCP POST request received', {
        path: req.path,
        hasAuth: !!req.headers.authorization,
        authPrefix: req.headers.authorization?.substring(0, 30),
        contentType: req.headers['content-type'],
        method: req.body?.method,
        bodyPreview: req.body ? JSON.stringify(req.body).substring(0, 200) : 'no body'
      });
      next();
    },
    authMiddleware.ensureAuthenticated.bind(authMiddleware),
    (req: Request, res: Response) => {
      mcpManager.handlePost(req, res);
    }
  ];

  const mcpGetHandler = [
    authMiddleware.ensureAuthenticated.bind(authMiddleware),
    (req: Request, res: Response) => {
      mcpManager.handleGet(req, res);
    }
  ];

  // Support both /mcp and /v1/mcp paths
  app.post('/mcp', mcpPostHandler);
  app.post('/v1/mcp', mcpPostHandler);
  app.get('/mcp', mcpGetHandler);
  app.get('/v1/mcp', mcpGetHandler);

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
    
    logger.info('Outline API Configuration Status', {
      apiUrl: process.env.OUTLINE_API_URL || '✗ Missing',
      apiToken: process.env.OUTLINE_API_TOKEN ? '✓ Set' : '✗ Missing'
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