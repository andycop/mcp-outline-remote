import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { UserContext } from '../../types/context.js';

export const moveDocumentSchema = {
  id: z.string().describe('The ID of the document to move'),
  collectionId: z.string().describe('The ID of the collection to move the document to'),
  parentDocumentId: z.string().optional().describe('The ID of the new parent document'),
};

export async function moveDocumentHandler(
  args: {
    id: string;
    collectionId: string;
    parentDocumentId?: string;
  },
  context: UserContext
) {
  const { id, collectionId, parentDocumentId } = args;
  try {
    const response = await context.outlineClient.makeRequest('/documents.move', {
      method: 'POST',
      data: {
        id,
        collectionId,
        parentDocumentId,
      }
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
      `Failed to move document: ${error.message}`
    );
  }
}