import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { OutlineApiClient } from '../utils/outline-client.js';
import { UserContext } from '../types/context.js';
import { mcpLogger as logger } from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import document tools
import { listDocumentsSchema, listDocumentsHandler } from '../tools/documents/list.js';
import { createDocumentSchema, createDocumentHandler } from '../tools/documents/create.js';
import { getDocumentSchema, getDocumentHandler } from '../tools/documents/get.js';
import { updateDocumentSchema, updateDocumentHandler } from '../tools/documents/update.js';
import { deleteDocumentSchema, deleteDocumentHandler } from '../tools/documents/delete.js';
import { searchDocumentsSchema, searchDocumentsHandler } from '../tools/documents/search.js';
import { moveDocumentSchema, moveDocumentHandler } from '../tools/documents/move.js';

// Import collection tools
import { listCollectionsSchema, listCollectionsHandler } from '../tools/collections/list.js';
import { createCollectionSchema, createCollectionHandler } from '../tools/collections/create.js';
import { getCollectionSchema, getCollectionHandler } from '../tools/collections/get.js';
import { updateCollectionSchema, updateCollectionHandler } from '../tools/collections/update.js';
import { deleteCollectionSchema, deleteCollectionHandler } from '../tools/collections/delete.js';

interface TransportSession {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
  userId?: string;
}

export class McpServerManager {
  private transports: Record<string, TransportSession> = {};
  private outlineClient: OutlineApiClient;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly HEALTH_CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

  constructor(outlineClient: OutlineApiClient) {
    this.outlineClient = outlineClient;
    this.startCleanupTimer();
    this.startHealthCheckTimer();
  }

  private startCleanupTimer(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, this.CLEANUP_INTERVAL_MS);

    logger.info('Session cleanup timer started', { 
      intervalMs: this.CLEANUP_INTERVAL_MS,
      timeoutMs: this.SESSION_TIMEOUT_MS 
    });
  }

  private startHealthCheckTimer(): void {
    // Run health checks every 2 minutes
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL_MS);

    logger.info('Session health check timer started', { 
      intervalMs: this.HEALTH_CHECK_INTERVAL_MS 
    });
  }

  private async performHealthChecks(): Promise<void> {
    const activeSessions = Object.entries(this.transports);
    if (activeSessions.length === 0) return;

    logger.debug('Performing health checks on active sessions', { 
      count: activeSessions.length 
    });

    for (const [sessionId, session] of activeSessions) {
      try {
        // Health check - just verify session is still active
        logger.debug('Health check for session', { 
          sessionId, 
          userId: session.userId 
        });
      } catch (error) {
        logger.error('Error during session health check', { 
          sessionId,
          userId: session.userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  private async cleanupInactiveSessions(): Promise<void> {
    const now = Date.now();
    const sessionsToClean: string[] = [];

    for (const [sessionId, session] of Object.entries(this.transports)) {
      const inactiveTime = now - session.lastActivity;
      if (inactiveTime > this.SESSION_TIMEOUT_MS) {
        sessionsToClean.push(sessionId);
      }
    }

    if (sessionsToClean.length > 0) {
      logger.info('Cleaning up inactive sessions', { 
        count: sessionsToClean.length,
        sessionIds: sessionsToClean 
      });

      for (const sessionId of sessionsToClean) {
        await this.closeTransport(sessionId, 'Session timeout due to inactivity');
      }
    }
  }

  async closeTransport(sessionId: string, reason: string): Promise<void> {
    const session = this.transports[sessionId];
    if (!session) return;

    try {
      logger.info('Closing MCP transport', { sessionId, reason, userId: session.userId });
      await session.transport.close();
      delete this.transports[sessionId];
    } catch (error) {
      logger.error('Error closing MCP transport', { 
        sessionId,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  createServer(req: Request): McpServer {
    const server = new McpServer({
      name: 'outline-mcp-server',
      version: '1.0.0',
    }, { 
      capabilities: { 
        logging: {},
        tools: {}
      } 
    });

    // Extract user context from request
    const user = (req as any).user;
    
    // Use authenticated user info from OAuth
    const userId = user?.userId || process.env.AI_BOT_USER_ID || 'api-user';
    const userContext: UserContext = { 
      userId, 
      email: user?.email || process.env.AI_BOT_EMAIL || 'api@outline.local',
      name: user?.name || process.env.AI_BOT_NAME || 'API User',
      outlineClient: this.outlineClient 
    };
    
    logger.debug('MCP server created with user context', {
      userId: userId,
      email: userContext.email,
      name: userContext.name,
      hasAuthenticatedUser: !!user
    });

    // Document tools (all now using OAuth authentication)
    // Register resources
    server.resource(
      'outline-parameters', 
      'outline://parameters', 
      {
        name: 'Outline Parameter Reference',
        description: 'Complete documentation of parameter types, acceptable values, and examples for all Outline MCP tools',
        mimeType: 'text/markdown'
      },
      async () => {
        const resourcePath = join(__dirname, '../resources/outline-parameters.md');
        const content = readFileSync(resourcePath, 'utf-8');
        return {
          contents: [{
            uri: 'outline://parameters',
            mimeType: 'text/markdown',
            text: content
          }]
        };
      }
    );

    server.tool('list_documents', 'List documents in a collection', listDocumentsSchema, 
      async (args) => listDocumentsHandler(args, userContext));
    server.tool('create_document', 'Create a new document', createDocumentSchema, 
      async (args) => createDocumentHandler(args, userContext));
    server.tool('get_document', 'Get a document by ID', getDocumentSchema, 
      async (args) => getDocumentHandler(args, userContext));
    server.tool('update_document', 'Update a document', updateDocumentSchema, 
      async (args) => updateDocumentHandler(args, userContext));
    server.tool('delete_document', 'Delete a document', deleteDocumentSchema, 
      async (args) => deleteDocumentHandler(args, userContext));
    server.tool('search_documents', 'Search documents by query with advanced filtering (statusFilter: draft/archived/published, dateFilter: day/week/month/year)', searchDocumentsSchema, 
      async (args) => searchDocumentsHandler(args, userContext));
    server.tool('move_document', 'Move a document to another collection', moveDocumentSchema, 
      async (args) => moveDocumentHandler(args, userContext));

    // Collection tools (all now using OAuth authentication)
    server.tool('list_collections', 'List all collections', listCollectionsSchema, 
      async (args) => {
        logger.info('list_collections tool called', { args });
        const result = await listCollectionsHandler(args, userContext);
        logger.info('list_collections result', { 
          resultType: typeof result,
          hasContent: !!result?.content,
          contentLength: result?.content?.length,
          firstItem: result?.content?.[0]
        });
        return result;
      });
    server.tool('create_collection', 'Create a new collection with optional styling (icon: emoji like 📁, color: hex like #FF6B6B)', createCollectionSchema, 
      async (args) => createCollectionHandler(args, userContext));
    server.tool('get_collection', 'Get a collection by ID', getCollectionSchema, 
      async (args) => getCollectionHandler(args, userContext));
    server.tool('update_collection', 'Update a collection', updateCollectionSchema, 
      async (args) => updateCollectionHandler(args, userContext));
    server.tool('delete_collection', 'Delete a collection', deleteCollectionSchema, 
      async (args) => deleteCollectionHandler(args, userContext));

    return server;
  }

  private isInitializeRequest(body: any): boolean {
    return body && body.method === 'initialize';
  }

  async handlePost(req: Request, res: Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    
    logger.debug('MCP POST request', {
      sessionId: sessionId || 'none',
      method: req.body?.method || 'unknown',
      hasBody: !!req.body
    });
    
    if (!sessionId && this.isInitializeRequest(req.body)) {
      logger.info('New MCP session initialization');
      
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId: string) => {
          const user = (req as any).user;
          const userId = user?.userId || 'unknown';
          
          logger.info('MCP session initialized', { sessionId, userId });
          this.transports[sessionId] = {
            transport,
            lastActivity: Date.now(),
            userId
          };
        }
      });

      const server = this.createServer(req);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } else if (sessionId && this.transports[sessionId]) {
      logger.debug('Using existing MCP session', { sessionId });
      // Update last activity
      this.transports[sessionId].lastActivity = Date.now();
      await this.transports[sessionId].transport.handleRequest(req, res, req.body);
    } else {
      logger.warn('No valid MCP session found', { sessionId: sessionId || 'none' });
      res.status(400).json({ error: 'Invalid session' });
    }
  }

  async handleGet(req: Request, res: Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    
    logger.debug('MCP GET request for SSE', { 
      sessionId: sessionId || 'none' 
    });
    
    if (sessionId && this.transports[sessionId]) {
      logger.debug('SSE connection established', { sessionId });
      // Update last activity
      this.transports[sessionId].lastActivity = Date.now();
      await this.transports[sessionId].transport.handleRequest(req, res);
    } else {
      logger.warn('No valid session for SSE', { sessionId: sessionId || 'none' });
      res.status(400).json({ error: 'Invalid session' });
    }
  }

  getActiveConnections(): number {
    return Object.keys(this.transports).length;
  }

  async closeAllTransports(): Promise<void> {
    const sessionCount = Object.keys(this.transports).length;
    if (sessionCount > 0) {
      logger.info(`Closing ${sessionCount} MCP transport sessions`);
    }
    
    // Stop timers
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    for (const sessionId in this.transports) {
      await this.closeTransport(sessionId, 'Server shutdown');
    }
  }

  // Method to get session information for monitoring
  getSessionInfo(): Array<{ sessionId: string; userId?: string; lastActivity: Date; inactive: number }> {
    const now = Date.now();
    return Object.entries(this.transports).map(([sessionId, session]) => ({
      sessionId,
      userId: session.userId,
      lastActivity: new Date(session.lastActivity),
      inactive: Math.floor((now - session.lastActivity) / 1000) // seconds
    }));
  }

  // Close all sessions for a specific user (e.g., on auth failure)
  async closeUserSessions(userId: string, reason: string): Promise<void> {
    const sessionsToClose: string[] = [];
    
    for (const [sessionId, session] of Object.entries(this.transports)) {
      if (session.userId === userId) {
        sessionsToClose.push(sessionId);
      }
    }

    if (sessionsToClose.length > 0) {
      logger.info('Closing user sessions due to auth failure', { 
        userId, 
        count: sessionsToClose.length,
        reason 
      });

      for (const sessionId of sessionsToClose) {
        await this.closeTransport(sessionId, reason);
      }
    }
  }

  // Find session by MCP session header
  findSessionByHeader(mcpSessionId: string | undefined): TransportSession | undefined {
    if (!mcpSessionId) return undefined;
    return this.transports[mcpSessionId];
  }
}