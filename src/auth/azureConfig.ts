import { ConfidentialClientApplication, Configuration, LogLevel } from '@azure/msal-node';
import { authLogger as logger } from '../lib/logger.js';

// Create MSAL configuration lazily to ensure env vars are loaded
function createMsalConfig(): Configuration {
  return {
    auth: {
      clientId: process.env.AZURE_CLIENT_ID!,
      authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
    },
    system: {
      loggerOptions: {
        loggerCallback(loglevel: LogLevel, message: string, containsPii: boolean) {
          if (!containsPii) {
            switch (loglevel) {
              case LogLevel.Error:
                logger.error('MSAL: ' + message);
                break;
              case LogLevel.Warning:
                logger.warn('MSAL: ' + message);
                break;
              case LogLevel.Info:
                logger.info('MSAL: ' + message);
                break;
              case LogLevel.Verbose:
                logger.debug('MSAL: ' + message);
                break;
            }
          }
        },
        piiLoggingEnabled: false,
        logLevel: LogLevel.Info,
      }
    }
  };
}

// Scopes to request from Azure AD
export const SCOPES = ['openid', 'profile', 'email', 'User.Read'];

// Create MSAL instance
let msalInstance: ConfidentialClientApplication | null = null;

export function getMsalInstance(): ConfidentialClientApplication {
  if (!msalInstance) {
    if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET || !process.env.AZURE_TENANT_ID) {
      throw new Error('Azure AD configuration missing. Please set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, and AZURE_TENANT_ID');
    }
    msalInstance = new ConfidentialClientApplication(createMsalConfig());
  }
  return msalInstance;
}

// Get the redirect URI from environment or construct it
export function getRedirectUri(req?: any): string {
  if (process.env.AZURE_REDIRECT_URI) {
    return process.env.AZURE_REDIRECT_URI;
  }
  
  if (req) {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = req.headers.host || 'localhost:3131';
    return `${protocol}://${host}/auth/callback`;
  }
  
  // Default fallback
  return process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL}/auth/callback` : 'http://localhost:3131/auth/callback';
}