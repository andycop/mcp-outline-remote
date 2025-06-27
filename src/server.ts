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
import { McpServerManager } from './mcp/server.js';
import { createTokenStorage } from './storage/tokens.js';
import { logger, anonymizeKey } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3131', 10);

// Validate required environment variables
const requiredEnvVars = ['MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'SESSION_SECRET', 'REDIRECT_URI'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Initialize services
const tokenStorage = createTokenStorage();
const authMiddleware = new AuthMiddleware(tokenStorage);
const mcpManager = new McpServerManager();

const oauthServer = new OAuthServer({
  clientId: process.env.MS_CLIENT_ID!,
  clientSecret: process.env.MS_CLIENT_SECRET!,
  tenant: process.env.MS_TENANT || 'common',
  redirectUri: process.env.REDIRECT_URI!
}, tokenStorage);

// Express middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    sameSite: 'lax', 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// OAuth routes
app.use('/', oauthServer.getRouter());

// Health endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeConnections: mcpManager.getActiveConnections(),
    server: 'outline-mcp.your-domain.com',
    authenticated: !!(req.session as any)?.user,
    storage: process.env.REDIS_URL ? 'redis' : 'memory'
  });
});

// Protected status endpoint
app.get('/status', authMiddleware.ensureAuthenticated.bind(authMiddleware), (req, res) => {
  const user = (req.session as any).user || (req as any).user;
  res.json({
    authenticated: true,
    user: {
      name: user.name,
      email: user.email
    },
    activeConnections: mcpManager.getActiveConnections()
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

export default app;