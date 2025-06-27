import { outlineClient } from '../../utils/outline.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const searchDocumentsSchema = {
  query: z.string().describe('The search query'),
  offset: z.number().optional().describe('The offset to start search results from'),
  limit: z.number().optional().describe('The number of search results to return'),
};

export async function searchDocumentsHandler({
  query,
  offset = 0,
  limit = 10,
}: {
  query: string;
  offset?: number;
  limit?: number;
}) {
  try {
    const response = await outlineClient.post('/documents.search', {
      query,
      offset,
      limit,
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
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Failed to search documents: ${error.message}`
    );
  }
}