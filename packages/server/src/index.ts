// packages/server/src/index.ts
import { Hono } from 'hono';
import { sessionRoutes, handleWebSocketMessage } from './routes/session';
import { cors } from 'hono/cors';
import { initializeSkills } from '@ooda-agent/tools';
import { getMCPService, getSkillRegistry, initializeConfigManager, getConfigManager } from '@ooda-agent/core';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { promises as fs } from 'fs';
import * as path from 'path';

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

  app.use('*', cors());

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

  const PORT = process.env.PORT || 3000;

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
      
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      
      const buffer = await response.arrayBuffer();
      res.end(Buffer.from(buffer));
    } catch (error) {
      console.error('[Error] Server error:', error);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Internal Server Error',
        message: (error as Error).message,
        stack: (error as Error).stack
      }));
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket, request) => {
    console.log('[WebSocket] Client connected');
    
    ws.on('message', (data: Buffer) => {
      const message = data.toString();
      console.log(`[WebSocket] Received: ${message.substring(0, 100)}...`);
      handleWebSocketMessage(ws as any, message);
    });
    
    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected');
    });
    
    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
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

  server.listen(Number(PORT), () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Skills initialized successfully');
    console.log('MCP service started');
    console.log('WebSocket server enabled');
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Skills list: http://localhost:${PORT}/api/skills`);
    console.log(`WebSocket: ws://localhost:${PORT}/ws`);
  });
}

main().catch(console.error);
