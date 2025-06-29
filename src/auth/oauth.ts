import { Router } from 'express';
import { randomUUID } from 'crypto';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { TokenStorage } from '../storage/tokens.js';
import { logger, anonymizeKey } from '../utils/logger.js';

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  tenant: string;
  redirectUri: string;
}

export class OAuthServer {
  private msal: ConfidentialClientApplication;
  private storage: TokenStorage;

  constructor(config: OAuthConfig, storage: TokenStorage) {
    const msalConfig = {
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenant}`
      }
    };
    this.msal = new ConfidentialClientApplication(msalConfig);
    this.storage = storage;
  }

  getRouter(): Router {
    const router = Router();

    // OAuth Authorization endpoint
    router.get('/authorize', async (req, res) => {
      logger.info('OAuth authorize request received', {
        client_id: req.query.client_id,
        response_type: req.query.response_type,
        redirect_uri: req.query.redirect_uri,
        scope: req.query.scope,
        state: req.query.state ? anonymizeKey(req.query.state as string) : undefined
      });
      
      const { 
        response_type, 
        client_id, 
        redirect_uri, 
        scope, 
        code_challenge, 
        code_challenge_method, 
        state 
      } = req.query as Record<string, string>;

      // Validate required parameters
      if (response_type !== 'code') {
        res.status(400).json({ error: 'unsupported_response_type' });
        return;
      }
      if (!client_id || !redirect_uri) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      // Store OAuth request in session
      (req.session as any).oauthRequest = {
        clientId: client_id,
        redirectUri: redirect_uri,
        scope: scope || '',
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
        state: state
      };

      // Check if user is already authenticated
      if ((req.session as any).user) {
        this.completeAuthorization(req, res);
        return;
      }

      // Redirect to MS365 for authentication
      try {
        const authUrl = await this.msal.getAuthCodeUrl({
          scopes: ['openid', 'profile', 'email'],
          redirectUri: process.env.REDIRECT_URI!
        });
        res.redirect(authUrl);
      } catch (error) {
        logger.error('Error generating auth URL', error);
        res.status(500).json({ error: 'server_error' });
      }
    });

    // Token endpoint
    router.post('/token', async (req, res) => {
      logger.info('Token request received', {
        grant_type: req.body.grant_type,
        client_id: req.body.client_id,
        redirect_uri: req.body.redirect_uri,
        code: req.body.code ? anonymizeKey(req.body.code) : undefined,
        code_verifier: req.body.code_verifier ? anonymizeKey(req.body.code_verifier) : undefined,
        refresh_token: req.body.refresh_token ? anonymizeKey(req.body.refresh_token) : undefined
      });
      
      if (!req.body || Object.keys(req.body).length === 0) {
        res.status(400).json({ error: 'invalid_request', error_description: 'Request body is required' });
        return;
      }

      const { grant_type, code, client_id, code_verifier, redirect_uri, refresh_token } = req.body;

      if (grant_type === 'authorization_code') {
        await this.handleAuthorizationCodeGrant(req, res, { code, client_id, code_verifier, redirect_uri });
      } else if (grant_type === 'refresh_token') {
        await this.handleRefreshTokenGrant(req, res, { refresh_token, client_id });
      } else {
        res.status(400).json({ error: 'unsupported_grant_type' });
        return;
      }

    });

    // OAuth Discovery/Metadata endpoint
    router.get('/.well-known/oauth-authorization-server', (req, res) => {
      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const baseUrl = `${protocol === 'http' && req.get('host')?.includes('test-mcp.netdaisy.com') ? 'https' : protocol}://${req.get('host')}`;
      res.json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: ['claudeai', 'mcp'],
        token_endpoint_auth_methods_supported: ['none']
      });
    });

    // Login endpoint
    router.get('/login', async (req, res) => {
      try {
        const authUrl = await this.msal.getAuthCodeUrl({
          scopes: ['openid', 'profile', 'email'],
          redirectUri: process.env.REDIRECT_URI!
        });
        res.redirect(authUrl);
      } catch (error) {
        logger.error('Error generating auth URL for login', error);
        res.status(500).send('Error initiating authentication');
      }
    });

    // Auth callback
    router.get('/auth/callback', async (req, res) => {
      try {
        const tokenResponse = await this.msal.acquireTokenByCode({
          code: req.query.code as string,
          scopes: ['openid', 'profile', 'email'],
          redirectUri: process.env.REDIRECT_URI!
        });

        const user = {
          oid: tokenResponse.account?.homeAccountId,
          name: (tokenResponse.idTokenClaims as any)?.name,
          email: (tokenResponse.idTokenClaims as any)?.preferred_username
        };

        (req.session as any).user = user;
        
        logger.info('User authenticated via MS365', {
          userId: anonymizeKey(user.oid),
          name: user.name,
          email: user.email
        });

        // Check if this was part of an OAuth flow
        if ((req.session as any).oauthRequest) {
          this.completeAuthorization(req, res);
          return;
        }

        res.redirect('/');
      } catch (error) {
        logger.error('Error in auth callback', error);
        res.status(500).send('Authentication failed');
      }
    });

    // Logout endpoint
    router.get('/logout', (req, res) => {
      const user = (req.session as any)?.user;
      req.session.destroy((err) => {
        if (err) {
          logger.error('Error destroying session', err);
        } else if (user) {
          logger.info('User logged out', {
            userId: anonymizeKey(user.oid),
            name: user.name
          });
        }
        res.redirect('/');
      });
    });

    return router;
  }

  private completeAuthorization(req: any, res: any) {
    const oauthRequest = req.session.oauthRequest;
    const user = req.session.user;

    if (!oauthRequest || !user) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }

    // Generate authorization code
    const authCode = randomUUID();
    const codeData = {
      clientId: oauthRequest.clientId,
      redirectUri: oauthRequest.redirectUri,
      scope: oauthRequest.scope,
      codeChallenge: oauthRequest.codeChallenge,
      codeChallengeMethod: oauthRequest.codeChallengeMethod,
      state: oauthRequest.state,
      userId: user.oid,
      expiresAt: Date.now() + 600000 // 10 minutes
    };

    this.storage.setAuthCode(authCode, codeData);

    logger.info('Authorization code generated', {
      clientId: oauthRequest.clientId,
      userId: anonymizeKey(user.oid),
      scope: oauthRequest.scope,
      code: anonymizeKey(authCode)
    });

    // Clear OAuth request from session
    delete req.session.oauthRequest;

    // Redirect back to client
    const redirectUrl = new URL(oauthRequest.redirectUri);
    redirectUrl.searchParams.set('code', authCode);
    if (oauthRequest.state) {
      redirectUrl.searchParams.set('state', oauthRequest.state);
    }

    res.redirect(redirectUrl.toString());
  }

  private async handleAuthorizationCodeGrant(req: any, res: any, params: {
    code: string;
    client_id: string;
    code_verifier?: string;
    redirect_uri: string;
  }): Promise<void> {
    const { code, client_id, code_verifier, redirect_uri } = params;

    const codeData = await this.storage.getAuthCode(code);
    if (!codeData) {
      res.status(400).json({ error: 'invalid_grant' });
      return;
    }

    if (codeData.clientId !== client_id || codeData.redirectUri !== redirect_uri) {
      res.status(400).json({ error: 'invalid_client' });
      return;
    }

    // Verify PKCE if present
    if (codeData.codeChallenge && codeData.codeChallengeMethod === 'S256') {
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256').update(code_verifier || '').digest('base64url');
      if (hash !== codeData.codeChallenge) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
    }

    // Generate access and refresh tokens
    const accessToken = randomUUID();
    const refreshToken = randomUUID();
    
    const accessTokenData = {
      token: accessToken,
      clientId: client_id,
      userId: codeData.userId,
      scope: codeData.scope,
      expiresAt: Date.now() + 3600000 // 1 hour
    };

    const refreshTokenData = {
      token: refreshToken,
      clientId: client_id,
      userId: codeData.userId,
      scope: codeData.scope,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    };

    await this.storage.setAccessToken(accessToken, accessTokenData);
    await this.storage.setRefreshToken(refreshToken, refreshTokenData);
    await this.storage.deleteAuthCode(code);

    logger.info('Access and refresh tokens issued', {
      client_id: client_id,
      userId: anonymizeKey(codeData.userId),
      scope: codeData.scope,
      access_expires_in: 3600,
      refresh_expires_in: 7 * 24 * 60 * 60
    });

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: codeData.scope
    });
  }

  private async handleRefreshTokenGrant(req: any, res: any, params: {
    refresh_token: string;
    client_id: string;
  }): Promise<void> {
    const { refresh_token, client_id } = params;

    const refreshData = await this.storage.getRefreshToken(refresh_token);
    if (!refreshData) {
      res.status(400).json({ error: 'invalid_grant' });
      return;
    }

    if (refreshData.clientId !== client_id) {
      res.status(400).json({ error: 'invalid_client' });
      return;
    }

    // Generate new access token (and optionally rotate refresh token)
    const newAccessToken = randomUUID();
    const newRefreshToken = randomUUID();

    const accessTokenData = {
      token: newAccessToken,
      clientId: client_id,
      userId: refreshData.userId,
      scope: refreshData.scope,
      expiresAt: Date.now() + 3600000 // 1 hour
    };

    const newRefreshTokenData = {
      token: newRefreshToken,
      clientId: client_id,
      userId: refreshData.userId,
      scope: refreshData.scope,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    };

    await this.storage.setAccessToken(newAccessToken, accessTokenData);
    await this.storage.setRefreshToken(newRefreshToken, newRefreshTokenData);
    
    // Rotate the refresh token (delete old one)
    await this.storage.deleteRefreshToken(refresh_token);

    logger.info('Token refreshed', {
      client_id: client_id,
      userId: anonymizeKey(refreshData.userId),
      scope: refreshData.scope,
      access_expires_in: 3600,
      refresh_expires_in: 7 * 24 * 60 * 60
    });

    res.json({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: refreshData.scope
    });
  }
}