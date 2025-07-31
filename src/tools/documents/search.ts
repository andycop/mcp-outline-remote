import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { UserContext } from '../../types/context.js';

export const searchDocumentsSchema = {
  query: z.string().optional().describe('The search query (optional if using filters)'),
  offset: z.number().optional().describe('The offset to start search results from'),
  limit: z.number().optional().describe('The number of search results to return'),
  userId: z.string().optional().describe('Filter documents edited by specific user (UUID)'),
  collectionId: z.string().optional().describe('Search within a specific collection (UUID)'),
  documentId: z.string().optional().describe('Search within a specific document (UUID)'),
  statusFilter: z.enum(['draft', 'archived', 'published']).optional().describe('Filter by document status (draft, archived, published)'),
  dateFilter: z.enum(['day', 'week', 'month', 'year']).optional().describe('Filter by recent update period (day, week, month, year)'),
};

export async function searchDocumentsHandler(
  args: {
    query?: string;
    offset?: number;
    limit?: number;
    userId?: string;
    collectionId?: string;
    documentId?: string;
    statusFilter?: 'draft' | 'archived' | 'published';
    dateFilter?: 'day' | 'week' | 'month' | 'year';
  },
  context: UserContext
) {
  const { query, offset = 0, limit = 10, userId, collectionId, documentId, statusFilter, dateFilter } = args;
  try {
    // Build request data - omit UUID and enum fields if empty, include query as empty string
    const requestData: any = {
      offset: offset || 0,
      limit: limit || 25
    };
    
    // Query can be empty string (free text search)
    requestData.query = query || '';
    
    // Remove source parameter entirely - not required and causes server-side bug
    // where "app" gets transformed to "oauth" (invalid value)
    
    // UUID fields must be omitted if not specified (empty strings are invalid UUIDs)
    if (userId) requestData.userId = userId;
    if (collectionId) requestData.collectionId = collectionId;
    if (documentId) requestData.documentId = documentId;
    
    // Enum fields must be omitted if not specified (empty strings are invalid)
    if (statusFilter) requestData.statusFilter = statusFilter;
    if (dateFilter) requestData.dateFilter = dateFilter;


    const response = await context.outlineClient.makeRequest('/documents.search', {
      method: 'POST',
      data: requestData
    }, { userId: context.userId, email: context.email });
    
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response.data.data, null, 2),
        },
      ],
    };
  } catch (error: any) {
    if (error.message?.includes("authorization failed")) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Please connect your Outline account first. Visit /auth/outline/connect to authorize.',
          },
        ],
      };
    }
    
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Failed to search documents: ${error.message}`
    );
  }
}