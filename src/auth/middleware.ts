import { Request, Response, NextFunction } from 'express';
import { TokenStorage } from '../storage/tokens.js';
import { OutlineOAuthService } from './outline-oauth.js';
import { logger, anonymizeKey } from '../utils/logger.js';

export class AuthMiddleware {
  constructor(
    private storage: TokenStorage,
    private outlineOAuthService?: OutlineOAuthService
  ) {}

  async ensureAuthenticated(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Check for Outline OAuth authentication in session
    const sessionUserId = (req.session as any)?.outlineUserId;
    if (sessionUserId) {
      const outlineTokens = await this.storage.getOutlineTokens(sessionUserId);
      if (outlineTokens) {
        // Set user context for downstream handlers
        (req as any).user = {
          oid: sessionUserId,
          name: 'Outline User',
          email: 'outline-user@authenticated.com',
          outlineTokens
        };
        return next();
      }
    }
    
    // For MCP endpoints, check if we have direct Outline authentication
    if (req.path.startsWith('/v1/mcp')) {
      // Check for session-based Outline auth
      if (sessionUserId) {
        const isAuthorized = await this.storage.isUserAuthorizedForOutline(sessionUserId);
        if (isAuthorized) {
          (req as any).user = {
            oid: sessionUserId,
            name: 'Outline User',
            email: 'outline-user@authenticated.com'
          };
          return next();
        }
      }
      
      // No valid authentication for MCP
      if (this.outlineOAuthService) {
        res.status(401).json({ 
          error: 'authentication_required',
          error_description: 'Outline OAuth authentication required',
          auth_url: `/auth/connect`
        });
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
          res.status(503).json({ 
            error: 'service_unavailable',
            error_description: 'No authentication method configured'
          });
        }
      }
      return;
    }
    
    // For web interface, redirect to Outline OAuth flow
    if (this.outlineOAuthService) {
      res.redirect('/auth/connect');
    } else {
      // Legacy token mode - show simple landing page
      res.redirect('/');
    }
  }
}