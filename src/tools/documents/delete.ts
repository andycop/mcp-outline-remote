import { outlineClient } from '../../utils/outline.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const deleteDocumentSchema = {
  id: z.string().describe('The ID of the document to delete'),
};

export async function deleteDocumentHandler({ id }: { id: string }) {
  try {
    const response = await outlineClient.post('/documents.delete', {
      id,
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response.data, null, 2),
        },
      ],
    };
  } catch (error: any) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Failed to delete document: ${error.message}`
    );
  }
}