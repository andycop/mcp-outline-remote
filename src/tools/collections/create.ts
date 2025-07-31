import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { UserContext } from '../../types/context.js';
import { findUserByEmail, addUserToCollection } from '../../utils/users.js';
import { toolsLogger as logger } from '../../lib/logger.js';

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

    const response = await context.outlineClient.makeRequest('/collections.create', {
      method: 'POST',
      data: requestData
    }, { userId: context.userId, email: context.email });
    
    const collection = response.data.data;
    
    // If we have an authenticated user email, add them to the collection
    if (context.email && context.email !== process.env.AI_BOT_EMAIL) {
      try {
        logger.info('Looking up authenticated user to add to collection', { 
          email: context.email,
          collectionId: collection.id
        });
        
        // Find the user by email
        const user = await findUserByEmail(context.outlineClient, context.email);
        
        if (user) {
          // Add the user to the collection with read_write permissions
          await addUserToCollection(
            context.outlineClient, 
            collection.id, 
            user.id,
            'read_write'
          );
          
          logger.info('Successfully added authenticated user to collection', {
            email: context.email,
            userId: user.id,
            collectionId: collection.id
          });
        } else {
          logger.warn('Could not find user by email to add to collection', { 
            email: context.email 
          });
        }
      } catch (error) {
        // Log the error but don't fail the collection creation
        logger.error('Failed to add authenticated user to collection', {
          email: context.email,
          collectionId: collection.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(collection, null, 2),
        },
      ],
    };
  } catch (error: any) {
    if (error.message?.includes('authorization failed')) {
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