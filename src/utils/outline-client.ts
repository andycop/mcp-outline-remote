import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { apiLogger as logger } from '../lib/logger.js';

export interface OutlineApiRequestOptions extends AxiosRequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  params?: any;
  data?: any;
}

export class OutlineApiClient {
  private baseURL: string;
  private apiToken: string;
  private httpClient: AxiosInstance;

  constructor(
    baseURL: string, 
    apiToken: string
  ) {
    this.baseURL = baseURL;
    this.apiToken = apiToken;

    this.httpClient = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'MCP-Outline-Remote/3.0.0',
        'Authorization': `Bearer ${apiToken}`
      }
    });

    this.setupInterceptors();
  }

  /**
   * Make authenticated request using API token
   */
  async makeRequest(
    endpoint: string, 
    options: OutlineApiRequestOptions = {},
    userContext?: { userId?: string; email?: string }
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      const config: AxiosRequestConfig = {
        ...options,
        url: endpoint,
        headers: {
          ...options.headers
        }
      };

      // Log request details with user context if available
      logger.info('Making Outline API request', {
        endpoint,
        method: options.method || 'POST',
        hasData: !!options.data,
        hasAuth: !!this.httpClient.defaults.headers.Authorization,
        timeout: config.timeout || 30000,
        ...(userContext && { userContext })
      });

      const response = await this.httpClient.request(config);
      const duration = Date.now() - startTime;
      
      logger.info('Outline API request successful', {
        endpoint,
        method: options.method || 'GET',
        status: response.status,
        duration: `${duration}ms`,
        responseSize: JSON.stringify(response.data).length,
        ...(userContext && { userContext })
      });

      return response;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('Outline API request failed', {
        endpoint,
        method: options.method || 'GET',
        status: error.response?.status,
        message: error.message,
        duration: `${duration}ms`,
        code: error.code,
        isTimeout: error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT',
        ...(userContext && { userContext })
      });

      // Check if it's an authorization error
      if (error.response?.status === 401) {
        throw new Error(
          'Outline API authorization failed. Please check your OUTLINE_API_TOKEN configuration.'
        );
      }

      throw error;
    }
  }

  /**
   * Convenience method for GET requests
   */
  async get(endpoint: string, params?: any, userContext?: { userId?: string; email?: string }): Promise<any> {
    return this.makeRequest(endpoint, { method: 'GET', params }, userContext);
  }

  async post(endpoint: string, data?: any, userContext?: { userId?: string; email?: string }): Promise<any> {
    return this.makeRequest(endpoint, { method: 'POST', data }, userContext);
  }

  async put(endpoint: string, data?: any, userContext?: { userId?: string; email?: string }): Promise<any> {
    return this.makeRequest(endpoint, { method: 'PUT', data }, userContext);
  }

  async delete(endpoint: string, userContext?: { userId?: string; email?: string }): Promise<any> {
    return this.makeRequest(endpoint, { method: 'DELETE' }, userContext);
  }

  /**
   * Get user information from Outline for the API token user
   */
  async getApiUserInfo(): Promise<{ id: string; name: string; email: string } | null> {
    try {
      const response = await this.makeRequest('/auth.info', { method: 'POST' });
      const user = response.data?.data?.user;
      
      if (user) {
        logger.info('Successfully fetched API user info', { 
          userId: user.id,
          userName: user.name 
        });
        return {
          id: user.id,
          name: user.name,
          email: user.email
        };
      }
      return null;
    } catch (error) {
      logger.warn('Failed to fetch API user info from Outline', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
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
export function createOutlineApiClient(): OutlineApiClient {
  const API_URL = process.env.OUTLINE_API_URL;
  const API_TOKEN = process.env.OUTLINE_API_TOKEN;

  if (!API_URL) {
    throw new Error('OUTLINE_API_URL environment variable is required');
  }

  if (!API_TOKEN) {
    throw new Error('OUTLINE_API_TOKEN environment variable is required');
  }

  logger.info('Creating Outline API client', {
    baseURL: API_URL,
    hasApiToken: true
  });

  return new OutlineApiClient(API_URL, API_TOKEN);
}