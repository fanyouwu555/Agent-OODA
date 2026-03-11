import { createSignal, onCleanup } from 'solid-js';
import type { WebSocketMessage, ConfirmationRequest, ToolCall } from '../types';

export interface WebSocketClientOptions {
  url: string;
  onMessage?: (message: WebSocketMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function createWebSocketClient(options: WebSocketClientOptions) {
  const [isConnected, setIsConnected] = createSignal(false);
  const [lastMessage, setLastMessage] = createSignal<WebSocketMessage | null>(null);
  
  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (ws?.readyState === WebSocket.OPEN) return;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = options.url.startsWith('ws') ? options.url : `${protocol}//${window.location.host}${options.url}`;
      
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        setIsConnected(true);
        reconnectAttempts = 0;
        options.onOpen?.();
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        setIsConnected(false);
        options.onClose?.();

        if (options.reconnect && reconnectAttempts < (options.maxReconnectAttempts || 5)) {
          reconnectAttempts++;
          console.log(`[WebSocket] Reconnecting... Attempt ${reconnectAttempts}`);
          reconnectTimeout = setTimeout(connect, options.reconnectInterval || 3000);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        options.onError?.(error);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);
          options.onMessage?.(message);
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e);
        }
      };
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
    }
  };

  const disconnect = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    ws?.close();
    ws = null;
    setIsConnected(false);
  };

  const send = (message: WebSocketMessage) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    console.warn('[WebSocket] Cannot send message - not connected');
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
