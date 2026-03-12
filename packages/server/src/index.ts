// packages/server/src/index.ts
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '..', '..', '.env') });
import { Hono } from 'hono';
import { sessionRoutes, handleWebSocketMessage, cleanupWebSocket, setupHeartbeat } from './routes/session';
import { authRoutes } from './routes/auth';
import { cors } from 'hono/cors';
import { apiRateLimit } from './middleware/rate-limit';
import { initializeSkills } from '@ooda-agent/tools';
import { getMCPService, getSkillRegistry, initializeConfigManager, getConfigManager } from '@ooda-agent/core';
import { initializeMemorySystem, initializePersonaManager } from '@ooda-agent/core';
import { createStorage } from '@ooda-agent/storage';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createConnection } from 'node:net';

async function findAvailablePort(startPort: number, maxAttempts: number = 10): Promise<number> {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    const available = await new Promise<boolean>((resolve) => {
      const tester = createConnection({ port, host: 'localhost' })
        .on('error', () => resolve(true))
        .on('connect', () => {
          tester.destroy();
          resolve(false);
        });
    });
    if (available) return port;
  }
  return startPort + maxAttempts;
}

async function loadConfig() {
  const configPaths = [
    path.join(process.cwd(), 'config', 'local-model.json'),
    path.join(process.cwd(), 'config', 'config.json'),
    path.join(process.cwd(), '..', '..', 'config', 'local-model.json'),
    path.join(process.cwd(), '..', '..', 'config', 'config.json'),
  ];
  
  for (const configPath of configPaths) {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      console.log(`[Config] Loaded from: ${configPath}`);
      console.log(`[Config] Active provider: ${config.activeProvider}`);
      return config;
    } catch (e) {
      // Continue to next path
    }
  }
  
  console.log('[Config] Using default configuration');
  return undefined;
}

async function main() {
  const config = await loadConfig();
  if (config) {
    initializeConfigManager(config);
    const activeModel = getConfigManager().getActiveModelInfo();
    console.log(`[Config] Active model: ${activeModel.provider}/${activeModel.model}`);
  }
  
  initializeSkills();

  const dataDir = path.join(process.cwd(), 'data');
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (e) {
    // Directory exists
  }
  
  const dbPath = path.join(dataDir, 'agent.db');
  console.log(`[Storage] Initializing database at: ${dbPath}`);
  
  const storage = await createStorage(dbPath);
  console.log('[Storage] Database initialized');
  
  const enableEmbedding = process.env.ENABLE_EMBEDDING !== 'false';
  initializeMemorySystem(storage.memories, enableEmbedding);
  console.log(`[Memory] Memory system initialized (embedding: ${enableEmbedding})`);
  
  const personaManager = initializePersonaManager(storage.memories);
  await personaManager.loadDefaultPersona();
  console.log('[Memory] Default persona loaded');

  const mcp = getMCPService();

  mcp.subscribe('agent.response', (message) => {
    const payload = message.payload as { content?: string };
    console.log(`[Server] Agent response: ${payload.content || 'No content'}`);
  });

  mcp.subscribe('skill.executed', (message) => {
    const payload = message.payload as { skillName?: string };
    console.log(`[Server] Skill executed: ${payload.skillName || 'Unknown'}`);
  });

  mcp.subscribe('tool.executed', (message) => {
    const payload = message.payload as { toolName?: string };
    console.log(`[Server] Tool executed: ${payload.toolName || 'Unknown'}`);
  });

  const app = new Hono();

  const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || ['http://localhost:5173'];
  
  app.use('*', cors({
    origin: (origin) => {
      if (allowedOrigins.includes(origin)) {
        return origin;
      }
      if (!origin) {
        return allowedOrigins[0];
      }
      return null;
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  }));

  app.use('/api/*', apiRateLimit);

  app.route('/api/auth', authRoutes);
  app.route('/api', sessionRoutes);

  app.get('/health', (c) => {
    console.log('[Health] Health check requested');
    return c.json({ 
      status: 'ok', 
      timestamp: Date.now(),
      skills: 9,
      mcp: 'active',
      websocket: 'enabled'
    });
  });

  app.get('/api/skills', (c) => {
    console.log('[Skills] Skills list requested');
    const skills = getSkillRegistry().list();
    return c.json(skills.map(skill => ({
      name: skill.name,
      description: skill.description,
      category: skill.category,
      version: skill.version
    })));
  });

  const PORT = await findAvailablePort(Number(process.env.PORT) || 3000);

  const server = createServer(async (req, res) => {
    console.log(`[Request] ${req.method} ${req.url}`);
    
    if (req.url === '/ws' || req.url?.startsWith('/ws?')) {
      return;
    }
    
    try {
      const url = `http://localhost:${PORT}${req.url}`;
      
      let body: string | undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks).toString();
      }
      
      const request = new Request(url, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: body,
      });
      
      const response = await app.fetch(request);
      
      console.log(`[Response] Status: ${response.status}`);
      res.statusCode = response.status;
      
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'content-type') {
          res.setHeader(key, value);
        }
      });
      
      const buffer = await response.arrayBuffer();
      res.end(Buffer.from(buffer));
    } catch (error) {
      console.error('[Error] Server error:', error);
      const isDev = process.env.NODE_ENV !== 'production';
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Internal Server Error',
        message: isDev ? (error as Error).message : 'An unexpected error occurred',
        ...(isDev && { stack: (error as Error).stack })
      }));
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket, request) => {
    console.log('[WebSocket] Client connected');
    
    setupHeartbeat(ws);
    
    ws.on('message', (data: Buffer) => {
      const message = data.toString();
      console.log(`[WebSocket] Received: ${message.substring(0, 100)}...`);
      handleWebSocketMessage(ws as any, message);
    });
    
    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected');
      cleanupWebSocket(ws as any);
    });
    
    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
      cleanupWebSocket(ws as any);
    });
    
    ws.on('pong', () => {
      setupHeartbeat(ws as any);
    });
    
    ws.send(JSON.stringify({ type: 'connected', payload: { timestamp: Date.now() } }));
  });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url?.split('?')[0];
    
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  server.on('error', (error) => {
    console.error('[Server] Server error:', error);
  });

  server.listen(Number(PORT), () => {
    console.log(`Server running on port ${PORT}`);
    if (PORT !== 3000) {
      console.log(`\x1b[33m[Warning] Port 3000 was in use, using port ${PORT} instead.\x1b[0m`);
      console.log(`\x1b[33m[Warning] You may need to update vite.config.ts proxy target to http://localhost:${PORT}\x1b[0m`);
    }
    console.log('Skills initialized successfully');
    console.log('MCP service started');
    console.log('WebSocket server enabled');
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Skills list: http://localhost:${PORT}/api/skills`);
    console.log(`WebSocket: ws://localhost:${PORT}/ws`);
  });
}

main().catch((error) => {
  console.error('[Fatal] Unhandled error:', error);
  process.exit(1);
});
