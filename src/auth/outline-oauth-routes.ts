import { Router, Request, Response } from 'express';
import { OutlineOAuthService, OutlineNotAuthorizedException } from './outline-oauth.js';
import { logger } from '../utils/logger.js';

interface AuthenticatedRequest extends Request {
  session: any;
  user?: any;
}

interface OutlineOAuthState {
  codeVerifier: string;
  userId: string;
  originalUrl?: string;
}

export function createOutlineOAuthRoutes(oauthService: OutlineOAuthService): Router {
  const router = Router();

  /**
   * Connect user to Outline OAuth (Primary Authentication)
   * GET /auth/connect
   */
  router.get('/connect', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      // Generate a session-based user ID if none exists
      let userId = req.session?.outlineUserId;
      if (!userId) {
        userId = `outline-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        req.session.outlineUserId = userId;
      }
      
      // Check if already connected
      const isAuthorized = await oauthService.isUserAuthorized(userId);
      if (isAuthorized) {
        res.json({ 
          status: 'already_connected',
          message: 'Already connected to Outline' 
        });
        return;
      }

      // Generate OAuth URL
      const { url, codeVerifier, state } = oauthService.generateAuthUrl(userId);
      
      // Store state in session
      const oauthState: OutlineOAuthState = {
        codeVerifier,
        userId,
        originalUrl: req.query.return_url as string
      };
      req.session.outlineOAuthState = oauthState;

      logger.info('Initiating Outline OAuth connection', {
        userId,
        state,
        hasReturnUrl: !!oauthState.originalUrl
      });

      // Check if this is a browser request or API request
      const acceptsHtml = req.headers.accept?.includes('text/html');
      
      if (acceptsHtml) {
        // Browser request - redirect to Outline OAuth
        res.redirect(url);
      } else {
        // API request - return JSON with auth URL
        res.json({
          status: 'redirect',
          authUrl: url,
          state
        });
      }
    } catch (error: any) {
      logger.error('Failed to initiate Outline OAuth connection', {
        error: error.message,
        userId: req.session?.user?.oid
      });
      res.status(500).json({ 
        error: 'Failed to initiate OAuth connection',
        message: error.message 
      });
    }
  });

  /**
   * Handle OAuth callback from Outline
   * GET /auth/outline/callback
   */
  router.get('/callback', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { code, state, error: oauthError } = req.query;

      if (oauthError) {
        logger.error('OAuth error from Outline', { 
          error: oauthError,
          description: req.query.error_description 
        });
        res.status(400).json({
          error: 'OAuth authorization failed',
          message: req.query.error_description || oauthError
        });
        return;
      }

      if (!code || !state) {
        res.status(400).json({
          error: 'Missing required parameters',
          message: 'Authorization code and state are required'
        });
        return;
      }

      // Retrieve and validate state
      const oauthState: OutlineOAuthState = req.session?.outlineOAuthState;
      if (!oauthState || !oauthState.codeVerifier) {
        res.status(400).json({
          error: 'Invalid OAuth state',
          message: 'Session state not found or expired'
        });
        return;
      }

      // Clear the session state
      delete req.session.outlineOAuthState;

      logger.info('Processing Outline OAuth callback', {
        state: state as string,
        hasCode: !!code,
        userId: oauthState.userId
      });

      // Exchange code for tokens
      const { tokens, userId } = await oauthService.exchangeCodeForTokens(
        code as string,
        oauthState.codeVerifier,
        state as string,
        oauthState.userId
      );

      logger.info('Successfully connected user to Outline', {
        userId,
        scopes: tokens.scopes,
        hasRefreshToken: !!tokens.refreshToken
      });

      // Redirect to original URL or default success page
      const returnUrl = oauthState.originalUrl || '/?connected=outline';
      res.redirect(returnUrl);

    } catch (error: any) {
      logger.error('Failed to process Outline OAuth callback', {
        error: error.message,
        state: req.query.state
      });
      res.status(500).json({
        error: 'OAuth callback processing failed',
        message: error.message
      });
    }
  });

  /**
   * Disconnect user from Outline
   * GET /auth/disconnect
   */
  router.get('/disconnect', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const sessionUserId = req.session?.outlineUserId;
      if (!sessionUserId) {
        res.status(401).json({ error: 'No active session' });
        return;
      }

      // Revoke user tokens
      await oauthService.revokeUserTokens(sessionUserId);

      // Clear session
      delete req.session.outlineUserId;

      logger.info('Successfully disconnected user from Outline', { userId: sessionUserId });

      // Check if this is a browser request
      const acceptsHtml = req.headers.accept?.includes('text/html');
      
      if (acceptsHtml) {
        // Browser request - redirect to home
        res.redirect('/');
      } else {
        // API request - return JSON
        res.json({
          status: 'disconnected',
          message: 'Successfully disconnected from Outline'
        });
      }
    } catch (error: any) {
      logger.error('Failed to disconnect user from Outline', {
        error: error.message,
        userId: req.session?.outlineUserId
      });
      res.status(500).json({
        error: 'Failed to disconnect',
        message: error.message
      });
    }
  });

  /**
   * Get user's Outline connection status
   * GET /auth/outline/status
   */
  router.get('/status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.session?.user || req.user;
      if (!user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const userId = user.oid;
      const isAuthorized = await oauthService.isUserAuthorized(userId);

      if (isAuthorized) {
        const tokens = await oauthService.getValidAccessToken(userId);
        res.json({
          status: 'connected',
          connected: true,
          hasValidToken: !!tokens,
          userId
        });
      } else {
        res.json({
          status: 'not_connected',
          connected: false,
          userId
        });
      }
    } catch (error: any) {
      if (error instanceof OutlineNotAuthorizedException) {
        res.json({
          status: 'not_connected',
          connected: false,
          message: error.message
        });
      } else {
        logger.error('Failed to check Outline connection status', {
          error: error.message,
          userId: req.session?.user?.oid
        });
        res.status(500).json({
          error: 'Failed to check status',
          message: error.message
        });
      }
    }
  });

  return router;
}