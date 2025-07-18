import { Router, Request, Response } from 'express';
import { OutlineOAuthService, OutlineNotAuthorizedException } from './outline-oauth.js';
import { TokenStorage } from '../storage/tokens.js';
import { authLogger as logger } from '../lib/logger.js';

interface AuthenticatedRequest extends Request {
  session: any;
  user?: any;
}

interface OutlineOAuthState {
  codeVerifier: string;
  userId: string;
  originalUrl?: string;
}

export function createOutlineOAuthRoutes(oauthService: OutlineOAuthService, tokenStorage: TokenStorage): Router {
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
      const { tokens, userId, sessionUserId } = await oauthService.exchangeCodeForTokens(
        code as string,
        oauthState.codeVerifier,
        state as string,
        oauthState.userId
      );

      // Store session mapping from fake session ID to real Outline user ID
      await tokenStorage.setSessionUserMapping(sessionUserId, userId);

      logger.info('Successfully connected user to Outline', {
        userId,
        scopes: tokens.scopes,
        hasRefreshToken: !!tokens.refreshToken
      });

      // Check if this was part of a Claude.ai auth flow
      const claudeAuthRequest = req.session?.claudeAuthRequest;
      if (claudeAuthRequest) {
        // Complete the Claude.ai OAuth flow
        const authCode = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Store auth request in token storage using the real Outline user ID
        // This simplifies the architecture by eliminating fake user IDs
        await tokenStorage.setAuthCode(authCode, {
          clientId: claudeAuthRequest.client_id,
          redirectUri: claudeAuthRequest.redirect_uri,
          scope: claudeAuthRequest.scope,
          state: claudeAuthRequest.state,
          codeChallenge: claudeAuthRequest.code_challenge,
          codeChallengeMethod: claudeAuthRequest.code_challenge_method,
          userId: userId, // Use real Outline user ID as primary identifier
          expiresAt: Date.now() + (10 * 60 * 1000) // 10 minute expiry
        });
        
        // Redirect back to Claude.ai
        const callbackUrl = `${claudeAuthRequest.redirect_uri}?code=${authCode}&state=${claudeAuthRequest.state}`;
        logger.info('Outline OAuth completed, redirecting to Claude.ai', { 
          sessionUserId: oauthState.userId,
          outlineUserId: userId, 
          state: claudeAuthRequest.state,
          authCode: authCode.substring(0, 10) + '...'
        });
        
        // Clean up session
        delete req.session.claudeAuthRequest;
        
        res.redirect(callbackUrl);
        return;
      }

      // Regular web interface flow
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
   * Get user's Outline connection status (public endpoint)
   * GET /auth/outline/status
   */
  router.get('/status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const sessionUserId = req.session?.outlineUserId;
      
      if (!sessionUserId) {
        res.json({
          status: 'no_session',
          connected: false,
          message: 'No active session found. Start by connecting to Outline.',
          connect_url: '/auth/outline/connect'
        });
        return;
      }

      const isAuthorized = await oauthService.isUserAuthorized(sessionUserId);

      if (isAuthorized) {
        try {
          const tokens = await oauthService.getValidAccessToken(sessionUserId);
          res.json({
            status: 'connected',
            connected: true,
            hasValidToken: !!tokens,
            sessionUserId,
            message: 'Successfully connected to Outline'
          });
        } catch (error: any) {
          res.json({
            status: 'token_expired',
            connected: false,
            sessionUserId,
            message: 'Connection expired. Please reconnect.',
            connect_url: '/auth/outline/connect'
          });
        }
      } else {
        res.json({
          status: 'not_connected',
          connected: false,
          sessionUserId,
          message: 'Not connected to Outline. Please authorize access.',
          connect_url: '/auth/outline/connect'
        });
      }
    } catch (error: any) {
      logger.error('Failed to check Outline connection status', {
        error: error.message,
        sessionUserId: req.session?.outlineUserId
      });
      res.status(500).json({
        error: 'Failed to check status',
        message: error.message
      });
    }
  });

  return router;
}