import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { generateToken, authMiddleware, requireRole, getCurrentUser } from '../middleware/auth';
import { createStorage } from '@ooda-agent/storage';

export const authRoutes = new Hono();

let storagePromise: ReturnType<typeof createStorage> | null = null;

async function getStorage() {
  if (!storagePromise) {
    const dbPath = process.env.DATABASE_PATH || './data/ooda-agent.db';
    storagePromise = createStorage(dbPath);
  }
  return storagePromise;
}

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
  
  const storage = await getStorage();
  const existingUser = await storage.users.findByEmail(email);
  
  if (existingUser) {
    throw new HTTPException(409, { message: 'User already exists' });
  }
  
  const userId = crypto.randomUUID();
  const hashedPassword = hashPassword(password);
  
  await storage.users.create({
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
  
  const storage = await getStorage();
  const user = await storage.users.findByEmail(email);
  
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

authRoutes.get('/users', authMiddleware, requireRole('admin'), async (c) => {
  const storage = await getStorage();
  const allUsers = await storage.users.findAll();
  
  return c.json({
    success: true,
    data: { users: allUsers.map(u => ({
      id: u.id,
      email: u.email,
      role: u.role,
    })) },
  });
});
