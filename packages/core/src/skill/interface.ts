// packages/core/src/skill/interface.ts
import { Tool, ExecutionContext } from '../types';

export interface Skill extends Tool {
  category: string;
  version: string;
  dependencies: string[];
  
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface SkillContext extends ExecutionContext {
  skillRegistry: SkillRegistry;
  mcp: MCPService;
}

export interface SkillRegistry {
  register(skill: Skill): void;
  get(name: string): Skill | undefined;
  list(): Skill[];
  execute(name: string, input: unknown, context: SkillContext): Promise<unknown>;
}

export interface MCPService {
  send(message: MCPMessage): Promise<void>;
  subscribe(topic: string, handler: (message: MCPMessage) => void): string;
  unsubscribe(subscriptionId: string): void;
  request(topic: string, payload: unknown): Promise<unknown>;
  publishEvent(topic: string, payload: unknown): Promise<void>;
  publishStatus(topic: string, payload: unknown): Promise<void>;
  publishError(topic: string, error: Error): Promise<void>;
}

export interface MCPMessage {
  id: string;
  type: 'command' | 'status' | 'event' | 'error';
  topic: string;
  payload: unknown;
  timestamp: number;
}
