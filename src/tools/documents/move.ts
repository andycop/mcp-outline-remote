import { outlineClient } from '../../utils/outline.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const moveDocumentSchema = {
  id: z.string().describe('The ID of the document to move'),
  collectionId: z.string().describe('The ID of the collection to move the document to'),
  parentDocumentId: z.string().optional().describe('The ID of the new parent document'),
};

export async function moveDocumentHandler({
  id,
  collectionId,
  parentDocumentId,
}: {
  id: string;
  collectionId: string;
  parentDocumentId?: string;
}) {
  try {
    const response = await outlineClient.post('/documents.move', {
      id,
      collectionId,
      parentDocumentId,
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
      `Failed to move document: ${error.message}`
    );
  }
}