import axios, { AxiosInstance } from 'axios';
import { logger } from './logger.js';

let _outlineClient: AxiosInstance | null = null;

function createOutlineClient() {
  if (_outlineClient) {
    return _outlineClient;
  }

  const API_URL = process.env.OUTLINE_API_URL;
  const API_KEY = process.env.OUTLINE_API_TOKEN;

  logger.debug('Outline API configuration check', {
    hasUrl: !!API_URL,
    hasToken: !!API_KEY,
    url: API_URL ? `${API_URL.substring(0, 20)}...` : 'undefined'
  });

  if (!API_URL || !API_KEY) {
    logger.warn('Outline API credentials not configured. Set OUTLINE_API_URL and OUTLINE_API_TOKEN environment variables.');
    throw new Error('Outline API credentials not configured');
  }

  logger.info('Outline API client configured successfully', {
    baseURL: API_URL
  });

  _outlineClient = axios.create({
    baseURL: API_URL,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  // Add request/response interceptors for logging
  _outlineClient.interceptors.request.use(
    (config: any) => {
      logger.debug('Outline API request', { 
        method: config.method?.toUpperCase(),
        url: config.url,
        hasData: !!config.data
      });
      return config;
    },
    (error: any) => {
      logger.error('Outline API request error', { error: error.message });
      return Promise.reject(error);
    }
  );

  _outlineClient.interceptors.response.use(
    (response: any) => {
      logger.debug('Outline API response', { 
        status: response.status,
        url: response.config.url 
      });
      return response;
    },
    (error: any) => {
      logger.error('Outline API response error', { 
        status: error.response?.status,
        url: error.config?.url,
        message: error.message 
      });
      return Promise.reject(error);
    }
  );

  return _outlineClient;
}

export const outlineClient = new Proxy({} as AxiosInstance, {
  get(target, prop) {
    const client = createOutlineClient();
    return (client as any)[prop];
  }
});