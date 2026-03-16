import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { OODALoop, getConfigManager, reinitializeLLMService, getPermissionManager } from '@ooda-agent/core';
import { ToolRegistry, readFileTool, writeFileTool, runBashTool, webSearchTool, webFetchTool, webSearchAndFetchTool, listDirectoryTool, deleteFileTool, grepTool, globTool, initializeTools } from '@ooda-agent/tools';
import { createStorage } from '@ooda-agent/storage';
import { detailedLogger } from '../utils/detailed-logger';
import { eventBus } from './events';

const sessionRoutes = new Hono();

interface WSMessage {
  type: 'confirmation' | 'subscribe' | 'unsubscribe' | 'ping';
  payload: unknown;
}

let storagePromise: ReturnType<typeof createStorage> | null = null;

async function getStorage() {
  if (!storagePromise) {
    const dbPath = process.env.DATABASE_PATH || './data/ooda-agent.db';
    console.log(`[Storage] Initializing storage at: ${dbPath}`);
    detailedLogger.info('DB', `Initializing storage at: ${dbPath}`);
    try {
      storagePromise = createStorage(dbPath);
      await storagePromise;
      console.log(`[Storage] Storage initialized successfully`);
      detailedLogger.debug('DB', 'Storage initialized successfully');
    } catch (error) {
      console.error(`[Storage] Failed to initialize storage:`, error);
      detailedLogger.error('DB', 'Failed to initialize storage', error);
      throw error;
    }
  }
  return storagePromise;
}

const pendingConfirmations = new Map<string, {
  resolve: (allowed: boolean) => void;
  sessionId: string;
}>();

const toolRegistry = initializeTools();

function publishToSession(sessionId: string, namespace: string, action: string, payload: unknown) {
  eventBus.publish({
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    namespace,
    action,
    sessionId,
    payload,
    timestamp: Date.now()
  });
}

export function requestConfirmation(
  sessionId: string,
  confirmationId: string,
  toolName: string,
  args: unknown
): Promise<boolean> {
  return new Promise((resolve) => {
    pendingConfirmations.set(confirmationId, { resolve, sessionId });
    
    detailedLogger.info('PERMISSION', `Requesting confirmation for ${toolName}`, { confirmationId, args }, sessionId);
    
    publishToSession(sessionId, 'permission', 'asked', {
      id: confirmationId,
      toolName,
      args,
      timestamp: Date.now()
    });
    
    setTimeout(() => {
      if (pendingConfirmations.has(confirmationId)) {
        pendingConfirmations.delete(confirmationId);
        detailedLogger.warn('PERMISSION', `Confirmation timeout for ${toolName}`, { confirmationId }, sessionId);
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
    try {
      console.log('[Session] Creating new session...');
      detailedLogger.info('SERVER', 'Creating new session');
      const store = await getStorage();
      console.log('[Session] Storage obtained');
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const session = store.sessions.create({ id: sessionId });
      console.log(`[Session] Created: ${sessionId}`);
      detailedLogger.info('SERVER', `Session created: ${sessionId}`);
      
      return c.json({ sessionId: session.id });
    } catch (error) {
      console.error('[Session] Error creating session:', error);
      detailedLogger.error('SERVER', 'Error creating session', error);
      return c.json({ error: 'Failed to create session', message: (error as Error).message }, 500);
    }
  })

  .post('/session/:id/message', async (c) => {
    console.log(`[DEBUG] Message endpoint called`);
    const sessionId = c.req.param('id');
    console.log(`[DEBUG] Session ID: ${sessionId}`);
    detailedLogger.info('SERVER', `Received message for session`, { sessionId });
    
    const store = await getStorage();
    console.log(`[DEBUG] Storage loaded`);
    
    const session = store.sessions.findById(sessionId);
    if (!session) {
      console.log(`[DEBUG] Session not found: ${sessionId}`);
      detailedLogger.warn('SERVER', `Session not found: ${sessionId}`);
      return c.json({ error: 'Session not found' }, 404);
    }
    console.log(`[DEBUG] Session found: ${sessionId}`);
    
    const body = await c.req.json();
    const message = body.message;
    console.log(`[DEBUG] Message received: ${message}`);
    detailedLogger.debug('SERVER', `User message`, { sessionId, messageLength: message?.length });
    
    if (!message) {
      detailedLogger.warn('SERVER', `Empty message received`, { sessionId });
      return c.json({ error: 'Message required' }, 400);
    }
    
    const existingMessages = store.messages.findBySessionId(sessionId);
    const history = existingMessages.map(msg => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
      content: msg.content,
      timestamp: msg.timestamp,
    }));
    
    const userMessageId = `msg-${Date.now()}`;
    store.messages.create({
      id: userMessageId,
      sessionId,
      role: 'user',
      content: message,
      timestamp: Date.now(),
    });
    detailedLogger.debug('DB', `User message stored`, { sessionId, messageId: userMessageId });

    if (existingMessages.length === 0 && !session.title) {
      const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
      store.sessions.update(sessionId, { title });
      console.log(`[Session] Auto-set title for session ${sessionId}: ${title}`);
      detailedLogger.info('SERVER', `Session title set`, { sessionId, title });
    }
    
    console.log(`[Request] POST /api/session/${sessionId}/message`);
    console.log(`[Context] Loaded ${history.length} history messages`);
    detailedLogger.info('SERVER', `Starting OODA processing`, { sessionId, historyLength: history.length });
    
    return streamSSE(c, async (stream) => {
      console.log(`[DEBUG] streamSSE started`);
      detailedLogger.logSSEConnect(sessionId);
      
      const sendEvent = async (type: string, data: Record<string, unknown>) => {
        console.log(`[SSE] Sending event: ${type}`);
        detailedLogger.logSSESend(sessionId, type, data);
        await stream.writeSSE({
          event: type,
          data: JSON.stringify({ type, ...data }),
        });
      };
      
      try {
        await sendEvent('thinking', { content: '正在分析您的请求...' });
        console.log(`[DEBUG] Creating OODALoop for session: ${sessionId}`);
        detailedLogger.logOODAPhase('start', sessionId, { historyLength: history.length });
        
        // Set up permission callback for user confirmation
        const permissionManager = getPermissionManager();
        permissionManager.setUserConfirmationCallback((toolName, args) => {
          detailedLogger.debug('PERMISSION', `Permission check for ${toolName}`, { args }, sessionId);
          const confirmationId = `${sessionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          return requestConfirmation(sessionId, confirmationId, toolName, args);
        });
        
        const oodaLoop = new OODALoop(sessionId);
        
        // 启用流式输出
        oodaLoop.enableStreaming({
          onEvent: async (event) => {
            if (event.type === 'content' && event.content) {
              await sendEvent('message.part', { 
                part: event.content, 
                isComplete: event.progress === 100 
              });
            }
          }
        }, { chunkSize: 100, delayBetweenChunks: 0 });
        
        // 设置思考过程回调 - 实时推送 LLM 思考内容
        oodaLoop.setThinkingCallback(async (phase, type, content) => {
          // 根据阶段和类型发送不同的 SSE 事件
          if (phase === 'orient') {
            if (type === 'thinking') {
              await sendEvent('thinking', { content });
            } else if (type === 'intent') {
              await sendEvent('intent', { content });
            } else if (type === 'analysis') {
              await sendEvent('thinking', { content });
            }
          } else if (phase === 'decide') {
            if (type === 'thinking') {
              await sendEvent('thinking', { content });
            } else if (type === 'decision') {
              await sendEvent('reasoning', { content });
            } else if (type === 'reasoning') {
              await sendEvent('reasoning', { content });
            }
          }
        });
        
        // 设置流式内容回调 - 实时推送最终响应内容
        oodaLoop.setStreamContentCallback(async (chunk: string, isComplete: boolean) => {
          await sendEvent('content', { 
            content: chunk,
            isComplete 
          });
        });
        
        console.log(`[DEBUG] OODALoop created with sessionId: ${oodaLoop.getSessionId()}, running with ${history.length} history messages...`);
        
        // 用于流式输出的累积内容
        let streamedContent = '';
        
        // 用于存储 OODA 循环的 metadata
        let oodaMetadata: unknown = null;
        
        const result = await oodaLoop.runWithCallback(message, async (event) => {
          console.log(`[OODA] Event: ${event.phase}`);
          detailedLogger.logOODAPhase(event.phase, sessionId, event.data);
          
          // 保存 metadata 以便在 complete 阶段使用
          const eventDataAny = event.data as Record<string, unknown> | undefined;
          if (eventDataAny?.metadata) {
            oodaMetadata = eventDataAny.metadata;
          }
          
          switch (event.phase) {
            case 'observe':
              detailedLogger.logOOBAObservation(sessionId, message, event.data);
              await sendEvent('thinking', { content: '观察阶段：收集信息...' });
              break;
            case 'orient':
              const intent = event.data?.intent || '';
              detailedLogger.logOODAOrientation(sessionId, intent, event.data);
              await sendEvent('intent', { content: event.data?.intent || '分析意图中...' });
              await sendEvent('thinking', { content: '定向阶段：理解上下文...' });
              break;
            case 'decide':
              const decision = event.data?.selectedOption || '';
              const reasoning = event.data?.reasoning || '';
              const options = event.data?.options || [];
              detailedLogger.logOODADecision(sessionId, decision, reasoning, options);
              await sendEvent('reasoning', { content: event.data?.reasoning || '制定决策中...' });
              break;
            case 'act':
              if (event.data?.toolCall) {
                detailedLogger.logOODAToolCall(sessionId, event.data.toolCall.name, event.data.toolCall.args, 'running');
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
                const result = event.data.toolCall.result;
                detailedLogger.logOODAToolCall(sessionId, event.data.toolCall.name, event.data.toolCall.args, result);
                await sendEvent('tool_result', { 
                  toolCall: { 
                    ...event.data.toolCall, 
                    status: 'success',
                    endTime: Date.now()
                  } 
                });
              }
              break;
            case 'complete':
              // OODA 循环完成，内容已在 act 阶段流式发送
              const eventDataComplete = event.data as { output?: string } | undefined;
              const outputComplete = eventDataComplete?.output || '';
              console.log(`[DEBUG] complete event, output length: ${outputComplete.length}`);
              detailedLogger.logOODAComplete(sessionId, outputComplete, { metadata: oodaMetadata });
              break;
          }
        }, history);
        
        const lastAction = result.metadata?.lastAction as Record<string, unknown> | undefined;
        const lastResult = result.metadata?.lastResult as Record<string, unknown> | undefined;
        const toolCalls = lastAction 
          ? [{
              id: `tool-${Date.now()}`,
              name: (lastAction.toolName as string) || (lastAction.type as string) || 'unknown',
              args: (lastAction.args as Record<string, unknown>) || {},
              status: lastResult?.success === false ? 'error' : 'success',
              result: lastResult?.result,
              error: lastResult?.success === false 
                ? ((lastResult.result as Record<string, unknown>)?.message as string) 
                  || ((lastResult.result as Record<string, unknown>)?.result as string) 
                  || '执行失败'
                : undefined,
              startTime: Date.now() - ((lastResult?.executionTime as number) || 0),
              endTime: Date.now(),
            }]
          : [];
        
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
        publishToSession(sessionId, 'session', 'updated', { messages: allMessages });
        
        await stream.writeSSE({
          event: 'end',
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
        toolCalls: toolCalls.length > 0 ? toolCalls.map(tc => ({
          id: tc.id,
          name: tc.toolName,
          args: tc.args,
          status: tc.status,
          result: tc.result,
          error: tc.error,
          startTime: tc.startTime,
          endTime: tc.endTime,
        })) : undefined,
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
    const messagesWithToolCalls = messages.map(msg => {
      const toolCalls = store.toolCalls.findByMessageId(msg.id);
      return {
        ...msg,
        toolCalls: toolCalls.length > 0 ? toolCalls.map(tc => ({
          id: tc.id,
          name: tc.toolName,
          args: tc.args,
          status: tc.status,
          result: tc.result,
          error: tc.error,
          startTime: tc.startTime,
          endTime: tc.endTime,
        })) : undefined,
      };
    });
    
    return c.json({
      ...session,
      messages: messagesWithToolCalls,
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
    const status = c.req.query('status') as 'active' | 'archived' | undefined;
    
    const sessionsWithCounts = store.sessions.findAllWithMessageCount(status);
    
    return c.json(sessionsWithCounts.map(session => ({
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      title: session.title,
      summary: session.summary,
      status: session.status,
      messageCount: session.messageCount,
      lastMessageAt: session.lastMessageAt,
      firstMessageContent: session.firstMessageContent,
    })));
  })

  .get('/sessions/search', async (c) => {
    const query = c.req.query('q');
    if (!query) {
      return c.json({ error: 'Query parameter q is required' }, 400);
    }
    
    const store = await getStorage();
    const sessions = store.sessions.search(query);
    
    const sessionsWithCounts = sessions.map(session => {
      const messages = store.messages.findBySessionId(session.id);
      return {
        ...session,
        messageCount: messages.length,
        lastMessage: messages.length > 0 ? messages[messages.length - 1] : null,
      };
    });
    
    return c.json(sessionsWithCounts);
  })

  .patch('/session/:id/archive', async (c) => {
    const sessionId = c.req.param('id');
    const store = await getStorage();
    
    const session = store.sessions.findById(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    
    store.sessions.archive(sessionId);
    return c.json({ success: true, status: 'archived' });
  })

  .patch('/session/:id/restore', async (c) => {
    const sessionId = c.req.param('id');
    const store = await getStorage();
    
    const session = store.sessions.findById(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    
    store.sessions.restore(sessionId);
    return c.json({ success: true, status: 'active' });
  })

  .patch('/session/:id/title', async (c) => {
    const sessionId = c.req.param('id');
    const body = await c.req.json();
    const { title } = body;
    
    if (!title) {
      return c.json({ error: 'Title is required' }, 400);
    }
    
    const store = await getStorage();
    const session = store.sessions.findById(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    
    store.sessions.update(sessionId, { title });
    return c.json({ success: true, title });
  })

  .get('/sessions/count', async (c) => {
    const store = await getStorage();
    const count = store.sessions.count();
    return c.json({ count });
  })

  .delete('/sessions', async (c) => {
    const store = await getStorage();
    
    const sessionsCount = store.sessions.count();
    const messagesCount = store.messages.count();
    const toolCallsCount = store.toolCalls.count();
    
    store.toolCalls.deleteAll();
    store.messages.deleteAll();
    store.sessions.deleteAll();
    
    console.log(`[Session] Cleared all data: ${sessionsCount} sessions, ${messagesCount} messages, ${toolCallsCount} tool calls`);
    
    return c.json({ 
      success: true, 
      deleted: { 
        sessions: sessionsCount, 
        messages: messagesCount, 
        toolCalls: toolCallsCount 
      } 
    });
  })

  .delete('/sessions/archived', async (c) => {
    const store = await getStorage();
    
    const archivedSessions = store.sessions.findByStatus('archived');
    let messagesCount = 0;
    let toolCallsCount = 0;
    
    for (const session of archivedSessions) {
      const messages = store.messages.findBySessionId(session.id);
      messagesCount += messages.length;
      for (const msg of messages) {
        const toolCalls = store.toolCalls.findByMessageId(msg.id);
        toolCallsCount += toolCalls.length;
      }
      store.messages.deleteBySessionId(session.id);
    }
    
    const sessionsCount = store.sessions.deleteByStatus('archived');
    
    console.log(`[Session] Cleared archived sessions: ${sessionsCount} sessions, ${messagesCount} messages, ${toolCallsCount} tool calls`);
    
    return c.json({ 
      success: true, 
      deleted: { 
        sessions: sessionsCount, 
        messages: messagesCount, 
        toolCalls: toolCallsCount 
      } 
    });
  })

  .delete('/sessions/old', async (c) => {
    const days = parseInt(c.req.query('days') || '30', 10);
    
    if (isNaN(days) || days < 1) {
      return c.json({ error: 'Invalid days parameter. Must be a positive integer.' }, 400);
    }
    
    const store = await getStorage();
    
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const allSessions = store.sessions.findAll();
    const oldSessions = allSessions.filter(s => s.createdAt < cutoff);
    
    let messagesCount = 0;
    let toolCallsCount = 0;
    
    for (const session of oldSessions) {
      const messages = store.messages.findBySessionId(session.id);
      messagesCount += messages.length;
      for (const msg of messages) {
        const toolCalls = store.toolCalls.findByMessageId(msg.id);
        toolCallsCount += toolCalls.length;
      }
      store.messages.deleteBySessionId(session.id);
    }
    
    const sessionsCount = store.sessions.deleteOlderThan(days);
    
    console.log(`[Session] Cleared sessions older than ${days} days: ${sessionsCount} sessions, ${messagesCount} messages, ${toolCallsCount} tool calls`);
    
    return c.json({ 
      success: true, 
      deleted: { 
        sessions: sessionsCount, 
        messages: messagesCount, 
        toolCalls: toolCallsCount 
      },
      cutoffDate: new Date(cutoff).toISOString()
    });
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
