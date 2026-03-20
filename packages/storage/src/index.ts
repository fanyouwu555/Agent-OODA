import { DatabaseManager } from './database.js';
import { SessionRepository, MessageRepository, ToolCallRepository, MemoryRepository } from './repositories/index.js';
import { UserRepository, AgentConfigRepository, PermissionConfigRepository } from './repositories/index.js';
export type {
  SessionRecord,
  MessageRecord,
  ToolCallRecord,
  MemoryRecord,
  CreateMemoryInput,
  UserRecord,
  ISessionRepository,
  IMessageRepository,
  IToolCallRepository,
  IMemoryRepository,
  IUserRepository,
} from './types.js';

export {
  SessionRepository,
  MessageRepository,
  ToolCallRepository,
  MemoryRepository,
  UserRepository,
  AgentConfigRepository,
  PermissionConfigRepository,
};

export async function createStorage(dbPath: string) {
  const manager = new DatabaseManager(dbPath);
  await manager.initialize();

  return {
    manager,
    sessions: new SessionRepository(manager),
    messages: new MessageRepository(manager),
    toolCalls: new ToolCallRepository(manager),
    memories: new MemoryRepository(manager),
    users: new UserRepository(manager),
    agentConfigs: new AgentConfigRepository(manager),
    permissionConfigs: new PermissionConfigRepository(manager),
    close: () => manager.close(),
  };
}

export { DatabaseManager };
