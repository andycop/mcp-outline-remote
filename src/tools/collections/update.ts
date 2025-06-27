import { outlineClient } from '../../utils/outline.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const updateCollectionSchema = {
  id: z.string().describe('The ID of the collection to update'),
  name: z.string().optional().describe('The new name of the collection'),
  description: z.string().optional().describe('The new description of the collection'),
  color: z.string().optional().describe('The new color of the collection'),
  private: z.boolean().optional().describe('Whether the collection should be private'),
};

export async function updateCollectionHandler({
  id,
  name,
  description,
  color,
  private: isPrivate,
}: {
  id: string;
  name?: string;
  description?: string;
  color?: string;
  private?: boolean;
}) {
  try {
    const response = await outlineClient.post('/collections.update', {
      id,
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
      `Failed to update collection: ${error.message}`
    );
  }
}