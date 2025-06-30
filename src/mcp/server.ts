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
import { logger, anonymizeKey } from '../utils/logger.js';

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

export class McpServerManager {
  private transports: Record<string, StreamableHTTPServerTransport> = {};
  private outlineClient: OutlineApiClient;

  constructor(outlineClient: OutlineApiClient) {
    this.outlineClient = outlineClient;
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

    // Extract user context from request (simplified OAuth flow)
    const user = (req as any).user;
    const sessionUserId = (req.session as any)?.outlineUserId;
    const userId = user?.oid || sessionUserId || 'legacy-token-user';
    const userContext: UserContext = { userId, outlineClient: this.outlineClient };

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
      async (args) => listCollectionsHandler(args, userContext));
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
      sessionId: sessionId ? anonymizeKey(sessionId) : 'none',
      method: req.body?.method || 'unknown',
      hasBody: !!req.body
    });
    
    if (!sessionId && this.isInitializeRequest(req.body)) {
      logger.info('New MCP session initialization');
      
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId: string) => {
          logger.info('MCP session initialized', { sessionId: anonymizeKey(sessionId) });
          this.transports[sessionId] = transport;
        }
      });

      const server = this.createServer(req);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } else if (sessionId && this.transports[sessionId]) {
      logger.debug('Using existing MCP session', { sessionId: anonymizeKey(sessionId) });
      await this.transports[sessionId].handleRequest(req, res, req.body);
    } else {
      logger.warn('No valid MCP session found', { sessionId: sessionId ? anonymizeKey(sessionId) : 'none' });
      res.status(400).json({ error: 'Invalid session' });
    }
  }

  async handleGet(req: Request, res: Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    
    logger.debug('MCP GET request for SSE', { 
      sessionId: sessionId ? anonymizeKey(sessionId) : 'none' 
    });
    
    if (sessionId && this.transports[sessionId]) {
      logger.debug('SSE connection established', { sessionId: anonymizeKey(sessionId) });
      await this.transports[sessionId].handleRequest(req, res);
    } else {
      logger.warn('No valid session for SSE', { sessionId: sessionId ? anonymizeKey(sessionId) : 'none' });
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
    
    for (const sessionId in this.transports) {
      try {
        logger.debug('Closing MCP transport', { sessionId: anonymizeKey(sessionId) });
        await this.transports[sessionId].close();
        delete this.transports[sessionId];
      } catch (error) {
        logger.error('Error closing MCP transport', { 
          sessionId: anonymizeKey(sessionId),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }
}