import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';
const JWT_EXPIRES_IN = '24h';

export interface JWTPayload {
  userId: string;
  email: string;
  role: 'user' | 'admin';
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing or invalid Authorization header' });
  }
  
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  
  if (!payload) {
    throw new HTTPException(401, { message: 'Invalid or expired token' });
  }
  
  c.set('user', {
    id: payload.userId,
    email: payload.email,
    role: payload.role,
  });
  
  await next();
}

export function optionalAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (payload) {
      c.set('user', {
        id: payload.userId,
        email: payload.email,
        role: payload.role,
      });
    }
  }
  
  return next();
}

export function requireRole(role: 'user' | 'admin') {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    
    if (!user) {
      throw new HTTPException(401, { message: 'Authentication required' });
    }
    
    if (user.role !== role && user.role !== 'admin') {
      throw new HTTPException(403, { message: 'Insufficient permissions' });
    }
    
    await next();
  };
}

export function getCurrentUser(c: Context): AuthUser | undefined {
  return c.get('user');
}

export function requireAuth(c: Context): AuthUser {
  const user = c.get('user');
  if (!user) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }
  return user;
}
