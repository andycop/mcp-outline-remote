import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { UserContext } from '../../types/context.js';

export const deleteCollectionSchema = {
  id: z.string().describe('The ID of the collection to delete'),
};

export async function deleteCollectionHandler(
  args: { id: string },
  context: UserContext
) {
  const { id } = args;
  try {
    const response = await context.outlineClient.makeRequest('/collections.delete', {
      method: 'POST',
      data: {
        id,
      }
    }, { userId: context.userId, email: context.email });
    
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response.data, null, 2),
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
      `Failed to delete collection: ${error.message}`
    );
  }
}