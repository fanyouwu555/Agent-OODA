// packages/app/src/services/event-client.ts
// 统一事件客户端 - 替换 WebSocket + SSE 双通道

import { createSignal, onCleanup } from 'solid-js';

// 事件类型定义（与后端 SSEEvent 对应）
export interface FrontendEvent {
  id: string;
  namespace: string;
  action: string;
  sessionId?: string;
  payload: unknown;
  timestamp: number;
}

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
  
  // 构建事件源 URL
  const buildUrl = (sessionId?: string) => {
    const url = sessionId 
      ? `${baseUrl}/api/events?session=${encodeURIComponent(sessionId)}`
      : `${baseUrl}/api/events`;
    return url;
  };
  
  // 事件分发
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
  
  // 便捷订阅方法
  const onMessagePart = (handler: (payload: { part: string; index: number; totalLength: number; isComplete: boolean }) => void) => {
    return on('message.part', (event) => handler(event.payload as any));
  };
  
  const onMessageCompleted = (handler: (payload: { messageId: string; fullContent: string }) => void) => {
    return on('message.completed', (event) => handler(event.payload as any));
  };
  
  const onPermissionAsked = (handler: (payload: { confirmationId: string; toolName: string; args: unknown }) => void) => {
    return on('permission.asked', (event) => handler(event.payload as any));
  };
  
  const onToolCall = (handler: (payload: { toolId: string; toolName: string; status: string }) => void) => {
    return on('tool.call', (event) => handler(event.payload as any));
  };
  
  const onToolResult = (handler: (payload: { toolId: string; toolName: string; result: unknown; error?: string }) => void) => {
    return on('tool.result', (event) => handler(event.payload as any));
  };
  
  const onSessionUpdated = (handler: (payload: { sessionId: string; messages?: unknown[] }) => void) => {
    return on('session.updated', (event) => handler(event.payload as any));
  };
  
  // 自动连接（如果启用）
  if (options.autoConnect !== false) {
    // 延迟连接，确保 DOM 准备好
    setTimeout(() => connect(), 100);
  }
  
  return {
    // 状态
    isConnected,
    lastEvent,
    
    // 连接管理
    connect,
    disconnect,
    
    // 订阅
    on,
    
    // 便捷方法
    onMessagePart,
    onMessageCompleted,
    onPermissionAsked,
    onToolCall,
    onToolResult,
    onSessionUpdated,
  };
}

// 导出类型
export type EventClient = ReturnType<typeof createEventClient>;
