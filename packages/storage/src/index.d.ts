import { DatabaseManager } from './database.js';
import { SessionRepository, MessageRepository, ToolCallRepository, MemoryRepository } from './repositories/index.js';
export type { SessionRecord, MessageRecord, ToolCallRecord, MemoryRecord, CreateMemoryInput, ISessionRepository, IMessageRepository, IToolCallRepository, IMemoryRepository, } from './types.js';
export { SessionRepository, MessageRepository, ToolCallRepository, MemoryRepository };
export declare function createStorage(dbPath: string): Promise<{
    manager: DatabaseManager;
    sessions: SessionRepository;
    messages: MessageRepository;
    toolCalls: ToolCallRepository;
    memories: MemoryRepository;
    close: () => void;
}>;
export { DatabaseManager };
//# sourceMappingURL=index.d.ts.map