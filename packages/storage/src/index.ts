import { DatabaseManager } from './database';
import { SessionRepository, MessageRepository, ToolCallRepository, MemoryRepository } from './repositories';
export type {
  SessionRecord,
  MessageRecord,
  ToolCallRecord,
  MemoryRecord,
  CreateMemoryInput,
  ISessionRepository,
  IMessageRepository,
  IToolCallRepository,
  IMemoryRepository,
} from './types';

export async function createStorage(dbPath: string) {
  const manager = new DatabaseManager(dbPath);
  await manager.initialize();
  
  return {
    manager,
    sessions: new SessionRepository(manager),
    messages: new MessageRepository(manager),
    toolCalls: new ToolCallRepository(manager),
    memories: new MemoryRepository(manager),
    close: () => manager.close(),
  };
}

export { DatabaseManager };
