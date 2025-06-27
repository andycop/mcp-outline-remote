import { outlineClient } from '../../utils/outline.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const listDocumentsSchema = {
  collectionId: z.string().describe('The ID of the collection to list documents from'),
  offset: z.number().optional().describe('The offset to start listing documents from'),
  limit: z.number().optional().describe('The number of documents to return'),
};

export async function listDocumentsHandler({
  collectionId,
  offset = 0,
  limit = 10,
}: {
  collectionId: string;
  offset?: number;
  limit?: number;
}) {
  try {
    const response = await outlineClient.post('/documents.list', {
      collectionId,
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
      `Failed to list documents: ${error.message}`
    );
  }
}