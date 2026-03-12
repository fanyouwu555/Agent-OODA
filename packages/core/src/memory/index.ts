export * from './short-term';
export * from './long-term';
export * from './embedding';
export * from './persona';
export * from './context-compressor';
export * from './memory-expiration';

import { MemoryManager } from './short-term';
import { LongTermMemory, LongTermMemoryConfig, Memory, MemoryMetadata } from './long-term';
import type { MemoryRepository } from '@ooda-agent/storage';

export interface SessionMemoryConfig {
  memoryRepository: MemoryRepository;
  enableEmbedding?: boolean;
}

export class SessionMemory {
  private shortTerm: MemoryManager;
  private longTerm: LongTermMemory;

  constructor(config: SessionMemoryConfig) {
    this.shortTerm = new MemoryManager();
    this.longTerm = new LongTermMemory({
      repository: config.memoryRepository,
      enableEmbedding: config.enableEmbedding,
    });
  }

  getShortTerm(): MemoryManager {
    return this.shortTerm;
  }

  getLongTerm(): LongTermMemory {
    return this.longTerm;
  }

  async storeFact(content: string, tags: string[] = [], importance: number = 0.7): Promise<string> {
    return this.longTerm.store({
      content,
      embedding: [],
      metadata: {
        type: 'fact',
        source: 'user_input',
        tags: ['fact', ...tags],
        related: [],
      },
      importance,
    });
  }

  async storeExperience(content: string, tags: string[] = [], importance: number = 0.5): Promise<string> {
    return this.longTerm.store({
      content,
      embedding: [],
      metadata: {
        type: 'experience',
        source: 'interaction',
        tags: ['experience', ...tags],
        related: [],
      },
      importance,
    });
  }

  async storeSkill(content: string, tags: string[] = [], importance: number = 0.8): Promise<string> {
    return this.longTerm.store({
      content,
      embedding: [],
      metadata: {
        type: 'skill',
        source: 'learned',
        tags: ['skill', ...tags],
        related: [],
      },
      importance,
    });
  }

  async storePreference(content: string, tags: string[] = [], importance: number = 0.6): Promise<string> {
    return this.longTerm.store({
      content,
      embedding: [],
      metadata: {
        type: 'preference',
        source: 'user_preference',
        tags: ['preference', ...tags],
        related: [],
      },
      importance,
    });
  }

  async recall(query: string, limit: number = 5): Promise<Memory[]> {
    return this.longTerm.search(query, { limit });
  }

  async recallByType(type: MemoryMetadata['type']): Promise<Memory[]> {
    return this.longTerm.findByType(type);
  }

  clear(): void {
    this.shortTerm.clear();
    this.longTerm.clearCache();
  }
}

class SessionMemoryManager {
  private sessions: Map<string, SessionMemory> = new Map();
  private defaultSessionId: string = 'default';
  private memoryRepository: MemoryRepository | null = null;
  private enableEmbedding: boolean = true;

  setMemoryRepository(repository: MemoryRepository, enableEmbedding: boolean = true): void {
    this.memoryRepository = repository;
    this.enableEmbedding = enableEmbedding;
  }

  getMemoryRepository(): MemoryRepository | null {
    return this.memoryRepository;
  }

  getSessionMemory(sessionId?: string): SessionMemory {
    const sid = sessionId || this.defaultSessionId;
    
    if (!this.sessions.has(sid)) {
      if (!this.memoryRepository) {
        throw new Error('MemoryRepository not initialized. Call setMemoryRepository first.');
      }
      
      this.sessions.set(sid, new SessionMemory({
        memoryRepository: this.memoryRepository,
        enableEmbedding: this.enableEmbedding,
      }));
    }
    
    return this.sessions.get(sid)!;
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  clearSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.clear();
    }
    this.sessions.delete(sessionId);
  }

  clearAll(): void {
    for (const session of this.sessions.values()) {
      session.clear();
    }
    this.sessions.clear();
  }

  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }
}

let sessionMemoryManager: SessionMemoryManager | null = null;

export function getSessionMemoryManager(): SessionMemoryManager {
  if (!sessionMemoryManager) {
    sessionMemoryManager = new SessionMemoryManager();
  }
  return sessionMemoryManager;
}

export function initializeMemorySystem(
  memoryRepository: MemoryRepository,
  enableEmbedding: boolean = true
): void {
  const manager = getSessionMemoryManager();
  manager.setMemoryRepository(memoryRepository, enableEmbedding);
}

export function getSessionMemory(sessionId?: string): SessionMemory {
  return getSessionMemoryManager().getSessionMemory(sessionId);
}

export function clearSessionMemory(sessionId: string): void {
  getSessionMemoryManager().clearSession(sessionId);
}

export { SessionMemory as GlobalMemory };
