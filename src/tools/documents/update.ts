import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { OutlineNotAuthorizedException } from '../../auth/outline-oauth.js';
import { UserContext } from '../../types/context.js';

export const updateDocumentSchema = {
  id: z.string().describe('The ID of the document to update'),
  title: z.string().optional().describe('The new title of the document'),
  text: z.string().optional().describe('The new text content of the document in markdown'),
  append: z.boolean().optional().describe('Append text instead of replacing existing content'),
  publish: z.boolean().optional().describe('Publish the document if it is a draft'),
  done: z.boolean().optional().describe('Finish the editing session'),
};

export async function updateDocumentHandler(
  args: {
    id: string;
    title?: string;
    text?: string;
    append?: boolean;
    publish?: boolean;
    done?: boolean;
  },
  context: UserContext
) {
  const { id, title, text, append, publish, done } = args;
  try {
    const requestData: any = { id };
    
    // Only include optional parameters if they are provided
    if (title) requestData.title = title;
    if (text) requestData.text = text;
    if (append !== undefined) requestData.append = append;
    if (publish !== undefined) requestData.publish = publish;
    if (done !== undefined) requestData.done = done;

    const response = await context.outlineClient.makeRequest(context.userId, '/documents.update', {
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
      `Failed to update document: ${error.message}`
    );
  }
}