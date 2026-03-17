// packages/server/src/index.ts
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '..', '..', '.env') });

import { Hono } from 'hono';
import { sessionRoutes } from './routes/session';
import { authRoutes } from './routes/auth';
import { permissionRoutes } from './routes/permissions';
import { agentRoutes } from './routes/agents';
import { toolRoutes } from './routes/tools';
import { loggingRoutes } from './routes/logging';
import eventRoutes from './routes/events';
import { cors } from 'hono/cors';
import { apiRateLimit } from './middleware/rate-limit';
import { requestLogger } from './middleware/logger';
import { logger } from './utils/logger';
import { detailedLogger } from './utils/detailed-logger';
import { initializeSkills, initializeTools } from '@ooda-agent/tools';
import { getMCPService, getSkillRegistry, initializeConfigManager, getConfigManager, validateEnvironment, logValidationResult, setToolRegistry, getToolRegistry } from '@ooda-agent/core';
import { initializeMemorySystem, initializePersonaManager } from '@ooda-agent/core';
import { createStorage } from '@ooda-agent/storage';
import { createServer } from 'node:http';
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

/**
 * 预热 Ollama 模型，避免首次请求时模型加载延迟
 */
async function warmupOllama() {
  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
  const MODEL = process.env.OLLAMA_MODEL || 'qwen3:4b';
  
  try {
    // 先检查 Ollama 是否可用
    const healthCheck = await fetch(`${OLLAMA_URL}/api/tags`, { 
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    if (!healthCheck.ok) {
      console.log('[Warmup] Ollama not available, skipping warmup');
      return;
    }
    
    console.log(`[Warmup] Preloading model: ${MODEL}...`);
    
    // 发送一个简单的请求预热模型
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        stream: false,
        options: {
          num_predict: 1,  // 最少生成 token
        }
      }),
      signal: AbortSignal.timeout(30000)
    });
    
    if (response.ok) {
      const data = await response.json();
      const loadDuration = data.load_duration ? Math.round(data.load_duration / 1000000) : 0;
      console.log(`[Warmup] Model loaded in ${loadDuration}ms, ready for requests`);
    } else {
      console.log(`[Warmup] Warmup request failed: ${response.status}`);
    }
  } catch (error) {
    console.log(`[Warmup] Skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
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
      logger.info('Config', `Loaded from: ${configPath}`, { activeProvider: config.activeProvider });
      return config;
    } catch (e) {
      // Continue to next path
    }
  }
  
  logger.info('Config', 'Using default configuration');
  return undefined;
}

async function main() {
  // 校验环境变量
  const validation = validateEnvironment();
  logValidationResult(validation);
  if (!validation.valid) {
    console.error('[Config] 环境变量校验失败，服务器无法启动');
    process.exit(1);
  }
  
  const appConfig = await loadConfig();
  if (appConfig) {
    initializeConfigManager(appConfig);
    const activeModel = getConfigManager().getActiveModelInfo();
    logger.info('Config', `Active model: ${activeModel.provider}/${activeModel.model}`);
  }
  
  initializeSkills();
  logger.info('Skills', 'Skills initialized successfully');

  const dataDir = path.join(process.cwd(), 'data');
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (e) {
    // Directory exists
  }
  
  const dbPath = path.join(dataDir, 'agent.db');
  logger.info('Storage', `Initializing database at: ${dbPath}`);
  
  const storage = await createStorage(dbPath);
  logger.info('Storage', 'Database initialized');
  
  const enableEmbedding = process.env.ENABLE_EMBEDDING !== 'false';
  initializeMemorySystem(storage.memories, enableEmbedding);
  logger.info('Memory', `Memory system initialized (embedding: ${enableEmbedding})`);
  
  const personaManager = initializePersonaManager(storage.memories);
  await personaManager.loadDefaultPersona();
  logger.info('Memory', 'Default persona loaded');

  const mcp = getMCPService();

  // 初始化工具并注册到 core 的 UnifiedToolRegistry
  const toolsRegistry = initializeTools();
  setToolRegistry(toolsRegistry as any);
  logger.info('Tools', `Registered tools: ${toolsRegistry.list().join(', ')}`);

  mcp.subscribe('agent.response', (message) => {
    const payload = message.payload as { content?: string; sessionId?: string };
    logger.info('MCP', 'Agent response', { 
      sessionId: payload.sessionId,
      content: payload.content?.substring(0, 200) 
    });
  });

  mcp.subscribe('skill.executed', (message) => {
    const payload = message.payload as { skillName?: string; result?: unknown };
    logger.info('MCP', 'Skill executed', { skillName: payload.skillName, result: payload.result });
  });

  mcp.subscribe('tool.executed', (message) => {
    const payload = message.payload as { toolName?: string; args?: unknown; result?: unknown };
    logger.info('MCP', 'Tool executed', { 
      toolName: payload.toolName, 
      args: payload.args,
      result: payload.result 
    });
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

  // Add request logging middleware
  app.use('*', requestLogger);
  app.use('/api/*', apiRateLimit);

  app.route('/api/auth', authRoutes);
  app.route('/api/permissions', permissionRoutes);
  app.route('/api/agents', agentRoutes);
  app.route('/api/tools', toolRoutes);
  app.route('/api/events', eventRoutes);
  app.route('/api/logging', loggingRoutes);
  app.route('/api', sessionRoutes);

  app.get('/health', (c) => {
    logger.debug('Health', 'Health check requested');
    return c.json({ 
      status: 'ok', 
      timestamp: Date.now(),
      skills: 9,
      mcp: 'active',
      websocket: 'enabled'
    });
  });

  app.get('/api/skills', (c) => {
    logger.debug('Skills', 'Skills list requested');
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
    const startTime = Date.now();
    const method = req.method || 'GET';
    const url = req.url || '/';
    
    try {
      const requestUrl = `http://localhost:${PORT}${url}`;
      
      let body: string | undefined;
      if (method !== 'GET' && method !== 'HEAD') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks).toString();
      }

      // Log raw HTTP request
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') {
          headers[key] = value;
        }
      }
      
      let parsedBody: unknown = undefined;
      if (body) {
        try {
          parsedBody = JSON.parse(body);
        } catch {
          parsedBody = body;
        }
      }
      
      logger.logRequest(method, url, headers, parsedBody);
      
      const request = new Request(requestUrl, {
        method: method,
        headers: headers as HeadersInit,
        body: body,
      });
      
      const response = await app.fetch(request);
      
      const duration = Date.now() - startTime;
      
      // Log response
      let responseBody: unknown = undefined;
      try {
        const clonedRes = response.clone();
        responseBody = await clonedRes.json();
      } catch {
        // Not JSON response
      }
      
      logger.logResponse(method, url, response.status, duration, responseBody);
      
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
      const duration = Date.now() - startTime;
      logger.error('HTTP', `${method} ${url} failed`, { 
        error: error instanceof Error ? error.message : String(error),
        duration 
      });
      
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

  server.on('error', (error) => {
    logger.error('Server', 'Server error', { error: error.message });
  });

  server.listen(Number(PORT), () => {
    logger.info('Server', `Server running on port ${PORT}`);
    if (PORT !== 3000) {
      logger.warn('Server', `Port 3000 was in use, using port ${PORT} instead`);
      logger.warn('Server', `You may need to update vite.config.ts proxy target to http://localhost:${PORT}`);
    }
    logger.info('Server', 'MCP service started');
    logger.info('Server', `Health check: http://localhost:${PORT}/health`);
    logger.info('Server', `Skills list: http://localhost:${PORT}/api/skills`);
    
    if (logger.getLogFilePath()) {
      logger.info('Server', `Log file: ${logger.getLogFilePath()}`);
    }
    
    // 预热 Ollama 模型（避免首次请求慢）
    warmupOllama().catch(err => logger.warn('Server', `Ollama warmup failed: ${err.message}`));
  });
}

main().catch((error) => {
  logger.error('Fatal', 'Unhandled error', { error: error.message, stack: error.stack });
  process.exit(1);
});
