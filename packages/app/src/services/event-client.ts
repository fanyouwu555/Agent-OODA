// packages/app/src/services/event-client.ts
// 统一事件客户端 - 替换 WebSocket + SSE 双通道

import { createSignal } from 'solid-js';

// 事件类型定义（与后端 SSEEvent 对应）
export interface FrontendEvent {
  id?: string;
  namespace?: string;
  action?: string;
  sessionId?: string;
  payload?: unknown;
  timestamp?: number;
  // OODA 事件专用字段
  type?: string;
  content?: string;
}

export type OODAEventHandler = (event: { type: string; content?: string }) => void;

export type EventHandler = (event: FrontendEvent) => void;

export interface EventClientOptions {
  baseUrl?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  reconnectInterval?: number;
  autoConnect?: boolean;
}

export function createEventClient(options: EventClientOptions = {}) {
  const [isConnected, setIsConnected] = createSignal(false);
  const [lastEvent, setLastEvent] = createSignal<FrontendEvent | null>(null);
  
  let eventSource: EventSource | null = null;
  let handlers: Map<string, Set<EventHandler>> = new Map();
  let sessionFilter: string | undefined = undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  
  const baseUrl = options.baseUrl || '';
  
  // 事件分发 - 直接处理，不批处理
  const emit = (event: FrontendEvent) => {
    // 精确匹配：namespace.action
    const exactKey = `${event.namespace}.${event.action}`;
    handlers.get(exactKey)?.forEach(handler => handler(event));
    
    // 通配符匹配：namespace.*
    const wildcardKey = `${event.namespace}.*`;
    handlers.get(wildcardKey)?.forEach(handler => handler(event));
    
    // 全局通配符
    handlers.get('*')?.forEach(handler => handler(event));
  };

  // OODA 事件发射器 - 用于 thinking, intent, reasoning, content 等事件
  let oodaHandlers: Map<string, Set<OODAEventHandler>> = new Map();
  
  const emitOODA = (type: string, data: { content?: string }) => {
    const event = { type, ...data };
    oodaHandlers.get(type)?.forEach(handler => handler(event));
    oodaHandlers.get('*')?.forEach(handler => handler(event));
  };
  
  // 连接
  const connect = (sessionId?: string) => {
    // 如果已有连接，先断开
    if (eventSource) {
      eventSource.close();
    }
    
    sessionFilter = sessionId || undefined;
    const url = buildUrl(sessionFilter);
    
    console.log('[EventClient] Connecting to:', url);
    eventSource = new EventSource(url);
    
    eventSource.onopen = () => {
      console.log('[EventClient] Connected');
      setIsConnected(true);
      reconnectAttempts = 0;
      options.onConnect?.();
    };
    
    eventSource.onerror = (error) => {
      console.error('[EventClient] Error:', error);
      setIsConnected(false);
      options.onDisconnect?.();
      
      // 自动重连
      if (options.reconnectInterval && reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log(`[EventClient] Reconnecting in ${options.reconnectInterval}ms (attempt ${reconnectAttempts})`);
        reconnectTimer = setTimeout(() => {
          connect(sessionFilter || undefined);
        }, options.reconnectInterval);
      } else if (reconnectAttempts >= maxReconnectAttempts) {
        options.onError?.(new Error('Max reconnection attempts reached'));
      }
    };
    
    // 监听所有事件
    eventSource.onmessage = (e) => {
      try {
        const event: FrontendEvent = JSON.parse(e.data);
        setLastEvent(event);
        emit(event);
      } catch (err) {
        console.error('[EventClient] Failed to parse event:', err);
      }
    };
    
    // 添加特定事件监听
    eventSource.addEventListener('connected', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        console.log('[EventClient] Server confirmed connection:', data);
      } catch {}
    });
    
    eventSource.addEventListener('heartbeat', (e: MessageEvent) => {
      // 心跳事件，保持连接活跃
      // console.log('[EventClient] Heartbeat');
    });

    // 监听 OODA 流式事件 (thinking, intent, reasoning, content, result 等)
    const oodaEventTypes = ['thinking', 'intent', 'reasoning', 'content', 'tool_call', 'tool_result'];
    oodaEventTypes.forEach(eventType => {
      eventSource!.addEventListener(eventType, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const event = { type: eventType, ...data };
          // 直接处理，不批处理
          setLastEvent(event);
          emit(event);
          emitOODA(eventType, data);
        } catch (err) {
          console.error(`[EventClient] Failed to parse ${eventType} event:`, err);
        }
      });
    });
    
    // result事件直接处理
    eventSource!.addEventListener('result', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const event = { type: 'result', ...data };
        setLastEvent(event);
        emit(event);
        emitOODA('result', data);
      } catch (err) {
        console.error('[EventClient] Failed to parse result event:', err);
      }
    });
    
    // 订阅特定命名空间的事件
    const namespaces = ['session', 'message', 'tool', 'permission', 'agent', 'system'];
    namespaces.forEach(ns => {
      eventSource!.addEventListener(`${ns}.created`, handleNamespaceEvent);
      eventSource!.addEventListener(`${ns}.updated`, handleNamespaceEvent);
      eventSource!.addEventListener(`${ns}.completed`, handleNamespaceEvent);
      eventSource!.addEventListener(`${ns}.failed`, handleNamespaceEvent);
      eventSource!.addEventListener(`${ns}.part`, handleNamespaceEvent);
    });
  };
  
  const handleNamespaceEvent = (e: MessageEvent) => {
    try {
      const event: FrontendEvent = JSON.parse(e.data);
      setLastEvent(event);
      emit(event);
    } catch (err) {
      console.error('[EventClient] Failed to parse namespace event:', err);
    }
  };
  
  // 构建事件源 URL
  const buildUrl = (sessionId?: string) => {
    const url = sessionId 
      ? `${baseUrl}/api/events?session=${encodeURIComponent(sessionId)}`
      : `${baseUrl}/api/events`;
    return url;
  };
  
  // 断开连接
  const disconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    setIsConnected(false);
    console.log('[EventClient] Disconnected');
  };
  
  // 订阅事件
  const on = (eventPattern: string, handler: EventHandler): (() => void) => {
    if (!handlers.has(eventPattern)) {
      handlers.set(eventPattern, new Set());
    }
    handlers.get(eventPattern)!.add(handler);
    
    // 返回取消订阅函数
    return () => handlers.get(eventPattern)?.delete(handler);
  };
  
  // 订阅 OODA 事件
  const onOODA = (eventType: string, handler: OODAEventHandler): (() => void) => {
    if (!oodaHandlers.has(eventType)) {
      oodaHandlers.set(eventType, new Set());
    }
    oodaHandlers.get(eventType)!.add(handler);
    
    return () => oodaHandlers.get(eventType)?.delete(handler);
  };
  
  // 订阅消息片段
  const onMessagePart = (handler: (content: string) => void) => {
    return onOODA('content', (event) => {
      if (event.content) handler(event.content);
    });
  };
  
  // 订阅消息完成
  const onMessageCompleted = (handler: (content: string) => void) => {
    return onOODA('result', (event) => {
      if (event.content) handler(event.content);
    });
  };
  
  // 订阅会话更新
  const onSessionUpdated = (handler: (sessionId: string) => void) => {
    return on('session.*', (event) => {
      if (event.sessionId) handler(event.sessionId);
    });
  };
  
  // 自动连接
  if (options.autoConnect !== false) {
    connect();
  }
  
  return {
    isConnected,
    lastEvent,
    connect,
    disconnect,
    on,
    onOODA,
    onMessagePart,
    onMessageCompleted,
    onSessionUpdated,
  };
}

// 默认客户端实例
let defaultClient: ReturnType<typeof createEventClient> | null = null;

export function getDefaultEventClient(): ReturnType<typeof createEventClient> {
  if (!defaultClient) {
    defaultClient = createEventClient({ autoConnect: false });
  }
  return defaultClient;
}
