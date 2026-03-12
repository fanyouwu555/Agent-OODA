import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { generateToken, authMiddleware, requireRole, getCurrentUser } from '../middleware/auth';

export const authRoutes = new Hono();

const users = new Map<string, { id: string; email: string; password: string; role: 'user' | 'admin' }>();

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + process.env.JWT_SECRET);
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data[i];
    hash |= 0;
  }
  return hash.toString(16);
}

authRoutes.post('/register', async (c) => {
  const body = await c.req.json();
  const { email, password } = body;
  
  if (!email || !password) {
    throw new HTTPException(400, { message: 'Email and password are required' });
  }
  
  if (!validateEmail(email)) {
    throw new HTTPException(400, { message: 'Invalid email format' });
  }
  
  if (password.length < 8) {
    throw new HTTPException(400, { message: 'Password must be at least 8 characters' });
  }
  
  if (users.has(email)) {
    throw new HTTPException(409, { message: 'User already exists' });
  }
  
  const userId = crypto.randomUUID();
  const hashedPassword = hashPassword(password);
  
  users.set(email, {
    id: userId,
    email,
    password: hashedPassword,
    role: 'user',
  });
  
  const token = await generateToken({
    userId,
    email,
    role: 'user',
  });
  
  return c.json({
    success: true,
    data: {
      user: { id: userId, email, role: 'user' },
      token,
    },
  });
});

authRoutes.post('/login', async (c) => {
  const body = await c.req.json();
  const { email, password } = body;
  
  if (!email || !password) {
    throw new HTTPException(400, { message: 'Email and password are required' });
  }
  
  const user = users.get(email);
  
  if (!user || user.password !== hashPassword(password)) {
    throw new HTTPException(401, { message: 'Invalid credentials' });
  }
  
  const token = await generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });
  
  return c.json({
    success: true,
    data: {
      user: { id: user.id, email: user.email, role: user.role },
      token,
    },
  });
});

authRoutes.get('/me', authMiddleware, (c) => {
  const user = getCurrentUser(c);
  return c.json({
    success: true,
    data: { user },
  });
});

authRoutes.post('/logout', authMiddleware, (c) => {
  return c.json({
    success: true,
    message: 'Logged out successfully',
  });
});

authRoutes.get('/users', authMiddleware, requireRole('admin'), (c) => {
  const allUsers = Array.from(users.values()).map(u => ({
    id: u.id,
    email: u.email,
    role: u.role,
  }));
  
  return c.json({
    success: true,
    data: { users: allUsers },
  });
});
