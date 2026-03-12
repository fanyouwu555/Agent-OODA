import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';

interface RateLimitStore {
  count: number;
  resetTime: number;
}

const stores = new Map<string, RateLimitStore>();

function getClientKey(c: Context): string {
  const user = c.get('user');
  if (user?.id) {
    return `user:${user.id}`;
  }
  
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return `ip:${forwarded.split(',')[0].trim()}`;
  }
  
  return `ip:${c.req.header('x-real-ip') || 'unknown'}`;
}

function cleanupStores(): void {
  const now = Date.now();
  for (const [key, store] of stores.entries()) {
    if (store.resetTime < now) {
      stores.delete(key);
    }
  }
}

setInterval(cleanupStores, 60000);

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  keyGenerator?: (c: Context) => string;
  skip?: (c: Context) => boolean;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = '请求过于频繁，请稍后再试',
    keyGenerator = getClientKey,
    skip,
  } = options;

  return async (c: Context, next: Next) => {
    if (skip?.(c)) {
      return next();
    }

    const key = keyGenerator(c);
    const now = Date.now();
    
    let store = stores.get(key);
    
    if (!store || store.resetTime < now) {
      store = {
        count: 0,
        resetTime: now + windowMs,
      };
      stores.set(key, store);
    }
    
    store.count++;
    
    const remaining = Math.max(0, max - store.count);
    const resetTimeSeconds = Math.ceil((store.resetTime - now) / 1000);
    
    c.header('X-RateLimit-Limit', max.toString());
    c.header('X-RateLimit-Remaining', remaining.toString());
    c.header('X-RateLimit-Reset', resetTimeSeconds.toString());
    
    if (store.count > max) {
      c.header('Retry-After', resetTimeSeconds.toString());
      throw new HTTPException(429, { message });
    }
    
    await next();
  };
}

export const apiRateLimit = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
});

export const messageRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: '消息发送过于频繁，请稍后再试',
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: '登录尝试过于频繁，请稍后再试',
  keyGenerator: (c) => {
    const forwarded = c.req.header('x-forwarded-for');
    return `auth:${forwarded?.split(',')[0].trim() || c.req.header('x-real-ip') || 'unknown'}`;
  },
});

export const strictRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: '操作过于频繁',
});
