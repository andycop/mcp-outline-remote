import { outlineClient } from '../../utils/outline.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const getDocumentSchema = {
  id: z.string().describe('The ID of the document to retrieve'),
};

export async function getDocumentHandler({ id }: { id: string }) {
  try {
    const response = await outlineClient.post('/documents.info', {
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
      `Failed to get document: ${error.message}`
    );
  }
}