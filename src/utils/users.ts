import { OutlineApiClient } from './outline-client.js';
import { apiLogger as logger } from '../lib/logger.js';

export interface OutlineUser {
  id: string;
  name: string;
  avatarUrl?: string;
  email: string;
  isAdmin: boolean;
  isViewer: boolean;
  createdAt: string;
}

/**
 * Find an Outline user by their email address
 * @param outlineClient The Outline API client
 * @param email The email address to search for
 * @returns The user object if found, null otherwise
 */
/**
 * Find the "Everyone" group ID dynamically
 */
async function findEveryoneGroupId(outlineClient: OutlineApiClient): Promise<string | null> {
  try {
    const response = await outlineClient.makeRequest('/groups.list', {
      method: 'POST',
      data: {
        filter: 'all',
        limit: 100
      }
    });

    const groups = response.data?.data?.groups || [];
    const everyoneGroup = groups.find((g: any) => g.name === 'Everyone');
    
    if (everyoneGroup) {
      logger.debug('Found Everyone group', { id: everyoneGroup.id });
      return everyoneGroup.id;
    }
    
    logger.warn('Everyone group not found');
    return null;
  } catch (error) {
    logger.error('Failed to find Everyone group', { error });
    return null;
  }
}

export async function findUserByEmail(
  outlineClient: OutlineApiClient, 
  email: string
): Promise<OutlineUser | null> {
  try {
    logger.info('Looking up user by email via group memberships', { email });

    // Step 1: Find the Everyone group ID
    const everyoneGroupId = await findEveryoneGroupId(outlineClient);
    if (!everyoneGroupId) {
      logger.error('Could not find Everyone group');
      return null;
    }

    // Step 2: Get members of the Everyone group
    const membershipsResponse = await outlineClient.makeRequest('/groups.memberships', {
      method: 'POST',
      data: {
        id: everyoneGroupId
      }
    });

    const users = membershipsResponse.data?.data?.users || [];
    logger.debug('Found users in Everyone group', { count: users.length });

    // Step 3: Since group memberships don't include emails, we need to match by name
    // The OAuth email is typically in format firstname.lastname@domain or similar
    // Extract potential name parts from email
    const emailParts = email.split('@')[0].split(/[._-]/);
    const emailLower = email.toLowerCase();
    
    logger.debug('Searching for user with email parts', { 
      email, 
      emailParts,
      userCount: users.length 
    });

    // Try to find user by matching name parts
    for (const user of users) {
      const userName = user.name?.toLowerCase() || '';
      
      // Check if all email parts are in the user's name
      const allPartsMatch = emailParts.every(part => 
        userName.includes(part.toLowerCase())
      );
      
      if (allPartsMatch) {
        logger.info('Found potential user match by name', {
          email,
          userName: user.name,
          userId: user.id
        });
        
        // Return user in expected format
        return {
          id: user.id,
          name: user.name,
          email: email, // Use the email we're searching for
          isAdmin: user.role === 'admin',
          isViewer: user.role === 'viewer',
          createdAt: user.createdAt,
          avatarUrl: user.avatarUrl
        };
      }
    }

    // If no match found by name parts, log available users for debugging
    if (logger.level === 'debug' || logger.level === 'trace') {
      logger.debug('Available users in Everyone group', {
        searchEmail: email,
        users: users.map((u: any) => ({ name: u.name, id: u.id, role: u.role }))
      });
    }

    logger.warn('User not found by email parts matching', { email });
    return null;
  } catch (error) {
    logger.error('Failed to lookup user by email', { 
      email,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Add a user to a collection with specified permissions
 * @param outlineClient The Outline API client
 * @param collectionId The collection ID
 * @param userId The user ID to add
 * @param permission The permission level (read, read_write, or manage)
 */
export async function addUserToCollection(
  outlineClient: OutlineApiClient,
  collectionId: string,
  userId: string,
  permission: 'read' | 'read_write' | 'manage' = 'read_write'
): Promise<void> {
  try {
    logger.info('Adding user to collection', { 
      collectionId, 
      userId, 
      permission 
    });

    await outlineClient.makeRequest('/collections.add_user', {
      method: 'POST',
      data: {
        id: collectionId,
        userId,
        permission
      }
    });

    logger.info('Successfully added user to collection', { 
      collectionId, 
      userId,
      permission 
    });
  } catch (error) {
    logger.error('Failed to add user to collection', { 
      collectionId,
      userId,
      permission,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    throw error;
  }
}