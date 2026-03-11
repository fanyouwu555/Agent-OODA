// packages/core/src/mcp/message.ts
import { MCPMessage } from '../skill/interface';

export class MCPMessageImpl implements MCPMessage {
  id: string;
  type: 'command' | 'status' | 'event' | 'error';
  topic: string;
  payload: unknown;
  timestamp: number;
  
  constructor({
    type,
    topic,
    payload,
    id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp = Date.now(),
  }: {
    type: 'command' | 'status' | 'event' | 'error';
    topic: string;
    payload: unknown;
    id?: string;
    timestamp?: number;
  }) {
    this.id = id;
    this.type = type;
    this.topic = topic;
    this.payload = payload;
    this.timestamp = timestamp;
  }
}

export function createMessage(options: {
  type: 'command' | 'status' | 'event' | 'error';
  topic: string;
  payload: unknown;
  id?: string;
}): MCPMessage {
  return new MCPMessageImpl(options);
}