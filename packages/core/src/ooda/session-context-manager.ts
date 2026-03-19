// 会话上下文管理器
// 解决会话上下文丢失问题

import { EventEmitter } from 'events';
import { HierarchicalMemoryManager } from '../memory/hierarchical-memory.js';

export interface SessionContext {
  sessionId: string;
  createdAt: number;
  lastAccessedAt: number;
  turnCount: number;
  intentHistory: string[];
  toolHistory: Array<{
    tool: string;
    timestamp: number;
    success: boolean;
    result?: any;
  }>;
  messageHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
  }>;
  workingMemory: Record<string, any>;
  metadata: Record<string, any>;
}

export interface ContextUpdate {
  type: 'intent' | 'tool' | 'message' | 'memory' | 'metadata';
  data: any;
  timestamp: number;
}

export class SessionContextManager extends EventEmitter {
  private sessions: Map<string, SessionContext> = new Map();
  private memoryManagers: Map<string, HierarchicalMemoryManager> = new Map();
  private readonly MAX_SESSION_AGE_MS = 30 * 60 * 1000;
  private readonly MAX_HISTORY_SIZE = 100;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startCleanupTimer();
  }

  createSession(sessionId: string): SessionContext {
    const context: SessionContext = {
      sessionId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      turnCount: 0,
      intentHistory: [],
      toolHistory: [],
      messageHistory: [],
      workingMemory: {},
      metadata: {}
    };

    this.sessions.set(sessionId, context);
    this.memoryManagers.set(sessionId, new HierarchicalMemoryManager(sessionId));

    this.emit('session:created', { sessionId });
    return context;
  }

  getSession(sessionId: string): SessionContext | null {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccessedAt = Date.now();
    }
    return session || null;
  }

  getOrCreateSession(sessionId: string): SessionContext {
    return this.getSession(sessionId) || this.createSession(sessionId);
  }

  updateContext(sessionId: string, update: ContextUpdate): void {
    const session = this.getOrCreateSession(sessionId);

    switch (update.type) {
      case 'intent':
        session.intentHistory.push(update.data);
        if (session.intentHistory.length > this.MAX_HISTORY_SIZE) {
          session.intentHistory.shift();
        }
        break;

      case 'tool':
        session.toolHistory.push({
          tool: update.data.tool,
          timestamp: update.timestamp,
          success: update.data.success,
          result: update.data.result
        });
        if (session.toolHistory.length > this.MAX_HISTORY_SIZE) {
          session.toolHistory.shift();
        }
        break;

      case 'message':
        session.messageHistory.push({
          role: update.data.role,
          content: update.data.content,
          timestamp: update.timestamp
        });
        if (session.messageHistory.length > this.MAX_HISTORY_SIZE) {
          session.messageHistory.shift();
        }
        break;

      case 'memory':
        session.workingMemory[update.data.key] = update.data.value;
        break;

      case 'metadata':
        session.metadata = { ...session.metadata, ...update.data };
        break;
    }

    session.lastAccessedAt = Date.now();
    this.emit('context:updated', { sessionId, update });
  }

  incrementTurn(sessionId: string): number {
    const session = this.getOrCreateSession(sessionId);
    session.turnCount++;
    return session.turnCount;
  }

  getRecentIntents(sessionId: string, count: number = 5): string[] {
    const session = this.getSession(sessionId);
    if (!session) return [];
    return session.intentHistory.slice(-count);
  }

  getRecentTools(sessionId: string, count: number = 10): SessionContext['toolHistory'] {
    const session = this.getSession(sessionId);
    if (!session) return [];
    return session.toolHistory.slice(-count);
  }

  getRecentMessages(sessionId: string, count: number = 10): SessionContext['messageHistory'] {
    const session = this.getSession(sessionId);
    if (!session) return [];
    return session.messageHistory.slice(-count);
  }

  getWorkingMemory(sessionId: string): Record<string, any> {
    const session = this.getSession(sessionId);
    return session?.workingMemory || {};
  }

  setWorkingMemory(sessionId: string, key: string, value: any): void {
    const session = this.getOrCreateSession(sessionId);
    session.workingMemory[key] = value;
    this.updateContext(sessionId, {
      type: 'memory',
      data: { key, value },
      timestamp: Date.now()
    });
  }

  getMemoryManager(sessionId: string): HierarchicalMemoryManager | null {
    return this.memoryManagers.get(sessionId) || null;
  }

  getConversationHistory(sessionId: string, maxLength?: number): Array<{ role: string; content: string }> {
    const session = this.getSession(sessionId);
    if (!session) return [];

    let history = session.messageHistory.map(m => ({
      role: m.role,
      content: m.content
    }));

    if (maxLength) {
      history = history.slice(-maxLength);
    }

    return history;
  }

  addUserMessage(sessionId: string, content: string): void {
    this.updateContext(sessionId, {
      type: 'message',
      data: { role: 'user', content },
      timestamp: Date.now()
    });
  }

  addAssistantMessage(sessionId: string, content: string): void {
    this.updateContext(sessionId, {
      type: 'message',
      data: { role: 'assistant', content },
      timestamp: Date.now()
    });
  }

  recordToolExecution(
    sessionId: string,
    tool: string,
    success: boolean,
    result?: any
  ): void {
    this.updateContext(sessionId, {
      type: 'tool',
      data: { tool, success, result },
      timestamp: Date.now()
    });
  }

  getSessionSummary(sessionId: string): {
    sessionId: string;
    age: number;
    turnCount: number;
    intentCount: number;
    toolCount: number;
    messageCount: number;
    lastActivity: string;
  } | null {
    const session = this.getSession(sessionId);
    if (!session) return null;

    return {
      sessionId: session.sessionId,
      age: Date.now() - session.createdAt,
      turnCount: session.turnCount,
      intentCount: session.intentHistory.length,
      toolCount: session.toolHistory.length,
      messageCount: session.messageHistory.length,
      lastActivity: new Date(session.lastAccessedAt).toISOString()
    };
  }

  getActiveSessions(): SessionContext[] {
    return Array.from(this.sessions.values()).filter(
      s => Date.now() - s.lastAccessedAt < this.MAX_SESSION_AGE_MS
    );
  }

  deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    this.memoryManagers.delete(sessionId);
    if (deleted) {
      this.emit('session:deleted', { sessionId });
    }
    return deleted;
  }

  private startCleanupTimer(): void {
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, 5 * 60 * 1000);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastAccessedAt > this.MAX_SESSION_AGE_MS) {
        toDelete.push(sessionId);
      }
    }

    for (const sessionId of toDelete) {
      this.deleteSession(sessionId);
    }

    if (toDelete.length > 0) {
      this.emit('sessions:cleaned', { deletedCount: toDelete.length });
    }
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  exportSession(sessionId: string): string | null {
    const session = this.getSession(sessionId);
    if (!session) return null;

    const memoryManager = this.memoryManagers.get(sessionId);

    return JSON.stringify({
      session,
      hierarchicalMemory: memoryManager?.toJSON()
    }, null, 2);
  }

  importSession(sessionId: string, data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      const session: SessionContext = {
        ...parsed.session,
        lastAccessedAt: Date.now()
      };

      this.sessions.set(sessionId, session);

      if (parsed.hierarchicalMemory) {
        const memoryManager = new HierarchicalMemoryManager(sessionId);
        this.memoryManagers.set(sessionId, memoryManager);
      }

      this.emit('session:imported', { sessionId });
      return true;
    } catch (error) {
      this.emit('error', { sessionId, error });
      return false;
    }
  }
}

export const globalSessionContextManager = new SessionContextManager();
