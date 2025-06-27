import { outlineClient } from '../../utils/outline.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const listCollectionsSchema = {
  offset: z.number().optional().describe('The offset to start listing collections from'),
  limit: z.number().optional().describe('The number of collections to return'),
};

export async function listCollectionsHandler({
  offset = 0,
  limit = 10,
}: {
  offset?: number;
  limit?: number;
} = {}) {
  try {
    const response = await outlineClient.post('/collections.list', {
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
      `Failed to list collections: ${error.message}`
    );
  }
}