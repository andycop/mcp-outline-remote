import { Request, Response, NextFunction } from 'express';
import { TokenStorage } from '../storage/tokens.js';
import { logger, anonymizeKey } from '../utils/logger.js';

export class AuthMiddleware {
  constructor(private storage: TokenStorage) {}

  async ensureAuthenticated(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Option 1: Existing session (browsers)
    if ((req.session as any)?.user) {
      return next();
    }
    
    // Option 2: Bearer token (MCP clients)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const tokenData = await this.storage.getAccessToken(token);
        if (!tokenData) {
          throw new Error('Token not found');
        }
        
        // For MCP clients, we'll set a minimal user object
        (req as any).user = {
          oid: tokenData.userId,
          name: 'MCP Client User',
          email: 'mcp-client@example.com'
        };
        
        logger.debug('Bearer token authentication successful', {
          userId: anonymizeKey(tokenData.userId),
          clientId: tokenData.clientId,
          scope: tokenData.scope
        });
        
        return next();
      } catch (error) {
        logger.warn('Bearer token validation failed', {
          token: anonymizeKey(token),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }
    }
    
    // No valid auth
    if (req.path.startsWith('/v1/')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    res.redirect('/login');
  }
}