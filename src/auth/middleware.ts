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

// Simple in-memory rate limiting for auth failures
const authFailures = new Map<string, { count: number; lastAttempt: number }>();
const AUTH_FAILURE_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_AUTH_FAILURES = 5;

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of authFailures.entries()) {
    if (now - data.lastAttempt > AUTH_FAILURE_WINDOW) {
      authFailures.delete(key);
    }
  }
}, 60 * 1000); // Clean up every minute

export class AuthMiddleware {
  constructor(
    private storage: TokenStorage
  ) {}

  async ensureAuthenticated(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Get client identifier for rate limiting (prefer CF-Connecting-IP for Cloudflare)
      const clientIp = (req.headers['cf-connecting-ip'] as string) || 
                      (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                      req.ip || 
                      'unknown';
      const rateLimitKey = `auth:${clientIp}`;

      // Check rate limit
      const failures = authFailures.get(rateLimitKey);
      if (failures && failures.count >= MAX_AUTH_FAILURES) {
        const timeSinceLastAttempt = Date.now() - failures.lastAttempt;
        if (timeSinceLastAttempt < AUTH_FAILURE_WINDOW) {
          logger.warn('Rate limit exceeded for authentication', {
            ip: clientIp,
            attempts: failures.count,
            cfRay: req.headers['cf-ray']
          });
          res.status(429).json({
            error: 'too_many_requests',
            error_description: 'Too many authentication attempts. Please try again later.'
          });
          return;
        }
      }

      // Check Bearer token authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        this.recordAuthFailure(rateLimitKey, clientIp, req);
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
        this.recordAuthFailure(rateLimitKey, clientIp, req);
        logger.warn('Invalid access token', {
          tokenPrefix: accessToken.substring(0, 10) + '...',
          ip: clientIp,
          cfRay: req.headers['cf-ray']
        });
        res.status(401).json({
          error: 'invalid_token',
          error_description: 'Invalid access token'
        });
        return;
      }

      // Check if token is expired
      if (tokenData.expiresAt < Date.now()) {
        this.recordAuthFailure(rateLimitKey, clientIp, req);
        logger.warn('Access token expired', {
          userId: tokenData.userId,
          expiresAt: new Date(tokenData.expiresAt).toISOString(),
          ip: clientIp,
          cfRay: req.headers['cf-ray']
        });
        res.status(401).json({
          error: 'token_expired',
          error_description: 'Access token has expired'
        });
        return;
      }

      // Authentication successful - reset failure count
      authFailures.delete(rateLimitKey);

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

  private recordAuthFailure(key: string, clientIp: string, req: Request): void {
    const current = authFailures.get(key) || { count: 0, lastAttempt: 0 };
    current.count++;
    current.lastAttempt = Date.now();
    authFailures.set(key, current);

    // Log security event
    logger.warn('Authentication failure recorded', {
      ip: clientIp,
      attempts: current.count,
      cfRay: req.headers['cf-ray'],
      cfCountry: req.headers['cf-ipcountry'],
      userAgent: req.headers['user-agent']
    });
  }
}