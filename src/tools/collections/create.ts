import { outlineClient } from '../../utils/outline.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const createCollectionSchema = {
  name: z.string().describe('The name of the collection'),
  description: z.string().optional().describe('The description of the collection'),
  color: z.string().optional().describe('The color of the collection'),
  private: z.boolean().optional().describe('Whether the collection is private'),
};

export async function createCollectionHandler({
  name,
  description,
  color,
  private: isPrivate,
}: {
  name: string;
  description?: string;
  color?: string;
  private?: boolean;
}) {
  try {
    const response = await outlineClient.post('/collections.create', {
      name,
      description,
      color,
      private: isPrivate,
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
      `Failed to create collection: ${error.message}`
    );
  }
}