import { outlineClient } from '../../utils/outline.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const createDocumentSchema = {
  title: z.string().describe('The title of the document'),
  text: z.string().describe('The text content of the document'),
  collectionId: z.string().describe('The ID of the collection to create the document in'),
  parentDocumentId: z.string().optional().describe('The ID of the parent document'),
};

export async function createDocumentHandler({
  title,
  text,
  collectionId,
  parentDocumentId,
}: {
  title: string;
  text: string;
  collectionId: string;
  parentDocumentId?: string;
}) {
  try {
    const response = await outlineClient.post('/documents.create', {
      title,
      text,
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
      `Failed to create document: ${error.message}`
    );
  }
}