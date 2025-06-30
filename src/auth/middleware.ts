import { Request, Response, NextFunction } from 'express';
import { TokenStorage } from '../storage/tokens.js';
import { OutlineOAuthService } from './outline-oauth.js';
import { OutlineApiClient } from '../utils/outline-client.js';
import { logger, anonymizeKey } from '../utils/logger.js';

export class AuthMiddleware {
  constructor(
    private storage: TokenStorage,
    private outlineClient: OutlineApiClient,
    private outlineOAuthService?: OutlineOAuthService
  ) {}

  async ensureAuthenticated(req: Request, res: Response, next: NextFunction): Promise<void> {
    // For MCP endpoints, check Bearer token authentication (Claude.ai)
    if (req.path.startsWith('/v1/mcp')) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const accessToken = authHeader.substring(7);
        const tokenData = await this.storage.getAccessToken(accessToken);
        
        if (tokenData) {
          // Check if Claude.ai token is expired
          if (tokenData.expiresAt < Date.now()) {
            logger.warn('Claude.ai access token expired, requiring re-authentication', {
              userId: tokenData.userId,
              expiresAt: new Date(tokenData.expiresAt).toISOString()
            });
            res.status(401).json({
              error: 'invalid_token',
              error_description: 'Access token has expired. Please reconnect your Outline account.'
            });
            return;
          }
          
          // Get user's Outline tokens using the userId from the access token
          const outlineTokens = await this.storage.getOutlineTokens(tokenData.userId);
          
          // Verify Outline tokens are still valid (and refresh if needed)
          if (outlineTokens && this.outlineOAuthService) {
            try {
              // This will automatically refresh if needed
              await this.outlineOAuthService.getValidAccessToken(tokenData.userId);
            } catch (error) {
              logger.warn('Outline token refresh failed, requiring re-authentication', {
                userId: tokenData.userId,
                error: error instanceof Error ? error.message : String(error)
              });
              res.status(401).json({
                error: 'outline_auth_required',
                error_description: 'Please connect your Outline account first. Visit /auth/outline/connect to authorize.'
              });
              return;
            }
          }
          
          // Fetch real user info from Outline
          const userInfo = await this.outlineClient.getUserInfo(tokenData.userId);
          
          logger.debug('MCP authentication successful', {
            userId: tokenData.userId,
            hasOutlineTokens: !!outlineTokens,
            realUserName: userInfo?.name
          });
          
          // Set user context for MCP handlers
          (req as any).user = {
            oid: tokenData.userId,
            name: userInfo?.name || 'Outline User',
            email: userInfo?.email || 'outline-user@authenticated.com',
            outlineUserId: userInfo?.id, // The real Outline user ID
            outlineTokens
          };
          return next();
        } else {
          logger.warn('Invalid or expired access token for MCP request');
          res.status(401).json({
            error: 'invalid_token',
            error_description: 'Access token is invalid or expired'
          });
          return;
        }
      }
      
      // No Bearer token provided for MCP endpoint
      res.status(401).json({
        error: 'authentication_required', 
        error_description: 'Bearer token required for MCP endpoints'
      });
      return;
    }
    
    // For web interface, check session-based authentication
    const sessionUserId = (req.session as any)?.outlineUserId;
    if (sessionUserId) {
      const outlineTokens = await this.storage.getOutlineTokens(sessionUserId);
      if (outlineTokens) {
        // Set user context for web interface
        (req as any).user = {
          oid: sessionUserId,
          name: 'Outline User',
          email: 'outline-user@authenticated.com',
          outlineTokens
        };
        return next();
      }
    }
    
    // For web interface, redirect to Outline OAuth flow if not authenticated
    if (this.outlineOAuthService) {
      res.redirect('/auth/connect');
    } else {
      // Legacy token mode - check if we have a token configured
      if (process.env.OUTLINE_API_TOKEN) {
        // Allow access with legacy token
        (req as any).user = {
          oid: 'legacy-token-user',
          name: 'Legacy Token User',
          email: 'legacy@token.mode'
        };
        return next();
      } else {
        res.redirect('/');
      }
    }
  }
}