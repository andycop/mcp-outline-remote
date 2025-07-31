import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { serverLogger as logger } from '../lib/logger.js';

/**
 * Security-aware error handling utilities
 * Provides generic error messages to prevent information leakage
 */

export interface SafeErrorOptions {
  code?: ErrorCode;
  logLevel?: 'error' | 'warn' | 'info';
  context?: Record<string, any>;
}

/**
 * Create a safe error that logs details server-side but returns generic message to client
 */
export function createSafeError(
  userMessage: string,
  actualError: any,
  options: SafeErrorOptions = {}
): McpError {
  const {
    code = ErrorCode.InternalError,
    logLevel = 'error',
    context = {}
  } = options;

  // Log the actual error with full details server-side
  const errorDetails = {
    userMessage,
    actualMessage: actualError?.message || 'Unknown error',
    stack: actualError?.stack,
    code: actualError?.code,
    ...context
  };

  logger[logLevel]('Error occurred', errorDetails);

  // Return generic error to user
  return new McpError(code, userMessage);
}

/**
 * Generic error messages for common scenarios
 */
export const GenericErrors = {
  OPERATION_FAILED: 'The operation could not be completed. Please try again.',
  AUTHORIZATION_FAILED: 'You are not authorized to perform this action.',
  RESOURCE_NOT_FOUND: 'The requested resource was not found.',
  INVALID_REQUEST: 'The request could not be processed. Please check your input.',
  INTERNAL_ERROR: 'An internal error occurred. Please try again later.',
  NETWORK_ERROR: 'A network error occurred. Please check your connection.',
  RATE_LIMITED: 'Too many requests. Please try again later.'
} as const;

/**
 * Map specific error patterns to generic messages
 */
export function getGenericErrorMessage(error: any): string {
  const message = error?.message?.toLowerCase() || '';
  
  if (message.includes('authorization') || message.includes('unauthorized')) {
    return GenericErrors.AUTHORIZATION_FAILED;
  }
  
  if (message.includes('not found') || message.includes('404')) {
    return GenericErrors.RESOURCE_NOT_FOUND;
  }
  
  if (message.includes('invalid') || message.includes('validation')) {
    return GenericErrors.INVALID_REQUEST;
  }
  
  if (message.includes('network') || message.includes('timeout') || message.includes('econnrefused')) {
    return GenericErrors.NETWORK_ERROR;
  }
  
  if (message.includes('rate limit') || message.includes('429')) {
    return GenericErrors.RATE_LIMITED;
  }
  
  return GenericErrors.INTERNAL_ERROR;
}

/**
 * Wrap tool handlers with safe error handling
 */
export function withSafeErrors<T extends (...args: any[]) => Promise<any>>(
  handler: T,
  operation: string
): T {
  return (async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error: any) {
      // Special handling for authorization errors
      if (error?.message?.includes('authorization failed')) {
        throw createSafeError(
          GenericErrors.AUTHORIZATION_FAILED,
          error,
          { 
            code: ErrorCode.InvalidRequest,
            context: { operation }
          }
        );
      }
      
      // Generic error handling
      const genericMessage = getGenericErrorMessage(error);
      throw createSafeError(
        `${operation}: ${genericMessage}`,
        error,
        {
          code: ErrorCode.InternalError,
          context: { operation }
        }
      );
    }
  }) as T;
}