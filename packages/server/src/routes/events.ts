// packages/server/src/routes/events.ts
// 统一事件流端点 - SSE

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

const sseRoutes = new Hono();

// ============ 简化版 EventBus（内联实现）============

interface SSEEvent {
  id: string;
  namespace: string;
  action: string;
  sessionId?: string;
  payload: unknown;
  timestamp: number;
}

type EventHandler = (event: SSEEvent) => void | Promise<void>;

interface Subscription {
  id: string;
  namespaces: string[];
  sessionId?: string;
  handler: EventHandler;
}

class InlineEventBus {
  private subscriptions: Map<string, Subscription> = new Map();
  private namespaceMap: Map<string, Set<string>> = new Map();
  private sessionMap: Map<string, Set<string>> = new Map();

  subscribe(namespaces: string[], handler: EventHandler, sessionId?: string): string {
    const id = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const sub: Subscription = { id, namespaces, sessionId, handler };
    this.subscriptions.set(id, sub);
    
    for (const ns of namespaces) {
      if (!this.namespaceMap.has(ns)) this.namespaceMap.set(ns, new Set());
      this.namespaceMap.get(ns)!.add(id);
    }
    if (sessionId) {
      if (!this.sessionMap.has(sessionId)) this.sessionMap.set(sessionId, new Set());
      this.sessionMap.get(sessionId)!.add(id);
    }
    return id;
  }

  unsubscribe(id: string): void {
    const sub = this.subscriptions.get(id);
    if (!sub) return;
    for (const ns of sub.namespaces) this.namespaceMap.get(ns)?.delete(id);
    if (sub.sessionId) this.sessionMap.get(sub.sessionId)?.delete(id);
    this.subscriptions.delete(id);
  }

  publish(event: SSEEvent): void {
    const namespaceSubs = this.namespaceMap.get(event.namespace) || [];
    for (const subId of namespaceSubs) {
      const sub = this.subscriptions.get(subId);
      if (!sub) continue;
      if (sub.sessionId && event.sessionId && sub.sessionId !== event.sessionId) continue;
      try { sub.handler(event); } catch (e) { console.error('[EventBus] Error:', e); }
    }
  }

  getSessionCount(sessionId: string): number {
    return this.sessionMap.get(sessionId)?.size || 0;
  }

  getNamespaceCount(ns: string): number {
    return this.namespaceMap.get(ns)?.size || 0;
  }
}

const eventBus = new InlineEventBus();

// ============ SSE 端点实现 =============

/**
 * SSE 事件流端点
 * GET /api/events - 监听所有事件
 * GET /api/events?session=xxx - 只监听特定会话的事件
 */
sseRoutes.get('/', async (c) => {
  const sessionId = c.req.query('session') || undefined;
  
  return streamSSE(c, async (stream) => {
    const namespaces = ['session', 'message', 'tool', 'permission', 'agent', 'system'];
    
    const subscriptionId = eventBus.subscribe(
      namespaces,
      async (event: SSEEvent) => {
        if (sessionId && event.sessionId && event.sessionId !== sessionId) return;
        const eventName = `${event.namespace}.${event.action}`;
        try {
          await stream.writeSSE({ event: eventName, data: JSON.stringify(event) });
        } catch {}
      },
      sessionId
    );
    
    const heartbeat = setInterval(async () => {
      try { await stream.writeSSE({ event: 'heartbeat', data: JSON.stringify({ timestamp: Date.now() }) }); }
      catch { clearInterval(heartbeat); }
    }, 30000);
    
    c.req.raw.signal.addEventListener('abort', () => {
      clearInterval(heartbeat);
      eventBus.unsubscribe(subscriptionId);
    });
    
    await stream.writeSSE({ event: 'connected', data: JSON.stringify({ timestamp: Date.now(), sessionId }) });
  });
});

/**
 * 旧端点兼容
 */
sseRoutes.get('/session/:id/events', async (c) => {
  return c.redirect(`/api/events?session=${c.req.param('id')}`, 302);
});

/**
 * 状态检查
 */
sseRoutes.get('/status', (c) => {
  const sessionId = c.req.query('session');
  return c.json({
    subscribers: {
      session: eventBus.getNamespaceCount('session'),
      message: eventBus.getNamespaceCount('message'),
      tool: eventBus.getNamespaceCount('tool'),
      permission: eventBus.getNamespaceCount('permission'),
      ...(sessionId ? { session: eventBus.getSessionCount(sessionId) } : {}),
    },
  });
});

// 导出供其他地方使用
export { eventBus, SSEEvent };
export default sseRoutes;
