import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { logger, anonymizeKey } from '../utils/logger.js';

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

  createServer(): McpServer {
    const server = new McpServer({
      name: 'outline-mcp-server',
      version: '1.0.0',
    }, { 
      capabilities: { 
        logging: {},
        tools: {}
      } 
    });

    // Document tools
    server.tool('list_documents', 'List documents in a collection', listDocumentsSchema, listDocumentsHandler);
    server.tool('create_document', 'Create a new document', createDocumentSchema, createDocumentHandler);
    server.tool('get_document', 'Get a document by ID', getDocumentSchema, getDocumentHandler);
    server.tool('update_document', 'Update a document', updateDocumentSchema, updateDocumentHandler);
    server.tool('delete_document', 'Delete a document', deleteDocumentSchema, deleteDocumentHandler);
    server.tool('search_documents', 'Search documents by query', searchDocumentsSchema, searchDocumentsHandler);
    server.tool('move_document', 'Move a document to another collection', moveDocumentSchema, moveDocumentHandler);

    // Collection tools
    server.tool('list_collections', 'List all collections', listCollectionsSchema, listCollectionsHandler);
    server.tool('create_collection', 'Create a new collection', createCollectionSchema, createCollectionHandler);
    server.tool('get_collection', 'Get a collection by ID', getCollectionSchema, getCollectionHandler);
    server.tool('update_collection', 'Update a collection', updateCollectionSchema, updateCollectionHandler);
    server.tool('delete_collection', 'Delete a collection', deleteCollectionSchema, deleteCollectionHandler);

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

      const server = this.createServer();
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