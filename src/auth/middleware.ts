import { Request, Response, NextFunction } from 'express';
import { TokenStorage } from '../storage/tokens.js';
import { authLogger as logger } from '../lib/logger.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    name?: string;
  };
}

export class AuthMiddleware {
  constructor(
    private storage: TokenStorage
  ) {}

  async ensureAuthenticated(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Check Bearer token authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('Missing or invalid authorization header');
        res.status(401).json({
          error: 'authentication_required',
          error_description: 'Bearer token required'
        });
        return;
      }

      const accessToken = authHeader.substring(7);
      const tokenData = await this.storage.getAccessToken(accessToken);
      
      if (!tokenData) {
        logger.warn('Invalid access token', {
          tokenPrefix: accessToken.substring(0, 10) + '...'
        });
        res.status(401).json({
          error: 'invalid_token',
          error_description: 'Invalid access token'
        });
        return;
      }

      // Check if token is expired
      if (tokenData.expiresAt < Date.now()) {
        logger.warn('Access token expired', {
          userId: tokenData.userId,
          expiresAt: new Date(tokenData.expiresAt).toISOString()
        });
        res.status(401).json({
          error: 'token_expired',
          error_description: 'Access token has expired'
        });
        return;
      }

      // Set user context from OAuth token data
      (req as AuthenticatedRequest).user = {
        userId: tokenData.userId,
        email: tokenData.userEmail || tokenData.email || 'user@authenticated.com',
        name: tokenData.name
      };

      logger.debug('User authenticated successfully', {
        userId: tokenData.userId,
        email: tokenData.userEmail || tokenData.email
      });

      next();
    } catch (error) {
      logger.error('Error in authentication middleware:', error);
      res.status(500).json({
        error: 'internal_error',
        error_description: 'Authentication processing failed'
      });
    }
  }
}