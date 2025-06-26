import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3131;

// Outline API configuration
const OUTLINE_API_URL = process.env.OUTLINE_API_URL || 'https://app.getoutline.com/api';
const OUTLINE_API_TOKEN = process.env.OUTLINE_API_TOKEN;

if (!OUTLINE_API_TOKEN) {
  console.error('OUTLINE_API_TOKEN environment variable is required');
  process.exit(1);
}

// Axios instance for Outline API
const outlineApi = axios.create({
  baseURL: OUTLINE_API_URL,
  headers: {
    'Authorization': `Bearer ${OUTLINE_API_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

app.use(cors());
app.use(express.json());

const transports: Record<string, SSEServerTransport> = {};

const getServer = () => {
  const server = new McpServer({
    name: 'outline-mcp-server',
    version: '1.0.0',
  }, { 
    capabilities: { 
      logging: {},
      tools: {}
    } 
  });

  // Document Tools
  server.tool('search_documents', 'Search for documents in Outline', {
    query: z.string().describe('Search query to find documents'),
    collectionId: z.string().optional().describe('Collection ID to search within (optional)'),
    limit: z.number().optional().describe('Maximum number of results to return (default: 25)'),
  }, async ({ query, collectionId, limit = 25 }) => {
    try {
      const params: any = { query, limit };
      if (collectionId) params.collectionId = collectionId;
      
      const response = await outlineApi.post('/documents.search', params);
      const documents = response.data.data || [];
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${documents.length} document(s):\n\n${documents.map((doc: any) => 
              `• **${doc.title}** (ID: ${doc.id})\n  Collection: ${doc.collection?.name || 'Unknown'}\n  URL: ${doc.url}\n  Updated: ${new Date(doc.updatedAt).toLocaleDateString()}`
            ).join('\n\n')}`,
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error searching documents: ${error.response?.data?.message || error.message}`,
          }
        ],
        isError: true,
      };
    }
  });

  server.tool('get_document', 'Retrieve a specific document by ID', {
    id: z.string().describe('Document ID to retrieve'),
    shareId: z.string().optional().describe('Share ID as alternative to document ID'),
  }, async ({ id, shareId }) => {
    try {
      const params = shareId ? { shareId } : { id };
      const response = await outlineApi.post('/documents.info', params);
      const document = response.data.data;
      
      return {
        content: [
          {
            type: 'text',
            text: `**${document.title}**\n\n${document.text}\n\n---\nDocument ID: ${document.id}\nCollection: ${document.collection?.name || 'Unknown'}\nCreated: ${new Date(document.createdAt).toLocaleString()}\nUpdated: ${new Date(document.updatedAt).toLocaleString()}\nURL: ${document.url}`,
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error retrieving document: ${error.response?.data?.message || error.message}`,
          }
        ],
        isError: true,
      };
    }
  });

  server.tool('create_document', 'Create a new document in Outline', {
    title: z.string().describe('Document title'),
    text: z.string().optional().describe('Document content in Markdown'),
    collectionId: z.string().describe('Collection ID where the document will be created'),
    parentDocumentId: z.string().optional().describe('Parent document ID for nested documents'),
    templateId: z.string().optional().describe('Template ID to base the document on'),
    publish: z.boolean().optional().describe('Whether to publish the document immediately (default: true)'),
  }, async ({ title, text, collectionId, parentDocumentId, templateId, publish = true }) => {
    try {
      const params: any = { title, collectionId, publish };
      if (text) params.text = text;
      if (parentDocumentId) params.parentDocumentId = parentDocumentId;
      if (templateId) params.templateId = templateId;
      
      const response = await outlineApi.post('/documents.create', params);
      const document = response.data.data;
      
      return {
        content: [
          {
            type: 'text',
            text: `Document created successfully!\n\n**${document.title}**\nDocument ID: ${document.id}\nCollection: ${document.collection?.name}\nURL: ${document.url}\nCreated: ${new Date(document.createdAt).toLocaleString()}`,
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error creating document: ${error.response?.data?.message || error.message}`,
          }
        ],
        isError: true,
      };
    }
  });

  server.tool('update_document', 'Update an existing document', {
    id: z.string().describe('Document ID to update'),
    title: z.string().optional().describe('New document title'),
    text: z.string().optional().describe('New document content in Markdown'),
    append: z.boolean().optional().describe('Whether to append text instead of replacing (default: false)'),
    publish: z.boolean().optional().describe('Whether to publish the document'),
  }, async ({ id, title, text, append = false, publish }) => {
    try {
      const params: any = { id };
      if (title) params.title = title;
      if (text) params.text = text;
      if (append !== undefined) params.append = append;
      if (publish !== undefined) params.publish = publish;
      
      const response = await outlineApi.post('/documents.update', params);
      const document = response.data.data;
      
      return {
        content: [
          {
            type: 'text',
            text: `Document updated successfully!\n\n**${document.title}**\nDocument ID: ${document.id}\nCollection: ${document.collection?.name}\nURL: ${document.url}\nUpdated: ${new Date(document.updatedAt).toLocaleString()}`,
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error updating document: ${error.response?.data?.message || error.message}`,
          }
        ],
        isError: true,
      };
    }
  });

  server.tool('delete_document', 'Delete a document from Outline', {
    id: z.string().describe('Document ID to delete'),
  }, async ({ id }) => {
    try {
      await outlineApi.post('/documents.delete', { id });
      
      return {
        content: [
          {
            type: 'text',
            text: `Document with ID ${id} has been deleted successfully.`,
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error deleting document: ${error.response?.data?.message || error.message}`,
          }
        ],
        isError: true,
      };
    }
  });

  server.tool('list_documents', 'List documents with optional filtering', {
    collectionId: z.string().optional().describe('Collection ID to filter documents'),
    userId: z.string().optional().describe('User ID to filter documents by author'),
    template: z.boolean().optional().describe('Filter for template documents'),
    limit: z.number().optional().describe('Maximum number of documents to return (default: 25)'),
    offset: z.number().optional().describe('Number of documents to skip (default: 0)'),
  }, async ({ collectionId, userId, template, limit = 25, offset = 0 }) => {
    try {
      const params: any = { limit, offset };
      if (collectionId) params.collectionId = collectionId;
      if (userId) params.userId = userId;
      if (template !== undefined) params.template = template;
      
      const response = await outlineApi.post('/documents.list', params);
      const documents = response.data.data || [];
      const pagination = response.data.pagination;
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${documents.length} document(s) (${pagination?.offset + 1}-${Math.min(pagination?.offset + pagination?.limit, pagination?.total)} of ${pagination?.total}):\n\n${documents.map((doc: any) => 
              `• **${doc.title}** (ID: ${doc.id})\n  Collection: ${doc.collection?.name || 'Unknown'}\n  Author: ${doc.createdBy?.name || 'Unknown'}\n  Updated: ${new Date(doc.updatedAt).toLocaleDateString()}\n  URL: ${doc.url}`
            ).join('\n\n')}`,
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing documents: ${error.response?.data?.message || error.message}`,
          }
        ],
        isError: true,
      };
    }
  });

  server.tool('move_document', 'Move a document to a different collection or parent', {
    id: z.string().describe('Document ID to move'),
    collectionId: z.string().optional().describe('New collection ID'),
    parentDocumentId: z.string().optional().describe('New parent document ID (null to make it a root document)'),
    index: z.number().optional().describe('Position index in the new location'),
  }, async ({ id, collectionId, parentDocumentId, index }) => {
    try {
      const params: any = { id };
      if (collectionId) params.collectionId = collectionId;
      if (parentDocumentId !== undefined) params.parentDocumentId = parentDocumentId;
      if (index !== undefined) params.index = index;
      
      const response = await outlineApi.post('/documents.move', params);
      const document = response.data.data;
      
      return {
        content: [
          {
            type: 'text',
            text: `Document moved successfully!\n\n**${document.title}**\nDocument ID: ${document.id}\nNew Collection: ${document.collection?.name}\nURL: ${document.url}`,
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error moving document: ${error.response?.data?.message || error.message}`,
          }
        ],
        isError: true,
      };
    }
  });

  // Collection Tools
  server.tool('list_collections', 'List all collections', {
    limit: z.number().optional().describe('Maximum number of collections to return (default: 25)'),
    offset: z.number().optional().describe('Number of collections to skip (default: 0)'),
  }, async ({ limit = 25, offset = 0 }) => {
    try {
      const response = await outlineApi.post('/collections.list', { limit, offset });
      const collections = response.data.data || [];
      const pagination = response.data.pagination;
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${collections.length} collection(s) (${pagination?.offset + 1}-${Math.min(pagination?.offset + pagination?.limit, pagination?.total)} of ${pagination?.total}):\n\n${collections.map((col: any) => 
              `• **${col.name}** (ID: ${col.id})\n  Description: ${col.description || 'No description'}\n  Documents: ${col.documents?.length || 0}\n  Created: ${new Date(col.createdAt).toLocaleDateString()}\n  URL: ${col.url}`
            ).join('\n\n')}`,
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing collections: ${error.response?.data?.message || error.message}`,
          }
        ],
        isError: true,
      };
    }
  });

  server.tool('get_collection', 'Retrieve a specific collection by ID', {
    id: z.string().describe('Collection ID to retrieve'),
  }, async ({ id }) => {
    try {
      const response = await outlineApi.post('/collections.info', { id });
      const collection = response.data.data;
      
      return {
        content: [
          {
            type: 'text',
            text: `**${collection.name}**\n\n${collection.description || 'No description'}\n\n---\nCollection ID: ${collection.id}\nDocuments: ${collection.documents?.length || 0}\nCreated: ${new Date(collection.createdAt).toLocaleString()}\nUpdated: ${new Date(collection.updatedAt).toLocaleString()}\nURL: ${collection.url}\nColor: ${collection.color || 'Default'}\nIcon: ${collection.icon || 'Default'}`,
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error retrieving collection: ${error.response?.data?.message || error.message}`,
          }
        ],
        isError: true,
      };
    }
  });

  server.tool('create_collection', 'Create a new collection', {
    name: z.string().describe('Collection name'),
    description: z.string().optional().describe('Collection description'),
    color: z.string().optional().describe('Collection color in hex format (e.g., #FF0000)'),
    icon: z.string().optional().describe('Collection icon name'),
    permission: z.enum(['read', 'read_write']).optional().describe('Default permission level'),
    sharing: z.boolean().optional().describe('Whether collection is shareable'),
  }, async ({ name, description, color, icon, permission, sharing }) => {
    try {
      const params: any = { name };
      if (description) params.description = description;
      if (color) params.color = color;
      if (icon) params.icon = icon;
      if (permission) params.permission = permission;
      if (sharing !== undefined) params.sharing = sharing;
      
      const response = await outlineApi.post('/collections.create', params);
      const collection = response.data.data;
      
      return {
        content: [
          {
            type: 'text',
            text: `Collection created successfully!\n\n**${collection.name}**\nCollection ID: ${collection.id}\nDescription: ${collection.description || 'No description'}\nURL: ${collection.url}\nCreated: ${new Date(collection.createdAt).toLocaleString()}`,
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error creating collection: ${error.response?.data?.message || error.message}`,
          }
        ],
        isError: true,
      };
    }
  });

  server.tool('update_collection', 'Update an existing collection', {
    id: z.string().describe('Collection ID to update'),
    name: z.string().optional().describe('New collection name'),
    description: z.string().optional().describe('New collection description'),
    color: z.string().optional().describe('New collection color in hex format'),
    icon: z.string().optional().describe('New collection icon name'),
    permission: z.enum(['read', 'read_write']).optional().describe('New default permission level'),
    sharing: z.boolean().optional().describe('Whether collection is shareable'),
  }, async ({ id, name, description, color, icon, permission, sharing }) => {
    try {
      const params: any = { id };
      if (name) params.name = name;
      if (description) params.description = description;
      if (color) params.color = color;
      if (icon) params.icon = icon;
      if (permission) params.permission = permission;
      if (sharing !== undefined) params.sharing = sharing;
      
      const response = await outlineApi.post('/collections.update', params);
      const collection = response.data.data;
      
      return {
        content: [
          {
            type: 'text',
            text: `Collection updated successfully!\n\n**${collection.name}**\nCollection ID: ${collection.id}\nDescription: ${collection.description || 'No description'}\nURL: ${collection.url}\nUpdated: ${new Date(collection.updatedAt).toLocaleString()}`,
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error updating collection: ${error.response?.data?.message || error.message}`,
          }
        ],
        isError: true,
      };
    }
  });

  server.tool('delete_collection', 'Delete a collection from Outline', {
    id: z.string().describe('Collection ID to delete'),
  }, async ({ id }) => {
    try {
      await outlineApi.post('/collections.delete', { id });
      
      return {
        content: [
          {
            type: 'text',
            text: `Collection with ID ${id} has been deleted successfully.`,
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error deleting collection: ${error.response?.data?.message || error.message}`,
          }
        ],
        isError: true,
      };
    }
  });

  return server;
};

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeConnections: Object.keys(transports).length,
    server: 'outline-mcp.your-domain.com'
  });
});

app.get('/v1/mcp', async (req, res) => {
  console.log('Received GET request to /v1/mcp (establishing SSE stream)');
  
  try {
    const transport = new SSEServerTransport('/v1/messages', res);
    const sessionId = transport.sessionId;
    transports[sessionId] = transport;

    transport.onclose = () => {
      console.log(`SSE transport closed for session ${sessionId}`);
      delete transports[sessionId];
    };

    const server = getServer();
    await server.connect(transport);
    
    console.log(`Established SSE stream with session ID: ${sessionId}`);
    console.log(`Total active connections: ${Object.keys(transports).length}`);
  } catch (error) {
    console.error('Error establishing SSE stream:', error);
    if (!res.headersSent) {
      res.status(500).send('Error establishing SSE stream');
    }
  }
});

app.post('/v1/messages', async (req, res) => {
  console.log('Received POST request to /v1/messages');
  
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    console.error('No session ID provided in request URL');
    res.status(400).send('Missing sessionId parameter');
    return;
  }

  const transport = transports[sessionId];
  if (!transport) {
    console.error(`No active transport found for session ID: ${sessionId}`);
    res.status(404).send('Session not found');
    return;
  }

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error('Error handling request:', error);
    if (!res.headersSent) {
      res.status(500).send('Error handling request');
    }
  }
});

const server = app.listen(PORT, () => {
  console.log(`MCP Server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP SSE endpoint: http://localhost:${PORT}/v1/mcp`);
  console.log(`MCP Messages endpoint: http://localhost:${PORT}/v1/messages`);
  console.log('Public URL: outline-mcp.your-domain.com:3131');
});

process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  
  for (const sessionId in transports) {
    try {
      console.log(`Closing transport for session ${sessionId}`);
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }
  
  server.close(() => {
    console.log('Server shutdown complete');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  
  for (const sessionId in transports) {
    try {
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;