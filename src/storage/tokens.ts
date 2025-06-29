interface AuthCodeData {
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  state?: string;
  userId: string;
  expiresAt: number;
}

interface AccessTokenData {
  token: string;
  clientId: string;
  userId: string;
  scope: string;
  expiresAt: number;
}

interface RefreshTokenData {
  token: string;
  clientId: string;
  userId: string;
  scope: string;
  expiresAt: number;
}

export interface TokenStorage {
  setAuthCode(code: string, data: AuthCodeData): Promise<void>;
  getAuthCode(code: string): Promise<AuthCodeData | null>;
  deleteAuthCode(code: string): Promise<void>;
  setAccessToken(token: string, data: AccessTokenData): Promise<void>;
  getAccessToken(token: string): Promise<AccessTokenData | null>;
  deleteAccessToken(token: string): Promise<void>;
  setRefreshToken(token: string, data: RefreshTokenData): Promise<void>;
  getRefreshToken(token: string): Promise<RefreshTokenData | null>;
  deleteRefreshToken(token: string): Promise<void>;
}

class InMemoryTokenStorage implements TokenStorage {
  private authCodes = new Map<string, AuthCodeData>();
  private accessTokens = new Map<string, AccessTokenData>();
  private refreshTokens = new Map<string, RefreshTokenData>();

  async setAuthCode(code: string, data: AuthCodeData): Promise<void> {
    this.authCodes.set(code, data);
  }

  async getAuthCode(code: string): Promise<AuthCodeData | null> {
    const data = this.authCodes.get(code);
    if (!data || data.expiresAt < Date.now()) {
      if (data) {
        this.authCodes.delete(code);
      }
      return null;
    }
    return data;
  }

  async deleteAuthCode(code: string): Promise<void> {
    this.authCodes.delete(code);
  }

  async setAccessToken(token: string, data: AccessTokenData): Promise<void> {
    this.accessTokens.set(token, data);
  }

  async getAccessToken(token: string): Promise<AccessTokenData | null> {
    const data = this.accessTokens.get(token);
    if (!data || data.expiresAt < Date.now()) {
      if (data) {
        this.accessTokens.delete(token);
      }
      return null;
    }
    return data;
  }

  async deleteAccessToken(token: string): Promise<void> {
    this.accessTokens.delete(token);
  }

  async setRefreshToken(token: string, data: RefreshTokenData): Promise<void> {
    this.refreshTokens.set(token, data);
  }

  async getRefreshToken(token: string): Promise<RefreshTokenData | null> {
    const data = this.refreshTokens.get(token);
    if (!data || data.expiresAt < Date.now()) {
      if (data) {
        this.refreshTokens.delete(token);
      }
      return null;
    }
    return data;
  }

  async deleteRefreshToken(token: string): Promise<void> {
    this.refreshTokens.delete(token);
  }
}

class RedisTokenStorage implements TokenStorage {
  private redis: any;

  constructor(redisUrl: string) {
    // Lazy load Redis to keep it optional
    const Redis = require('ioredis');
    this.redis = new Redis(redisUrl);
  }

  async setAuthCode(code: string, data: AuthCodeData): Promise<void> {
    const ttl = Math.max(1, Math.floor((data.expiresAt - Date.now()) / 1000));
    await this.redis.setex(`auth_code:${code}`, ttl, JSON.stringify(data));
  }

  async getAuthCode(code: string): Promise<AuthCodeData | null> {
    const data = await this.redis.get(`auth_code:${code}`);
    return data ? JSON.parse(data) : null;
  }

  async deleteAuthCode(code: string): Promise<void> {
    await this.redis.del(`auth_code:${code}`);
  }

  async setAccessToken(token: string, data: AccessTokenData): Promise<void> {
    const ttl = Math.max(1, Math.floor((data.expiresAt - Date.now()) / 1000));
    await this.redis.setex(`access_token:${token}`, ttl, JSON.stringify(data));
  }

  async getAccessToken(token: string): Promise<AccessTokenData | null> {
    const data = await this.redis.get(`access_token:${token}`);
    return data ? JSON.parse(data) : null;
  }

  async deleteAccessToken(token: string): Promise<void> {
    await this.redis.del(`access_token:${token}`);
  }

  async setRefreshToken(token: string, data: RefreshTokenData): Promise<void> {
    const ttl = Math.max(1, Math.floor((data.expiresAt - Date.now()) / 1000));
    await this.redis.setex(`refresh_token:${token}`, ttl, JSON.stringify(data));
  }

  async getRefreshToken(token: string): Promise<RefreshTokenData | null> {
    const data = await this.redis.get(`refresh_token:${token}`);
    return data ? JSON.parse(data) : null;
  }

  async deleteRefreshToken(token: string): Promise<void> {
    await this.redis.del(`refresh_token:${token}`);
  }
}

export function createTokenStorage(): TokenStorage {
  const redisUrl = process.env.REDIS_URL;
  
  if (redisUrl) {
    console.log('Using Redis for token storage');
    try {
      return new RedisTokenStorage(redisUrl);
    } catch (error) {
      console.warn('Failed to initialize Redis, falling back to in-memory storage:', error);
      return new InMemoryTokenStorage();
    }
  } else {
    console.log('Using in-memory token storage (set REDIS_URL for production)');
    return new InMemoryTokenStorage();
  }
}