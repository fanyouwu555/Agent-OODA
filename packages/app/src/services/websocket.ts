import { createSignal, onCleanup } from 'solid-js';
import type { WebSocketMessage, ConfirmationRequest, ToolCall } from '../types';
import { logger } from './api';

export interface WebSocketClientOptions {
  url: string;
  onMessage?: (message: WebSocketMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

export function createWebSocketClient(options: WebSocketClientOptions) {
  const [isConnected, setIsConnected] = createSignal(false);
  const [lastMessage, setLastMessage] = createSignal<WebSocketMessage | null>(null);
  
  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const startHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    const interval = options.heartbeatInterval || 25000;
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        const pingMessage = { type: 'ping' };
        ws.send(JSON.stringify(pingMessage));
        logger.websocket('send', { type: 'ping' });
      }
    }, interval);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const connect = () => {
    if (ws?.readyState === WebSocket.OPEN) return;

    try {
      // 使用当前页面的host和端口
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.hostname;
      const wsPort = window.location.port || '3000';
      const wsUrl = options.url.startsWith('ws') 
        ? options.url 
        : `${protocol}//${wsHost}:${wsPort}${options.url}`;
      
      logger.websocket('connect', { url: wsUrl });
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        logger.websocket('connect', { url: wsUrl, status: 'connected' });
        setIsConnected(true);
        reconnectAttempts = 0;
        startHeartbeat();
        options.onOpen?.();
      };

      ws.onclose = (event) => {
        logger.websocket('disconnect', { 
          url: wsUrl, 
          code: event.code, 
          reason: event.reason,
          wasClean: event.wasClean 
        });
        const wasConnected = isConnected();
        setIsConnected(false);
        stopHeartbeat();
        
        if (wasConnected) {
          options.onClose?.();
        }

        if (options.reconnect && reconnectAttempts < (options.maxReconnectAttempts || 5)) {
          reconnectAttempts++;
          logger.websocket('connect', { 
            url: wsUrl, 
            status: 'reconnecting', 
            attempt: reconnectAttempts 
          });
          reconnectTimeout = setTimeout(connect, options.reconnectInterval || 3000);
        }
      };

      ws.onerror = (error) => {
        logger.websocket('error', { url: wsUrl, error: 'WebSocket error occurred' });
        options.onError?.(error);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          // Don't log ping/pong messages to reduce noise
          if (message.type === 'pong') {
            return;
          }
          
          logger.websocket('receive', { 
            type: message.type, 
            payload: message.payload 
          });
          
          setLastMessage(message);
          options.onMessage?.(message);
        } catch (e) {
          logger.websocket('error', { 
            url: wsUrl, 
            error: 'Failed to parse message', 
            data: event.data?.substring(0, 200) 
          });
        }
      };
    } catch (error) {
      logger.websocket('error', { 
        url: options.url, 
        error: error instanceof Error ? error.message : 'Connection failed' 
      });
    }
  };

  const disconnect = () => {
    stopHeartbeat();
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    ws?.close();
    ws = null;
    setIsConnected(false);
    logger.websocket('disconnect', { status: 'manual' });
  };

  const send = (message: WebSocketMessage) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      logger.websocket('send', message);
      return true;
    }
    logger.websocket('error', { 
      error: 'Cannot send message - not connected',
      messageType: message.type 
    });
    return false;
  };

  const confirmPermission = (id: string, allowed: boolean) => {
    return send({
      type: 'confirmation',
      payload: { id, allowed }
    });
  };

  onCleanup(() => {
    disconnect();
  });

  return {
    isConnected,
    lastMessage,
    connect,
    disconnect,
    send,
    confirmPermission
  };
}

export type WebSocketClient = ReturnType<typeof createWebSocketClient>;
