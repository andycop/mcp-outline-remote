import { outlineClient } from '../../utils/outline.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const getCollectionSchema = {
  id: z.string().describe('The ID of the collection to retrieve'),
};

export async function getCollectionHandler({ id }: { id: string }) {
  try {
    const response = await outlineClient.post('/collections.info', {
      id,
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
      `Failed to get collection: ${error.message}`
    );
  }
}