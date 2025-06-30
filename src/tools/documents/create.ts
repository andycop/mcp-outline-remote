import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { OutlineNotAuthorizedException } from '../../auth/outline-oauth.js';
import { UserContext } from '../../types/context.js';

export const createDocumentSchema = {
  title: z.string().describe('The title of the document'),
  collectionId: z.string().describe('The ID of the collection to create the document in'),
  text: z.string().optional().describe('The text content of the document in markdown'),
  parentDocumentId: z.string().optional().describe('The ID of the parent document to create nested document'),
  templateId: z.string().optional().describe('Template ID to base this document on'),
  template: z.boolean().optional().describe('Mark this document as a template'),
  publish: z.boolean().optional().describe('Immediately make the document visible (publish)'),
};

export async function createDocumentHandler(
  args: {
    title: string;
    collectionId: string;
    text?: string;
    parentDocumentId?: string;
    templateId?: string;
    template?: boolean;
    publish?: boolean;
  },
  context: UserContext
) {
  const { title, collectionId, text, parentDocumentId, templateId, template, publish } = args;
  try {
    const requestData: any = { title, collectionId };
    
    // Only include optional parameters if they are provided
    if (text) requestData.text = text;
    if (parentDocumentId) requestData.parentDocumentId = parentDocumentId;
    if (templateId) requestData.templateId = templateId;
    if (template !== undefined) requestData.template = template;
    if (publish !== undefined) requestData.publish = publish;

    const response = await context.outlineClient.makeRequest(context.userId, '/documents.create', {
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
      `Failed to create document: ${error.message}`
    );
  }
}