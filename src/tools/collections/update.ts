import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { UserContext } from '../../types/context.js';

export const updateCollectionSchema = {
  id: z.string().describe('The ID of the collection to update'),
  name: z.string().optional().describe('The new name of the collection'),
  description: z.string().optional().describe('The new description of the collection'),
  permission: z.string().optional().describe('Permission level for the collection (e.g., "read", "write", "admin")'),
  icon: z.string().optional().describe('Icon identifier: emoji (e.g., "📁", "🏢") or icon name from outline-icons package'),
  color: z.string().optional().describe('Color as hex code (e.g., "#FF6B6B", "#4ECDC4", "#45B7D1")'),
  sharing: z.boolean().optional().describe('Whether sharing is enabled for this collection'),
};

export async function updateCollectionHandler(
  args: {
    id: string;
    name?: string;
    description?: string;
    permission?: string;
    icon?: string;
    color?: string;
    sharing?: boolean;
  },
  context: UserContext
) {
  const { id, name, description, permission, icon, color, sharing } = args;
  try {
    const requestData: any = { id };
    
    // Only include optional parameters if they are provided
    if (name) requestData.name = name;
    if (description) requestData.description = description;
    if (permission) requestData.permission = permission;
    if (icon) requestData.icon = icon;
    if (color) requestData.color = color;
    if (sharing !== undefined) requestData.sharing = sharing;

    const response = await context.outlineClient.makeRequest('/collections.update', {
      method: 'POST',
      data: requestData
    }, { userId: context.userId, email: context.email });
    
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response.data.data, null, 2),
        },
      ],
    };
  } catch (error: any) {
    if (error.message?.includes("authorization failed")) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Please connect your Outline account first. Visit /auth/outline/connect to authorize.',
          },
        ],
      };
    }
    
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Failed to update collection: ${error.message}`
    );
  }
}