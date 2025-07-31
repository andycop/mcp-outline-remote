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
    
    logger.debug('Outline API response', { 
      status: response.status,
      hasData: !!response.data,
      hasDataData: !!response.data?.data,
      responsePreview: JSON.stringify(response.data).substring(0, 500) 
    }, { userId: context.userId, email: context.email });
    
    // Check if response has data - Outline API returns data in response.data
    if (!response.data) {
      logger.error('Invalid Outline API response structure', {
        status: response.status,
        responseData: response.data,
        expectedStructure: 'response.data'
      });
      throw new Error(`Invalid response from Outline API: ${JSON.stringify(response.data).substring(0, 200)}`);
    }
    
    // Check if it's an error response
    if (response.data.error || response.data.ok === false) {
      throw new Error(`Outline API error: ${response.data.error || 'Request failed'}`);
    }
    
    // The actual data might be in response.data.data or directly in response.data
    const collections = response.data.data || response.data;
    
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(collections, null, 2),
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