import type { DatabaseManager } from '../database.js';
import type { SessionRecord, MessageRecord, ToolCallRecord, MemoryRecord, CreateMemoryInput } from '../types.js';
export declare class SessionRepository {
    private db;
    constructor(db: DatabaseManager);
    create(input: {
        id: string;
        metadata?: Record<string, unknown>;
        title?: string;
    }): SessionRecord;
    findById(id: string): SessionRecord | null;
    findAll(): SessionRecord[];
    update(id: string, data: Partial<SessionRecord>): boolean;
    delete(id: string): boolean;
    archive(id: string): boolean;
    restore(id: string): boolean;
    search(query: string, limit?: number): SessionRecord[];
    findByStatus(status: 'active' | 'archived'): SessionRecord[];
    count(): number;
    deleteAll(): number;
    deleteByStatus(status: 'active' | 'archived'): number;
    deleteOlderThan(days: number): number;
    deleteArchivedOlderThan(days: number): number;
    findAllWithMessageCount(status?: 'active' | 'archived'): Array<SessionRecord & {
        messageCount: number;
        lastMessageAt: number | null;
        firstMessageContent?: string;
    }>;
}
export declare class MessageRepository {
    private db;
    constructor(db: DatabaseManager);
    create(input: {
        id: string;
        sessionId: string;
        role: string;
        content: string;
        timestamp: number;
    }): MessageRecord;
    findById(id: string): MessageRecord | null;
    findBySessionId(sessionId: string, limit?: number): MessageRecord[];
    deleteBySessionId(sessionId: string): boolean;
    deleteAll(): number;
    count(): number;
    private mapRow;
}
export declare class ToolCallRepository {
    private db;
    constructor(db: DatabaseManager);
    create(input: {
        id: string;
        messageId: string;
        toolName: string;
        args: Record<string, unknown>;
        status: string;
        result?: unknown;
        error?: string;
        startTime: number;
        endTime?: number;
    }): ToolCallRecord;
    findById(id: string): ToolCallRecord | null;
    findByMessageId(messageId: string): ToolCallRecord[];
    update(id: string, data: Partial<ToolCallRecord>): boolean;
    deleteAll(): number;
    count(): number;
    private mapRow;
}
export declare class MemoryRepository {
    private db;
    constructor(db: DatabaseManager);
    store(input: CreateMemoryInput): string;
    retrieve(id: string): MemoryRecord | null;
    search(query: string, limit?: number): MemoryRecord[];
    findByType(type: MemoryRecord['type']): MemoryRecord[];
    findAll(limit?: number): MemoryRecord[];
    update(id: string, data: Partial<MemoryRecord>): boolean;
    delete(id: string): boolean;
    deleteLeastImportant(): boolean;
    size(): number;
    private mapRow;
}
//# sourceMappingURL=index.d.ts.map