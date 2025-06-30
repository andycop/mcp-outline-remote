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

export interface OutlineTokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  authorizedAt: number;
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
  
  // Outline OAuth token management
  setOutlineTokens(userId: string, data: OutlineTokenData): Promise<void>;
  getOutlineTokens(userId: string): Promise<OutlineTokenData | null>;
  deleteOutlineTokens(userId: string): Promise<void>;
  isUserAuthorizedForOutline(userId: string): Promise<boolean>;
  
  // Session to user ID mapping for simplified architecture
  setSessionUserMapping(sessionUserId: string, realUserId: string): Promise<void>;
  getSessionUserMapping(sessionUserId: string): Promise<string | null>;
  deleteSessionUserMapping(sessionUserId: string): Promise<void>;
}

class InMemoryTokenStorage implements TokenStorage {
  private authCodes = new Map<string, AuthCodeData>();
  private accessTokens = new Map<string, AccessTokenData>();
  private refreshTokens = new Map<string, RefreshTokenData>();
  private outlineTokens = new Map<string, OutlineTokenData>();
  private sessionUserMappings = new Map<string, string>();

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

  async setOutlineTokens(userId: string, data: OutlineTokenData): Promise<void> {
    this.outlineTokens.set(userId, data);
  }

  async getOutlineTokens(userId: string): Promise<OutlineTokenData | null> {
    const data = this.outlineTokens.get(userId);
    if (!data || data.expiresAt < Date.now()) {
      if (data) {
        this.outlineTokens.delete(userId);
      }
      return null;
    }
    return data;
  }

  async deleteOutlineTokens(userId: string): Promise<void> {
    this.outlineTokens.delete(userId);
  }

  async isUserAuthorizedForOutline(userId: string): Promise<boolean> {
    const tokens = await this.getOutlineTokens(userId);
    return tokens !== null;
  }

  async setSessionUserMapping(sessionUserId: string, realUserId: string): Promise<void> {
    this.sessionUserMappings.set(sessionUserId, realUserId);
  }

  async getSessionUserMapping(sessionUserId: string): Promise<string | null> {
    return this.sessionUserMappings.get(sessionUserId) || null;
  }

  async deleteSessionUserMapping(sessionUserId: string): Promise<void> {
    this.sessionUserMappings.delete(sessionUserId);
  }
}

class RedisTokenStorage implements TokenStorage {
  private redis: any;

  constructor(redis: any) {
    this.redis = redis;
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

  async setOutlineTokens(userId: string, data: OutlineTokenData): Promise<void> {
    const ttl = Math.max(1, Math.floor((data.expiresAt - Date.now()) / 1000));
    await this.redis.setex(`outline_tokens:${userId}`, ttl, JSON.stringify(data));
  }

  async getOutlineTokens(userId: string): Promise<OutlineTokenData | null> {
    const data = await this.redis.get(`outline_tokens:${userId}`);
    return data ? JSON.parse(data) : null;
  }

  async deleteOutlineTokens(userId: string): Promise<void> {
    await this.redis.del(`outline_tokens:${userId}`);
  }

  async isUserAuthorizedForOutline(userId: string): Promise<boolean> {
    const tokens = await this.getOutlineTokens(userId);
    return tokens !== null;
  }

  async setSessionUserMapping(sessionUserId: string, realUserId: string): Promise<void> {
    // Store mapping with 7 day TTL (longer than typical session)
    await this.redis.setex(`session_mapping:${sessionUserId}`, 7 * 24 * 60 * 60, realUserId);
  }

  async getSessionUserMapping(sessionUserId: string): Promise<string | null> {
    const realUserId = await this.redis.get(`session_mapping:${sessionUserId}`);
    return realUserId || null;
  }

  async deleteSessionUserMapping(sessionUserId: string): Promise<void> {
    await this.redis.del(`session_mapping:${sessionUserId}`);
  }
}

export async function createTokenStorage(): Promise<TokenStorage> {
  const redisUrl = process.env.REDIS_URL;
  
  if (redisUrl) {
    console.log('Using Redis for token storage');
    try {
      // Use dynamic import for ES modules compatibility
      const Redis = (await import('ioredis')).default;
      const redisClient = new Redis(redisUrl);
      return new RedisTokenStorage(redisClient);
    } catch (error) {
      console.warn('Failed to initialize Redis, falling back to in-memory storage:', error);
      return new InMemoryTokenStorage();
    }
  } else {
    console.log('Using in-memory token storage (set REDIS_URL for production)');
    return new InMemoryTokenStorage();
  }
}