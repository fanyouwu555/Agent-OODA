import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { OODALoop, getConfigManager, reinitializeLLMService } from '@ooda-agent/core';
import { ToolRegistry, readFileTool, writeFileTool, runBashTool, searchWebTool } from '@ooda-agent/tools';
import { createStorage } from '@ooda-agent/storage';
import WebSocket from 'ws';

const sessionRoutes = new Hono();

interface WSMessage {
  type: 'confirmation' | 'subscribe' | 'unsubscribe' | 'ping';
  payload: unknown;
}

let storagePromise: ReturnType<typeof createStorage> | null = null;

async function getStorage() {
  if (!storagePromise) {
    const dbPath = process.env.DATABASE_PATH || './data/ooda-agent.db';
    storagePromise = createStorage(dbPath);
  }
  return storagePromise;
}

const wsClients = new Map<string, Set<WebSocket>>();

const pendingConfirmations = new Map<string, {
  resolve: (allowed: boolean) => void;
  sessionId: string;
}>();

const toolRegistry = new ToolRegistry();
toolRegistry.register(readFileTool);
toolRegistry.register(writeFileTool);
toolRegistry.register(runBashTool);
toolRegistry.register(searchWebTool);

export function handleWebSocketMessage(ws: WebSocket, message: string) {
  try {
    const msg: WSMessage = JSON.parse(message);
    
    switch (msg.type) {
      case 'subscribe': {
        const sessionId = msg.payload as string;
        if (!wsClients.has(sessionId)) {
          wsClients.set(sessionId, new Set());
        }
        wsClients.get(sessionId)!.add(ws);
        ws.send(JSON.stringify({ type: 'subscribed', payload: sessionId }));
        break;
      }
      
      case 'unsubscribe': {
        const sessionId = msg.payload as string;
        wsClients.get(sessionId)?.delete(ws);
        ws.send(JSON.stringify({ type: 'unsubscribed', payload: sessionId }));
        break;
      }
      
      case 'confirmation': {
        const { id, allowed } = msg.payload as { id: string; allowed: boolean };
        const pending = pendingConfirmations.get(id);
        if (pending) {
          pending.resolve(allowed);
          pendingConfirmations.delete(id);
        }
        break;
      }
      
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
    }
  } catch (error) {
    console.error('[WebSocket] Error handling message:', error);
  }
}

export function broadcastToSession(sessionId: string, message: unknown) {
  const clients = wsClients.get(sessionId);
  if (clients) {
    const messageStr = JSON.stringify(message);
    clients.forEach(client => {
      try {
        client.send(messageStr);
      } catch (error) {
        console.error('[WebSocket] Error broadcasting:', error);
      }
    });
  }
}

export function requestConfirmation(
  sessionId: string,
  confirmationId: string,
  toolName: string,
  args: unknown
): Promise<boolean> {
  return new Promise((resolve) => {
    pendingConfirmations.set(confirmationId, { resolve, sessionId });
    
    broadcastToSession(sessionId, {
      type: 'confirmation',
      payload: {
        id: confirmationId,
        toolName,
        args,
        timestamp: Date.now()
      }
    });
    
    setTimeout(() => {
      if (pendingConfirmations.has(confirmationId)) {
        pendingConfirmations.delete(confirmationId);
        resolve(false);
      }
    }, 60000);
  });
}

interface SSEWriter {
  writeSSE: (data: { event?: string; data: string }) => Promise<void>;
}

sessionRoutes
  .post('/session', async (c) => {
    const store = await getStorage();
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const session = store.sessions.create({ id: sessionId });
    console.log(`[Session] Created: ${sessionId}`);
    
    return c.json({ sessionId: session.id });
  })

  .post('/session/:id/message', async (c) => {
    console.log(`[DEBUG] Message endpoint called`);
    const sessionId = c.req.param('id');
    console.log(`[DEBUG] Session ID: ${sessionId}`);
    
    const store = await getStorage();
    console.log(`[DEBUG] Storage loaded`);
    
    const session = store.sessions.findById(sessionId);
    if (!session) {
      console.log(`[DEBUG] Session not found: ${sessionId}`);
      return c.json({ error: 'Session not found' }, 404);
    }
    console.log(`[DEBUG] Session found: ${sessionId}`);
    
    const body = await c.req.json();
    const message = body.message;
    console.log(`[DEBUG] Message received: ${message}`);
    
    if (!message) {
      return c.json({ error: 'Message required' }, 400);
    }
    
    const userMessageId = `msg-${Date.now()}`;
    store.messages.create({
      id: userMessageId,
      sessionId,
      role: 'user',
      content: message,
      timestamp: Date.now(),
    });
    
    console.log(`[Request] POST /api/session/${sessionId}/message`);
    
    return streamSSE(c, async (stream) => {
      console.log(`[DEBUG] streamSSE started`);
      const sendEvent = async (type: string, data: Record<string, unknown>) => {
        console.log(`[SSE] Sending event: ${type}`);
        await stream.writeSSE({
          data: JSON.stringify({ type, ...data }),
        });
      };
      
      try {
        await sendEvent('thinking', { content: '正在分析您的请求...' });
        console.log(`[DEBUG] Creating OODALoop`);
        
        const oodaLoop = new OODALoop();
        console.log(`[DEBUG] OODALoop created, running...`);
        
        const result = await oodaLoop.runWithCallback(message, async (event) => {
          console.log(`[OODA] Event: ${event.phase}`);
          
          switch (event.phase) {
            case 'observe':
              await sendEvent('thinking', { content: '观察阶段：收集信息...' });
              break;
            case 'orient':
              await sendEvent('intent', { content: event.data?.intent || '分析意图中...' });
              await sendEvent('thinking', { content: '定向阶段：理解上下文...' });
              break;
            case 'decide':
              await sendEvent('reasoning', { content: event.data?.reasoning || '制定决策中...' });
              break;
            case 'act':
              if (event.data?.toolCall) {
                await sendEvent('tool_call', { 
                  toolCall: { 
                    ...event.data.toolCall, 
                    status: 'running',
                    startTime: Date.now()
                  } 
                });
              }
              break;
            case 'tool_result':
              if (event.data?.toolCall) {
                await sendEvent('tool_result', { 
                  toolCall: { 
                    ...event.data.toolCall, 
                    status: 'success',
                    endTime: Date.now()
                  } 
                });
              }
              break;
          }
        });
        
        const toolCalls = result.steps?.map((step: any, index: number) => ({
          id: `tool-${Date.now()}-${index}`,
          name: step.tool || 'unknown',
          args: step.args || {},
          status: step.error ? 'error' : 'success',
          result: step.result,
          error: step.error,
          startTime: step.startTime || Date.now(),
          endTime: step.endTime || Date.now(),
        })) || [];
        
        const assistantMessageId = `msg-${Date.now()}-response`;
        store.messages.create({
          id: assistantMessageId,
          sessionId,
          role: 'assistant',
          content: result.output || '处理完成',
          timestamp: Date.now(),
        });
        
        for (const toolCall of toolCalls) {
          store.toolCalls.create({
            id: toolCall.id,
            messageId: assistantMessageId,
            toolName: toolCall.name,
            args: toolCall.args,
            status: toolCall.status,
            result: toolCall.result,
            error: toolCall.error,
            startTime: toolCall.startTime,
            endTime: toolCall.endTime,
          });
        }
        
        await sendEvent('result', { content: result.output });
        
        const allMessages = store.messages.findBySessionId(sessionId);
        broadcastToSession(sessionId, {
          type: 'session_update',
          payload: { messages: allMessages },
        });
        
        await stream.writeSSE({
          data: JSON.stringify({ type: 'end', status: 'completed' }),
        });
        
        console.log(`[Response] Status: 200`);
        
      } catch (error) {
        console.error('[Session] Error processing message:', error);
        await sendEvent('error', { content: error instanceof Error ? error.message : '处理失败' });
      }
    });
  })

  .get('/session/:id/history', async (c) => {
    const sessionId = c.req.param('id');
    const store = await getStorage();
    
    const session = store.sessions.findById(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    
    const messages = store.messages.findBySessionId(sessionId);
    const result = messages.map(msg => {
      const toolCalls = store.toolCalls.findByMessageId(msg.id);
      return {
        ...msg,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    });
    
    return c.json(result);
  })

  .get('/session/:id', async (c) => {
    const sessionId = c.req.param('id');
    const store = await getStorage();
    
    const session = store.sessions.findById(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    
    const messages = store.messages.findBySessionId(sessionId);
    return c.json({
      ...session,
      messages,
    });
  })

  .delete('/session/:id', async (c) => {
    const sessionId = c.req.param('id');
    const store = await getStorage();
    
    store.messages.deleteBySessionId(sessionId);
    const deleted = store.sessions.delete(sessionId);
    
    if (!deleted) {
      return c.json({ error: 'Session not found' }, 404);
    }
    
    return c.json({ success: true });
  })

  .get('/sessions', async (c) => {
    const store = await getStorage();
    const sessions = store.sessions.findAll();
    return c.json(sessions);
  })

  .post('/session/:id/confirm', async (c) => {
    const sessionId = c.req.param('id');
    const body = await c.req.json();
    const { confirmationId, allowed } = body;
    
    const pending = pendingConfirmations.get(confirmationId);
    if (pending && pending.sessionId === sessionId) {
      pending.resolve(allowed);
      pendingConfirmations.delete(confirmationId);
      return c.json({ success: true });
    }
    
    return c.json({ error: 'Confirmation not found' }, 404);
  })

  .get('/models', async (c) => {
    const configManager = getConfigManager();
    const providers = configManager.getAllProviders();
    const activeModel = configManager.getActiveModelInfo();
    
    return c.json({
      providers,
      activeModel
    });
  })

  .post('/models/switch', async (c) => {
    const body = await c.req.json();
    const { providerName, modelName } = body;
    
    if (!providerName || !modelName) {
      return c.json({ error: 'providerName and modelName are required' }, 400);
    }
    
    const configManager = getConfigManager();
    const success = configManager.setActiveModel(providerName, modelName);
    
    if (!success) {
      return c.json({ error: 'Failed to switch model. Invalid provider or model name.' }, 400);
    }
    
    reinitializeLLMService();
    
    const activeModel = configManager.getActiveModelInfo();
    
    return c.json({
      success: true,
      activeModel
    });
  })

  .get('/models/active', async (c) => {
    const configManager = getConfigManager();
    const activeModel = configManager.getActiveModelInfo();
    
    return c.json(activeModel);
  });

export { sessionRoutes };
