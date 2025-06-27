import { outlineClient } from '../../utils/outline.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const deleteCollectionSchema = {
  id: z.string().describe('The ID of the collection to delete'),
};

export async function deleteCollectionHandler({ id }: { id: string }) {
  try {
    const response = await outlineClient.post('/collections.delete', {
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
      `Failed to delete collection: ${error.message}`
    );
  }
}