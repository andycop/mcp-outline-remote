import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { OutlineNotAuthorizedException } from '../../auth/outline-oauth.js';
import { UserContext } from '../../types/context.js';

export const listDocumentsSchema = {
  collectionId: z.string().describe('The ID of the collection to list documents from'),
  offset: z.number().optional().describe('The offset to start listing documents from'),
  limit: z.number().optional().describe('The number of documents to return'),
  statusFilter: z.enum(['draft', 'archived', 'published']).optional().describe('Filter by document status: "draft", "archived", or "published"'),
  dateFilter: z.enum(['day', 'week', 'month', 'year']).optional().describe('Filter by recent update period: "day", "week", "month", or "year"'),
};

export async function listDocumentsHandler(
  args: {
    collectionId: string;
    offset?: number;
    limit?: number;
    statusFilter?: 'draft' | 'archived' | 'published';
    dateFilter?: 'day' | 'week' | 'month' | 'year';
  },
  context: UserContext
) {
  const { collectionId, offset = 0, limit = 10, statusFilter, dateFilter } = args;
  try {
    const requestData: any = { collectionId, offset, limit };
    
    // Enum fields must be omitted if not specified (empty strings are invalid)
    if (statusFilter) requestData.statusFilter = statusFilter;
    if (dateFilter) requestData.dateFilter = dateFilter;

    const response = await context.outlineClient.makeRequest(context.userId, '/documents.list', {
      method: 'POST',
      data: requestData
    });
    
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response.data.data, null, 2),
        },
      ],
    };
  } catch (error: any) {
    if (error instanceof OutlineNotAuthorizedException) {
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
      `Failed to list documents: ${error.message}`
    );
  }
}