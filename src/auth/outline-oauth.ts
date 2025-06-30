import { randomBytes, createHash } from 'crypto';
import axios, { AxiosInstance } from 'axios';
import { TokenStorage, OutlineTokenData } from '../storage/tokens.js';
import { logger } from '../utils/logger.js';

export interface OutlineOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authUrl?: string;
  tokenUrl?: string;
  baseUrl: string;
}

export class OutlineNotAuthorizedException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutlineNotAuthorizedException';
  }
}

export class OutlineOAuthService {
  private config: OutlineOAuthConfig;
  private tokenStorage: TokenStorage;
  private httpClient: AxiosInstance;

  constructor(config: OutlineOAuthConfig, tokenStorage: TokenStorage) {
    this.config = config;
    this.tokenStorage = tokenStorage;
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'MCP-Outline-Remote/2.0.0'
      }
    });

    // Set default OAuth endpoints if not provided
    if (!this.config.authUrl) {
      this.config.authUrl = `${this.config.baseUrl}/oauth/authorize`;
    }
    if (!this.config.tokenUrl) {
      this.config.tokenUrl = `${this.config.baseUrl}/oauth/token`;
    }
  }

  /**
   * Generate authorization URL for user redirect with PKCE
   */
  generateAuthUrl(userId: string, state?: string): { url: string, codeVerifier: string, state: string } {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const finalState = state || this.generateState();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: 'read write',
      state: finalState,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    const url = `${this.config.authUrl}?${params.toString()}`;

    logger.info('Generated Outline OAuth authorization URL', {
      userId,
      state: finalState,
      hasCodeChallenge: !!codeChallenge
    });

    return {
      url,
      codeVerifier,
      state: finalState
    };
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string, 
    codeVerifier: string, 
    state: string,
    microsoftUserId: string
  ): Promise<{ tokens: OutlineTokenData; userId: string }> {
    try {
      logger.info('Exchanging authorization code for Outline tokens', {
        hasCode: !!code,
        hasCodeVerifier: !!codeVerifier,
        state,
        tokenUrl: this.config.tokenUrl
      });

      // Prepare form data as URLSearchParams for proper encoding
      const formData = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: this.config.redirectUri,
        code_verifier: codeVerifier
      });

      const response = await this.httpClient.post(this.config.tokenUrl!, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const tokenData = response.data;

      if (!tokenData.access_token) {
        throw new Error('No access token received from Outline');
      }

      // Get user info to extract userId
      const userResponse = await this.httpClient.post(`${this.config.baseUrl}/api/auth.info`, {}, {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`
        }
      });

      const userId = userResponse.data.data.user.id;

      const tokens: OutlineTokenData = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || '',
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        scopes: Array.isArray(tokenData.scope) ? tokenData.scope : (tokenData.scope || '').split(' '),
        authorizedAt: Date.now()
      };

      // Store tokens using the Microsoft user ID (passed in), not the Outline user ID
      await this.tokenStorage.setOutlineTokens(microsoftUserId, tokens);

      logger.info('Successfully exchanged code for Outline tokens', {
        userId,
        hasRefreshToken: !!tokens.refreshToken,
        expiresIn: tokenData.expires_in,
        scopes: tokens.scopes
      });

      return { tokens, userId };
    } catch (error: any) {
      logger.error('Failed to exchange authorization code for tokens', {
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        method: error.config?.method,
        data: error.response?.data
      });
      throw new Error(`Token exchange failed: ${error.message}`);
    }
  }

  /**
   * Refresh expired access tokens
   */
  async refreshAccessToken(userId: string): Promise<OutlineTokenData> {
    const currentTokens = await this.tokenStorage.getOutlineTokens(userId);
    
    if (!currentTokens) {
      throw new OutlineNotAuthorizedException('User not connected to Outline');
    }

    if (!currentTokens.refreshToken) {
      throw new OutlineNotAuthorizedException('No refresh token available');
    }

    try {
      logger.info('Refreshing Outline access token', { userId });

      // Prepare form data as URLSearchParams for proper encoding
      const formData = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: currentTokens.refreshToken
      });

      const response = await this.httpClient.post(this.config.tokenUrl!, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const tokenData = response.data;

      const newTokens: OutlineTokenData = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || currentTokens.refreshToken,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        scopes: Array.isArray(tokenData.scope) ? tokenData.scope : (tokenData.scope || '').split(' '),
        authorizedAt: currentTokens.authorizedAt
      };

      await this.tokenStorage.setOutlineTokens(userId, newTokens);

      logger.info('Successfully refreshed Outline access token', {
        userId,
        newExpiresIn: tokenData.expires_in
      });

      return newTokens;
    } catch (error: any) {
      logger.error('Failed to refresh Outline access token', {
        userId,
        error: error.message,
        status: error.response?.status
      });

      // If refresh fails, remove the invalid tokens
      await this.tokenStorage.deleteOutlineTokens(userId);
      throw new OutlineNotAuthorizedException('Token refresh failed - please reconnect');
    }
  }

  /**
   * Revoke user's OAuth tokens
   */
  async revokeUserTokens(userId: string): Promise<void> {
    const tokens = await this.tokenStorage.getOutlineTokens(userId);
    
    if (!tokens) {
      logger.info('No tokens to revoke for user', { userId });
      return;
    }

    try {
      // Try to revoke the token with Outline
      if (this.config.tokenUrl) {
        // Prepare form data as URLSearchParams for proper encoding
        const formData = new URLSearchParams({
          token: tokens.accessToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret
        });

        await this.httpClient.post(`${this.config.baseUrl}/oauth/revoke`, formData.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
      }
    } catch (error: any) {
      logger.warn('Failed to revoke token with Outline, removing locally', {
        userId,
        error: error.message
      });
    }

    // Always remove tokens from storage
    await this.tokenStorage.deleteOutlineTokens(userId);
    
    logger.info('Successfully revoked user tokens', { userId });
  }

  /**
   * Get valid access token for user, refreshing if necessary
   */
  async getValidAccessToken(userId: string): Promise<string> {
    let tokens = await this.tokenStorage.getOutlineTokens(userId);
    
    if (!tokens) {
      throw new OutlineNotAuthorizedException('User not connected to Outline');
    }

    // Check if token is expired (with 5 minute buffer)
    const expirationBuffer = 5 * 60 * 1000; // 5 minutes
    if (tokens.expiresAt - expirationBuffer < Date.now()) {
      logger.info('Access token expired, refreshing', { userId });
      tokens = await this.refreshAccessToken(userId);
    }

    return tokens.accessToken;
  }

  /**
   * Check if user is authorized for Outline
   */
  async isUserAuthorized(userId: string): Promise<boolean> {
    try {
      const tokens = await this.tokenStorage.getOutlineTokens(userId);
      return tokens !== null;
    } catch (error) {
      return false;
    }
  }

  // Private helper methods

  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  private generateCodeChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url');
  }

  private generateState(): string {
    return randomBytes(16).toString('base64url');
  }
}