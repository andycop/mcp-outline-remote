import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { UserContext } from '../../types/context.js';
import { toolsLogger as logger } from '../../lib/logger.js';

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
    const response = await context.outlineClient.makeRequest('/collections.list', {
      method: 'POST',
      data: {
        offset,
        limit,
      }
    }, { userId: context.userId, email: context.email });
    
    logger.debug('Outline API response', { response: JSON.stringify(response.data).substring(0, 200) }, { userId: context.userId, email: context.email });
    
    // Check if response has data
    if (!response.data || !response.data.data) {
      throw new Error('Invalid response from Outline API');
    }
    
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
      `Failed to list collections: ${error.message}`
    );
  }
}