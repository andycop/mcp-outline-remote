# MCP Outline Remote Server

## Project Overview
This is a remote MCP (Model Context Protocol) server that provides tools for interacting with Outline (document management platform). It's based on a hello-world MCP server template with SSE (Server-Sent Events) transport.

## Current Status
- ✅ Base MCP remote server template copied from `mcp-server` hello-world example
- ✅ SSE transport configured for remote connections
- ✅ Health endpoint and graceful shutdown implemented
- ✅ **COMPLETED**: Migrated all Outline tools from stdio implementation
- ✅ Document management tools implemented (search, get, create, update, delete, list, move)
- ✅ Collection management tools implemented (list, get, create, update, delete)
- ✅ Environment configuration with .env support
- ✅ Build and deployment ready

## Architecture
- **Transport**: SSE over HTTP (port 3131)
- **Framework**: @modelcontextprotocol/sdk with Express.js
- **Target URL**: outline-mcp.your-domain.com:3131
- **Module Type**: ESM with TypeScript

## Source Material
The tools need to be migrated from: https://github.com/fellowapp/mcp-outline
- This is currently a STDIO-based MCP server
- Has comprehensive Outline API integration
- Includes document and collection management tools

## Implemented Tools
All tools migrated from the Fellow Outline MCP server:

1. **Document Tools**:
   - ✅ search_documents - Search for documents with optional collection filtering
   - ✅ get_document - Retrieve document by ID or shareId
   - ✅ create_document - Create new documents with full options support
   - ✅ update_document - Update existing documents with append option
   - ✅ delete_document - Delete documents from Outline
   - ✅ list_documents - List documents with filtering and pagination
   - ✅ move_document - Move documents between collections

2. **Collection Tools**:
   - ✅ list_collections - List all collections with pagination
   - ✅ get_collection - Retrieve specific collection details
   - ✅ create_collection - Create new collections with customization
   - ✅ update_collection - Update existing collection properties
   - ✅ delete_collection - Delete collections from Outline

## Migration Pattern
Convert from STDIO pattern:
```javascript
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [/* tool definitions */]
}));
```

To our SSE pattern:
```typescript
server.tool('search_documents', 'Search Outline documents', {
  query: z.string().describe('Search query'),
}, async ({ query }) => {
  // Implementation
});
```

## Environment Setup
Required environment variables (see .env.example):
- ✅ OUTLINE_API_TOKEN - Your Outline API token (required)
- ✅ OUTLINE_API_URL - Outline API base URL (optional, defaults to https://app.getoutline.com/api)
- ✅ PORT - Server port (optional, defaults to 3131)

## Setup Instructions
1. Copy `.env.example` to `.env`
2. Add your Outline API token to the `.env` file
3. Run `npm install` to install dependencies
4. Run `npm run build` to build the project
5. Run `npm start` to start the production server
6. Or run `npm run dev` for development with watch mode

## Commands
- `npm run dev` - Development with watch mode  
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Run production build
- `npm test` - Run tests (to be added)

## Current File Structure
```
src/
  server.ts          # Main server with hello-world tool
package.json         # Dependencies and scripts
tsconfig.json        # TypeScript configuration  
.gitignore          # Git ignore rules
```

## Migration Complete! ✅

The Outline MCP server migration is now complete. All tools have been successfully migrated from the stdio-based implementation to our SSE-based remote server framework.

### Available Tools
All 12 Outline tools are now available:
- 7 Document management tools
- 5 Collection management tools
- Full error handling and validation
- Proper SSE transport for remote connections
- Environment-based configuration

### Ready for Production
The server is now ready for deployment at outline-mcp.your-domain.com:3131 with all Outline API functionality preserved from the original Fellow implementation.