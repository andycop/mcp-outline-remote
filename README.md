# Outline MCP Remote Server

A remote Model Context Protocol (MCP) server that provides tools for interacting with [Outline](https://www.getoutline.com/), a modern wiki and knowledge base platform. This server uses Server-Sent Events (SSE) transport for remote connections over HTTP.

## Features

- **Document Management**: Search, create, retrieve, update, delete, list, and move documents
- **Collection Management**: Create, update, delete, and list collections
- **Remote Access**: SSE-based transport for remote MCP connections
- **Production Ready**: Built with TypeScript, Express.js, and comprehensive error handling
- **Environment Configuration**: Easy setup with environment variables

## Attribution

This implementation is based on the excellent work by the [Fellow team](https://github.com/fellowapp/mcp-outline):

- **Original Project**: https://github.com/fellowapp/mcp-outline
- **License**: ISC License
- **Authors**: Fellow team

All tool schemas, API patterns, and functionality have been migrated from their implementation while adapting to our SSE-based remote server architecture. We gratefully acknowledge their contribution to the MCP ecosystem.

## Available Tools

### Document Tools (7)
- `search_documents` - Search for documents with optional collection filtering
- `get_document` - Retrieve a specific document by ID or shareId
- `create_document` - Create new documents with full customization options
- `update_document` - Update existing documents with append support
- `delete_document` - Delete documents from Outline
- `list_documents` - List documents with filtering and pagination
- `move_document` - Move documents between collections or change hierarchy

### Collection Tools (5)
- `list_collections` - List all collections with pagination
- `get_collection` - Retrieve specific collection details
- `create_collection` - Create new collections with customization
- `update_collection` - Update existing collection properties
- `delete_collection` - Delete collections from Outline

## Quick Start

### Prerequisites
- Node.js 16+ 
- npm or yarn
- Outline API token ([Get one here](https://www.getoutline.com/developers))

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd mcp-outline-remote
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Outline API token:
   ```env
   OUTLINE_API_TOKEN=your_outline_api_token_here
   OUTLINE_API_URL=https://app.getoutline.com/api  # Optional
   PORT=3131  # Optional
   ```

4. **Build and start**
   ```bash
   npm run build
   npm start
   ```

   Or for development:
   ```bash
   npm run dev
   ```

### Usage

The server will be available at:
- **Health Check**: `http://localhost:3131/health`
- **MCP Endpoint**: `http://localhost:3131/v1/mcp`
- **Production URL**: `outline-mcp.your-domain.com:3131`

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OUTLINE_API_TOKEN` | ✅ Yes | - | Your Outline API token |
| `OUTLINE_API_URL` | ❌ No | `https://app.getoutline.com/api` | Outline API base URL |
| `PORT` | ❌ No | `3131` | Server port |

## API Reference

### Document Operations

#### Search Documents
```typescript
search_documents({
  query: string,           // Search query
  collectionId?: string,   // Optional collection filter
  limit?: number          // Max results (default: 25)
})
```

#### Create Document
```typescript
create_document({
  title: string,              // Document title
  text?: string,              // Markdown content
  collectionId: string,       // Target collection
  parentDocumentId?: string,  // Parent for nesting
  templateId?: string,        // Template to use
  publish?: boolean          // Publish immediately (default: true)
})
```

### Collection Operations

#### List Collections
```typescript
list_collections({
  limit?: number,    // Max results (default: 25)
  offset?: number   // Skip count (default: 0)
})
```

#### Create Collection
```typescript
create_collection({
  name: string,                    // Collection name
  description?: string,            // Description
  color?: string,                  // Hex color (#FF0000)
  icon?: string,                   // Icon name
  permission?: 'read' | 'read_write', // Default permission
  sharing?: boolean               // Allow sharing
})
```

## Development

### Scripts

```bash
npm run dev      # Development with watch mode
npm run build    # Build TypeScript to JavaScript
npm start        # Run production build
npm test         # Run tests (to be implemented)
```

### Project Structure

```
src/
  server.ts          # Main server with all MCP tools
package.json         # Dependencies and scripts
tsconfig.json        # TypeScript configuration
.env.example         # Environment variables template
CLAUDE.md           # Project documentation
```

## Architecture

- **Transport**: SSE (Server-Sent Events) over HTTP
- **Framework**: @modelcontextprotocol/sdk with Express.js
- **Language**: TypeScript with ES modules
- **API Client**: Axios for Outline API requests
- **Configuration**: dotenv for environment management

## Error Handling

All tools include comprehensive error handling:
- API authentication errors
- Network connectivity issues
- Invalid parameters
- Resource not found errors
- Rate limiting responses

Errors are returned in a structured format with helpful messages.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the ISC License - see the LICENSE file for details.

## Support

- **Documentation**: See [CLAUDE.md](./CLAUDE.md) for detailed project information
- **Issues**: Report bugs and feature requests via GitHub issues
- **Outline API**: [Official Outline API Documentation](https://www.getoutline.com/developers)

---

**Production Deployment**: `outline-mcp.your-domain.com:3131`
