import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { OutlineNotAuthorizedException } from '../../auth/outline-oauth.js';
import { UserContext } from '../../types/context.js';

export const getCollectionSchema = {
  id: z.string().describe('The ID of the collection to retrieve'),
};

export async function getCollectionHandler(
  args: { id: string },
  context: UserContext
) {
  const { id } = args;
  try {
    const response = await context.outlineClient.makeRequest(context.userId, '/collections.info', {
      method: 'POST',
      data: {
        id,
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
      `Failed to get collection: ${error.message}`
    );
  }
}