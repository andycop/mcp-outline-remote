import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getMsalInstance, getRedirectUri, SCOPES } from './azureConfig.js';
import { createTokenStorage } from '../storage/tokens.js';
import { authLogger as logger } from '../lib/logger.js';

declare module 'express-session' {
  interface SessionData {
    userEmail?: string;
    userId?: string;
    authenticated?: boolean;
    oauthState?: string;
    pkceChallenge?: string;
    pkceChallengeMethod?: string;
    redirectUri?: string;
    clientId?: string;
    msalVerifier?: string;
  }
}

const router = Router();

// Wrapper for async route handlers
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * OAuth discovery endpoint - authorization server metadata
 */
router.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
  const baseUrl = process.env.OAUTH_ISSUER || `https://${req.hostname}`;
  
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    introspection_endpoint: `${baseUrl}/introspect`,
    registration_endpoint: `${baseUrl}/register`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'email', 'profile'],
    token_endpoint_auth_methods_supported: ['none'],
    introspection_endpoint_auth_methods_supported: ['none'],
    claims_supported: ['sub', 'email', 'name', 'preferred_username'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    require_pkce: true
  });
});

/**
 * OAuth protected resource metadata
 */
router.get('/.well-known/oauth-protected-resource', (req: Request, res: Response) => {
  const baseUrl = process.env.OAUTH_ISSUER || `https://${req.hostname}`;
  
  res.json({
    resource: baseUrl,
    oauth_authorization_server: `${baseUrl}/.well-known/oauth-authorization-server`,
    bearer_methods_supported: ['header'],
    resource_documentation: `${baseUrl}/docs`,
    authentication_schemes_supported: [{
      scheme: 'Bearer',
      descriptions: {
        en: 'OAuth 2.0 Bearer Token'
      }
    }]
  });
});

/**
 * Authorization endpoint - starts OAuth flow with Azure AD
 */
router.get('/authorize', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { 
      client_id,
      redirect_uri,
      response_type = 'code',
      scope = 'openid email profile',
      state,
      code_challenge,
      code_challenge_method = 'S256'
    } = req.query;

    // Validate required parameters
    if (!redirect_uri || !code_challenge) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters'
      });
    }

    // Validate redirect_uri
    const allowedRedirectUris = (process.env.ALLOWED_REDIRECT_URIS || 'https://claude.ai/api/mcp/auth_callback').split(',');
    if (!allowedRedirectUris.includes(redirect_uri as string)) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Invalid redirect_uri'
      });
    }

    // Store Claude's PKCE parameters in session
    req.session.oauthState = state as string;
    req.session.pkceChallenge = code_challenge as string;
    req.session.pkceChallengeMethod = code_challenge_method as string;
    req.session.redirectUri = redirect_uri as string;
    req.session.clientId = client_id as string || 'Claude';

    // Create PKCE verifier for Azure AD
    const msalVerifier = crypto.randomBytes(32).toString('base64url');
    const msalChallenge = crypto.createHash('sha256').update(msalVerifier).digest('base64url');
    req.session.msalVerifier = msalVerifier;

    // Save session before redirect
    req.session.save((err) => {
      if (err) {
        logger.error('Failed to save session:', err);
        return res.status(500).json({
          error: 'server_error',
          error_description: 'Failed to save session'
        });
      }

      // Get authorization URL from MSAL
      const msalInstance = getMsalInstance();
      const msalRedirectUri = getRedirectUri(req);
      
      logger.debug('MSAL redirect URI', {
        redirectUri: msalRedirectUri,
        envRedirectUri: process.env.AZURE_REDIRECT_URI,
        host: req.headers.host
      });
      
      const authUrl = msalInstance.getAuthCodeUrl({
        scopes: SCOPES,
        redirectUri: msalRedirectUri,
        codeChallenge: msalChallenge,
        codeChallengeMethod: 'S256',
        state: crypto.randomBytes(16).toString('hex'),
        prompt: 'select_account'
      });

      logger.info('Redirecting to Azure AD for authorization', {
        clientId: client_id,
        claudeRedirectUri: redirect_uri,
        msalRedirectUri: msalRedirectUri
      });

      // Redirect to Azure AD
      authUrl.then(url => {
        res.redirect(url);
      }).catch(error => {
        logger.error('Failed to get auth URL:', error);
        res.status(500).json({
          error: 'server_error',
          error_description: 'Failed to initiate authorization'
        });
      });
    });
  } catch (error) {
    logger.error('Error in authorization endpoint:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to initiate authorization'
    });
  }
}));

/**
 * OAuth callback endpoint - handles Azure AD response
 */
router.get('/auth/callback', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { code, state, error, error_description } = req.query;
    const tokenStorage = await createTokenStorage();

    if (error) {
      logger.error('OAuth callback error:', { error, error_description });
      // Redirect back to Claude with error
      const redirectUri = req.session.redirectUri || 'https://claude.ai/api/mcp/auth_callback';
      const errorUrl = new URL(redirectUri);
      errorUrl.searchParams.set('error', error as string);
      errorUrl.searchParams.set('error_description', error_description as string || '');
      if (req.session.oauthState) {
        errorUrl.searchParams.set('state', req.session.oauthState);
      }
      return res.redirect(errorUrl.toString());
    }

    if (!code) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing authorization code'
      });
    }

    // Exchange Azure AD code for tokens
    const msalInstance = getMsalInstance();
    const tokenResponse = await msalInstance.acquireTokenByCode({
      code: code as string,
      scopes: SCOPES,
      redirectUri: getRedirectUri(req),
      codeVerifier: req.session.msalVerifier!,
    });

    if (!tokenResponse || !tokenResponse.account) {
      throw new Error('Failed to get tokens from Azure AD');
    }

    // Store user info in session
    req.session.userEmail = tokenResponse.account.username;
    req.session.userId = tokenResponse.account.homeAccountId;
    req.session.authenticated = true;

    // Generate our own authorization code for Claude
    const authCode = crypto.randomBytes(32).toString('base64url');
    
    logger.debug('About to store authorization code', {
      authCode: authCode.substring(0, 10) + '...',
      clientId: req.session.clientId || 'Claude',
      userEmail: tokenResponse.account.username
    });
    
    // Store authorization code with Claude's PKCE challenge
    await tokenStorage.setAuthCode(authCode, {
      code: authCode,
      clientId: req.session.clientId || 'Claude',
      userId: tokenResponse.account.homeAccountId,
      userEmail: tokenResponse.account.username,
      redirectUri: req.session.redirectUri!,
      codeChallenge: req.session.pkceChallenge,
      codeChallengeMethod: req.session.pkceChallengeMethod,
      expiresAt: Date.now() + 600000, // 10 minutes
      scope: 'openid email profile',
      state: req.session.oauthState
    });

    // Redirect back to Claude with our authorization code
    const redirectUrl = new URL(req.session.redirectUri!);
    redirectUrl.searchParams.set('code', authCode);
    if (req.session.oauthState) {
      redirectUrl.searchParams.set('state', req.session.oauthState);
    }

    logger.info('Redirecting back to Claude with authorization code', {
      userEmail: tokenResponse.account.username,
      redirectUri: req.session.redirectUri
    });

    res.redirect(redirectUrl.toString());
  } catch (error) {
    logger.error('Error in callback endpoint:', error);
    
    // Redirect back to Claude with error
    const redirectUri = req.session.redirectUri || 'https://claude.ai/api/mcp/auth_callback';
    const errorUrl = new URL(redirectUri);
    errorUrl.searchParams.set('error', 'server_error');
    errorUrl.searchParams.set('error_description', 'Authentication failed');
    if (req.session.oauthState) {
      errorUrl.searchParams.set('state', req.session.oauthState);
    }
    res.redirect(errorUrl.toString());
  }
}));

/**
 * Token endpoint - exchanges authorization code for access token or refreshes token
 */
router.post('/token', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { grant_type, code, redirect_uri, code_verifier, client_id, refresh_token } = req.body;
    const tokenStorage = await createTokenStorage();
    
    logger.info('Token endpoint called', {
      grant_type,
      has_code: !!code,
      has_refresh_token: !!refresh_token,
      redirect_uri
    });

    if (grant_type === 'refresh_token') {
      // Handle refresh token grant
      if (!refresh_token) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing refresh_token'
        });
      }

      // Verify refresh token
      const refreshTokenInfo = await tokenStorage.getRefreshToken(refresh_token);
      if (!refreshTokenInfo) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid or expired refresh token'
        });
      }

      // Check if refresh token is expired
      if (refreshTokenInfo.expiresAt < Date.now()) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Refresh token has expired'
        });
      }

      // Generate new access token
      const newAccessToken = crypto.randomBytes(32).toString('base64url');
      const expiresIn = 3600; // 1 hour
      
      await tokenStorage.setAccessToken(newAccessToken, {
        token: newAccessToken,
        userId: refreshTokenInfo.userId,
        userEmail: refreshTokenInfo.userEmail,
        clientId: refreshTokenInfo.clientId,
        scope: refreshTokenInfo.scope,
        expiresAt: Date.now() + (expiresIn * 1000)
      });

      // Return new token
      res.json({
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
        refresh_token: refresh_token, // Return same refresh token
        scope: refreshTokenInfo.scope
      });

      logger.info('Token refreshed successfully', {
        userEmail: refreshTokenInfo.userEmail,
        tokenPrefix: newAccessToken.substring(0, 10) + '...'
      });
      return;
    }

    if (grant_type !== 'authorization_code') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code and refresh_token grant types are supported'
      });
    }

    if (!code || !redirect_uri || !code_verifier) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters'
      });
    }

    // Retrieve and validate authorization code
    const authData = await tokenStorage.getAuthCode(code);
    if (!authData) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid or expired authorization code'
      });
    }

    // Validate redirect_uri matches
    if (authData.redirectUri !== redirect_uri) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Redirect URI mismatch'
      });
    }

    // Validate PKCE
    const challenge = crypto.createHash('sha256').update(code_verifier).digest('base64url');
    if (challenge !== authData.codeChallenge) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'PKCE verification failed'
      });
    }

    // Generate access token and refresh token
    const accessToken = crypto.randomBytes(32).toString('base64url');
    const refreshToken = crypto.randomBytes(32).toString('base64url');
    
    // Store access token info
    const expiresIn = 3600; // 1 hour
    await tokenStorage.setAccessToken(accessToken, {
      token: accessToken,
      userId: authData.userId,
      userEmail: authData.userEmail,
      clientId: client_id || authData.clientId,
      scope: authData.scope,
      expiresAt: Date.now() + (expiresIn * 1000)
    });

    // Store refresh token (longer expiration - 30 days)
    await tokenStorage.setRefreshToken(refreshToken, {
      token: refreshToken,
      userId: authData.userId,
      userEmail: authData.userEmail,
      clientId: client_id || authData.clientId,
      scope: authData.scope,
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000)
    });

    // Clean up auth code (one-time use)
    await tokenStorage.deleteAuthCode(code);

    // Return token response with refresh token
    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: authData.scope
    });

    logger.info('Tokens issued successfully', {
      userEmail: authData.userEmail,
      clientId: client_id || authData.clientId,
      accessTokenPrefix: accessToken.substring(0, 10) + '...',
      refreshTokenPrefix: refreshToken.substring(0, 10) + '...'
    });
  } catch (error) {
    logger.error('Error in token endpoint:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Token generation failed'
    });
  }
}));

/**
 * Token introspection endpoint
 */
router.post('/introspect', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    const tokenStorage = await createTokenStorage();

    if (!token) {
      return res.json({ active: false });
    }

    const tokenInfo = await tokenStorage.getAccessToken(token);
    
    if (!tokenInfo || tokenInfo.expiresAt < Date.now()) {
      return res.json({ active: false });
    }

    res.json({
      active: true,
      scope: tokenInfo.scope,
      client_id: tokenInfo.clientId,
      username: tokenInfo.userEmail,
      exp: Math.floor(tokenInfo.expiresAt / 1000)
    });
  } catch (error) {
    logger.error('Error in introspection endpoint:', error);
    res.json({ active: false });
  }
}));

/**
 * Dynamic client registration endpoint
 */
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { client_name, redirect_uris } = req.body;

    // Generate client ID
    const clientId = crypto.randomBytes(16).toString('hex');

    // For Claude.ai, we auto-approve without storing
    logger.info('Client registered', {
      clientId,
      clientName: client_name,
      redirectUris: redirect_uris
    });

    res.status(201).json({
      client_id: clientId,
      client_name: client_name,
      redirect_uris: redirect_uris,
      token_endpoint_auth_method: 'none'
    });
  } catch (error) {
    logger.error('Error in registration endpoint:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Client registration failed'
    });
  }
}));

export default router;