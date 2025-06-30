import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { TokenStorage } from '../storage/tokens.js';
import { OutlineOAuthService, OutlineNotAuthorizedException } from '../auth/outline-oauth.js';
import { logger } from './logger.js';

export interface OutlineApiRequestOptions extends AxiosRequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  params?: any;
  data?: any;
}

export class OutlineApiClient {
  private baseURL: string;
  private legacyToken?: string;
  private tokenStorage: TokenStorage;
  private oauthService?: OutlineOAuthService;
  private httpClient: AxiosInstance;

  constructor(
    baseURL: string, 
    tokenStorage: TokenStorage,
    legacyToken?: string,
    oauthService?: OutlineOAuthService
  ) {
    this.baseURL = baseURL;
    this.legacyToken = legacyToken;
    this.tokenStorage = tokenStorage;
    this.oauthService = oauthService;

    this.httpClient = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'MCP-Outline-Remote/2.0.0'
      }
    });

    this.setupInterceptors();
  }

  /**
   * Make authenticated request using user's OAuth token
   */
  async makeRequest(
    userId: string, 
    endpoint: string, 
    options: OutlineApiRequestOptions = {}
  ): Promise<any> {
    try {
      // Try to get user's OAuth token first
      let accessToken: string | null = null;
      
      if (this.oauthService) {
        try {
          accessToken = await this.oauthService.getValidAccessToken(userId);
          logger.debug('Using OAuth token for request', { userId, endpoint });
        } catch (error) {
          if (error instanceof OutlineNotAuthorizedException) {
            logger.info('User not authorized for Outline, using fallback', { userId });
            throw error; // Propagate this specific error
          }
          logger.warn('Failed to get OAuth token, trying fallback', { 
            userId, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }

      // Fallback to legacy token if OAuth not available
      if (!accessToken && this.legacyToken) {
        accessToken = this.legacyToken;
        logger.debug('Using legacy API token for request', { userId, endpoint });
      }

      if (!accessToken) {
        throw new OutlineNotAuthorizedException(
          'No authentication method available. Please connect your Outline account or configure OUTLINE_API_TOKEN.'
        );
      }

      const config: AxiosRequestConfig = {
        ...options,
        url: endpoint,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${accessToken}`
        }
      };

      const response = await this.httpClient.request(config);
      
      logger.debug('Outline API request successful', {
        userId,
        endpoint,
        method: options.method || 'GET',
        status: response.status
      });

      return response;
    } catch (error: any) {
      if (error instanceof OutlineNotAuthorizedException) {
        throw error; // Re-throw authorization errors
      }

      logger.error('Outline API request failed', {
        userId,
        endpoint,
        method: options.method || 'GET',
        status: error.response?.status,
        message: error.message
      });

      // Check if it's an authorization error
      if (error.response?.status === 401) {
        throw new OutlineNotAuthorizedException(
          'Authorization failed. Please reconnect your Outline account.'
        );
      }

      throw error;
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async get(endpoint: string, params?: any): Promise<any> {
    const userId = 'legacy'; // Special userId for legacy requests
    return this.makeRequest(userId, endpoint, { method: 'GET', params });
  }

  async post(endpoint: string, data?: any): Promise<any> {
    const userId = 'legacy';
    return this.makeRequest(userId, endpoint, { method: 'POST', data });
  }

  async put(endpoint: string, data?: any): Promise<any> {
    const userId = 'legacy';
    return this.makeRequest(userId, endpoint, { method: 'PUT', data });
  }

  async delete(endpoint: string): Promise<any> {
    const userId = 'legacy';
    return this.makeRequest(userId, endpoint, { method: 'DELETE' });
  }

  /**
   * Get user information from Outline
   */
  async getUserInfo(userId: string): Promise<{ id: string; name: string; email: string } | null> {
    try {
      const response = await this.makeRequest(userId, '/auth.info', { method: 'POST' });
      const user = response.data?.data?.user;
      
      if (user) {
        return {
          id: user.id,
          name: user.name,
          email: user.email
        };
      }
      return null;
    } catch (error) {
      logger.warn('Failed to fetch user info from Outline', { userId, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Check if user has valid Outline authentication
   */
  async isUserAuthenticated(userId: string): Promise<boolean> {
    if (this.oauthService) {
      return await this.oauthService.isUserAuthorized(userId);
    }
    return !!this.legacyToken; // Legacy token means anyone can use it
  }

  private setupInterceptors(): void {
    this.httpClient.interceptors.request.use(
      (config) => {
        return config;
      },
      (error) => {
        logger.error('Outline API request setup error', { error: error.message });
        return Promise.reject(error);
      }
    );

    this.httpClient.interceptors.response.use(
      (response) => {
        logger.debug('Outline API response', {
          status: response.status,
          url: response.config.url,
          hasData: !!response.data
        });
        return response;
      },
      (error) => {
        const status = error.response?.status;
        const url = error.config?.url;
        
        logger.error('Outline API response error', {
          status,
          url,
          message: error.message,
          data: error.response?.data
        });

        return Promise.reject(error);
      }
    );
  }
}

// Factory function to create the outline client
export function createOutlineApiClient(
  tokenStorage: TokenStorage,
  oauthService?: OutlineOAuthService
): OutlineApiClient {
  const API_URL = process.env.OUTLINE_API_URL;
  const API_TOKEN = process.env.OUTLINE_API_TOKEN;

  if (!API_URL) {
    throw new Error('OUTLINE_API_URL environment variable is required');
  }

  logger.info('Creating Outline API client', {
    baseURL: API_URL,
    hasLegacyToken: !!API_TOKEN,
    hasOAuthService: !!oauthService
  });

  return new OutlineApiClient(API_URL, tokenStorage, API_TOKEN, oauthService);
}