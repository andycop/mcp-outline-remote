import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { OutlineNotAuthorizedException } from '../../auth/outline-oauth.js';
import { UserContext } from '../../types/context.js';

export const listCollectionsSchema = {
  offset: z.number().optional().describe('The offset to start listing collections from'),
  limit: z.number().optional().describe('The number of collections to return'),
};

export async function listCollectionsHandler(
  args: {
    offset?: number;
    limit?: number;
  } = {},
  context: UserContext
) {
  const { offset = 0, limit = 10 } = args;
  try {
    const response = await context.outlineClient.makeRequest(context.userId, '/collections.list', {
      method: 'POST',
      data: {
        offset,
        limit,
      }
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
      `Failed to list collections: ${error.message}`
    );
  }
}