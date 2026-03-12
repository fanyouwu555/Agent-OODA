export interface SessionRecord {
    id: string;
    createdAt: number;
    updatedAt: number;
    metadata?: Record<string, unknown>;
    title?: string;
    summary?: string;
    status?: 'active' | 'archived';
    archivedAt?: number;
}
export interface SessionSearchOptions {
    query?: string;
    status?: 'active' | 'archived' | 'all';
    limit?: number;
    offset?: number;
    orderBy?: 'createdAt' | 'updatedAt';
    orderDirection?: 'asc' | 'desc';
}
export interface MessageRecord {
    id: string;
    sessionId: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: number;
}
export interface ToolCallRecord {
    id: string;
    messageId: string;
    toolName: string;
    args: Record<string, unknown>;
    status: 'running' | 'success' | 'error';
    result?: unknown;
    error?: string;
    startTime: number;
    endTime?: number;
}
export interface MemoryRecord {
    id: string;
    content: string;
    embedding?: number[];
    type: 'fact' | 'experience' | 'skill' | 'preference';
    source: string;
    tags: string[];
    relatedIds: string[];
    importance: number;
    createdAt: number;
    lastAccessed: number;
}
export interface CreateMemoryInput {
    content: string;
    embedding?: number[];
    type: MemoryRecord['type'];
    source: string;
    tags?: string[];
    relatedIds?: string[];
    importance: number;
}
export interface ISessionRepository {
    create(input: {
        id: string;
        metadata?: Record<string, unknown>;
        title?: string;
    }): SessionRecord;
    findById(id: string): SessionRecord | null;
    findAll(options?: SessionSearchOptions): SessionRecord[];
    update(id: string, data: Partial<SessionRecord>): boolean;
    delete(id: string): boolean;
    archive(id: string): boolean;
    restore(id: string): boolean;
    search(query: string, limit?: number): SessionRecord[];
    findByStatus(status: 'active' | 'archived'): SessionRecord[];
    count(): number;
}
export interface IMessageRepository {
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
}
export interface IToolCallRepository {
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
}
export interface IMemoryRepository {
    store(input: CreateMemoryInput): string;
    retrieve(id: string): MemoryRecord | null;
    search(query: string, limit?: number): MemoryRecord[];
    findByType(type: MemoryRecord['type']): MemoryRecord[];
    findAll(limit?: number): MemoryRecord[];
    update(id: string, data: Partial<MemoryRecord>): boolean;
    delete(id: string): boolean;
    deleteLeastImportant(): boolean;
    size(): number;
}
//# sourceMappingURL=types.d.ts.map