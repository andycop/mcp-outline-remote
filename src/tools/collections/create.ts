import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { OutlineNotAuthorizedException } from '../../auth/outline-oauth.js';
import { UserContext } from '../../types/context.js';

export const createCollectionSchema = {
  name: z.string().describe('The name of the collection'),
  description: z.string().optional().describe('The description of the collection'),
  permission: z.string().optional().describe('Permission level for the collection (e.g., "read", "write", "admin")'),
  icon: z.string().optional().describe('Icon identifier: emoji (e.g., "📁", "🏢") or icon name from outline-icons package'),
  color: z.string().optional().describe('Color as hex code (e.g., "#FF6B6B", "#4ECDC4", "#45B7D1")'),
  sharing: z.boolean().optional().describe('Whether sharing is enabled for this collection'),
};

export async function createCollectionHandler(
  args: {
    name: string;
    description?: string;
    permission?: string;
    icon?: string;
    color?: string;
    sharing?: boolean;
  },
  context: UserContext
) {
  const { name, description, permission, icon, color, sharing } = args;
  try {
    const requestData: any = { name };
    
    // Only include optional parameters if they are provided
    if (description) requestData.description = description;
    if (permission) requestData.permission = permission;
    if (icon) requestData.icon = icon;
    if (color) requestData.color = color;
    if (sharing !== undefined) requestData.sharing = sharing;

    const response = await context.outlineClient.makeRequest(context.userId, '/collections.create', {
      method: 'POST',
      data: requestData
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
    if (error instanceof OutlineNotAuthorizedException) {
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
      `Failed to create collection: ${error.message}`
    );
  }
}