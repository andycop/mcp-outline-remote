import { outlineClient } from '../../utils/outline.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const updateDocumentSchema = {
  id: z.string().describe('The ID of the document to update'),
  title: z.string().optional().describe('The new title of the document'),
  text: z.string().optional().describe('The new text content of the document'),
};

export async function updateDocumentHandler({
  id,
  title,
  text,
}: {
  id: string;
  title?: string;
  text?: string;
}) {
  try {
    const response = await outlineClient.post('/documents.update', {
      id,
      title,
      text,
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
      `Failed to update document: ${error.message}`
    );  
  }
}