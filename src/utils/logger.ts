/**
 * Anonymizes sensitive keys and tokens for logging
 * - Strings >= 8 chars: shows first 4 and last 4 characters with * in between
 * - Strings < 8 chars: shows first 2 and last 2 characters with * in between
 * @param key The key/token to anonymize
 * @returns Anonymized string safe for logging
 */
export function anonymizeKey(key: string | undefined | null): string {
  if (!key || typeof key !== 'string') {
    return '[undefined]';
  }

  const length = key.length;
  
  if (length < 4) {
    // Very short strings - mask everything except first char
    return key[0] + '*'.repeat(length - 1);
  } else if (length < 8) {
    // Short strings - show 2 start, 2 end
    const start = key.substring(0, 2);
    const end = key.substring(length - 2);
    const middle = '*'.repeat(length - 4);
    return start + middle + end;
  } else {
    // Normal strings - show 4 start, 4 end
    const start = key.substring(0, 4);
    const end = key.substring(length - 4);
    const middle = '*'.repeat(length - 8);
    return start + middle + end;
  }
}

/**
 * Anonymizes multiple keys in an object for logging
 * @param obj Object containing keys to anonymize
 * @param keyNames Array of property names to anonymize
 * @returns New object with anonymized values
 */
export function anonymizeKeys(obj: Record<string, any>, keyNames: string[]): Record<string, any> {
  const result = { ...obj };
  
  for (const keyName of keyNames) {
    if (result[keyName]) {
      result[keyName] = anonymizeKey(result[keyName]);
    }
  }
  
  return result;
}

/**
 * Safe console.log wrapper that automatically anonymizes common sensitive fields
 * @param message Log message
 * @param data Optional data object to log with anonymization
 */
export function logSafe(message: string, data?: any): void {
  if (!data) {
    console.log(message);
    return;
  }

  const sensitiveFields = [
    'access_token', 'accessToken', 'token', 'code', 'authCode', 
    'client_secret', 'clientSecret', 'code_verifier', 'codeVerifier',
    'session_secret', 'sessionSecret', 'password', 'secret', 'sessionId',
    'tenant', 'tenantId', 'tenant_id'
  ];

  const safeData = anonymizeKeys(data, sensitiveFields);
  console.log(message, safeData);
}

/**
 * Enhanced logger with different levels and automatic anonymization
 */
export const logger = {
  info: (message: string, data?: any) => {
    const sensitiveFields = ['token', 'code', 'secret', 'sessionId', 'access_token', 'client_secret', 'code_verifier', 'tenant', 'tenantId', 'tenant_id'];
    console.log(`[INFO] ${message}`, data ? anonymizeKeys(data, sensitiveFields) : '');
  },
  
  warn: (message: string, data?: any) => {
    const sensitiveFields = ['token', 'code', 'secret', 'sessionId', 'access_token', 'client_secret', 'code_verifier', 'tenant', 'tenantId', 'tenant_id'];
    console.warn(`[WARN] ${message}`, data ? anonymizeKeys(data, sensitiveFields) : '');
  },
  
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${message}`, error);
  },
  
  debug: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      const sensitiveFields = ['token', 'code', 'secret', 'password', 'sessionId', 'access_token', 'client_secret', 'code_verifier', 'tenant', 'tenantId', 'tenant_id'];
      const safeData = data ? anonymizeKeys(data, sensitiveFields) : '';
      console.log(`[DEBUG] ${message}`, safeData);
    }
  }
};