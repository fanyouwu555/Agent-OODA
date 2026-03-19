// packages/core/src/ooda/memory-integrator.ts
// 记忆集成模块 - 将分层记忆系统集成到OODA流程

import { ShortTermMemory } from '../memory/short-term.js';

export interface MemoryContext {
  sessionId: string;
  userId?: string;
  relevantMemories?: any[];
  memoryHint?: string;
}

export interface MemorySearchResult {
  memories: any[];
  searchQuery: string;
  context: MemoryContext;
}

export interface MemoryIntegrationConfig {
  enableLongTermMemory: boolean;
  enableShortTermMemory: boolean;
  maxRelevantMemories: number;
  similarityThreshold: number;
  memoryTypes?: ('fact' | 'experience' | 'skill' | 'preference')[];
}

const DEFAULT_CONFIG: MemoryIntegrationConfig = {
  enableLongTermMemory: true,
  enableShortTermMemory: true,
  maxRelevantMemories: 5,
  similarityThreshold: 0.5,
};

export class MemoryIntegrator {
  private shortTermMemory: ShortTermMemory;
  private longTermMemory: any = null;
  private config: MemoryIntegrationConfig;

  constructor(longTermMemory?: any, config?: Partial<MemoryIntegrationConfig>) {
    this.shortTermMemory = new ShortTermMemory();
    this.longTermMemory = longTermMemory || null;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setLongTermMemory(longTermMemory: any): void {
    this.longTermMemory = longTermMemory;
  }

  async getRelevantMemories(
    query: string,
    context: MemoryContext
  ): Promise<MemorySearchResult> {
    const memories: any[] = [];

    if (this.config.enableShortTermMemory) {
      const shortTermMemories = this.getShortTermMemories(context.sessionId);
      memories.push(...shortTermMemories);
    }

    if (this.config.enableLongTermMemory && this.longTermMemory) {
      try {
        const searchOptions = {
          useVectorSearch: true,
          limit: this.config.maxRelevantMemories,
          threshold: this.config.similarityThreshold,
          types: this.config.memoryTypes,
        };

        const longTermMemories = await this.longTermMemory.search(query, searchOptions);
        memories.push(...longTermMemories);
      } catch (error) {
        console.error('[MemoryIntegrator] Long-term memory search failed:', error);
      }
    }

    return {
      memories,
      searchQuery: query,
      context,
    };
  }

  private getShortTermMemories(sessionId: string): any[] {
    const messages = this.shortTermMemory.getRecent(10);

    return messages.map((msg: any, index: number) => ({
      id: `short-term-${sessionId}-${Date.now()}-${index}`,
      content: `${msg.role}: ${msg.content}`,
      embedding: [],
      metadata: {
        type: 'experience',
        source: 'short-term',
        tags: ['conversation', msg.role],
        related: [],
      },
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      importance: 0.5,
    }));
  }

  buildMemoryPrompt(memories: any[]): string {
    if (memories.length === 0) {
      return '';
    }

    const typeLabels: Record<string, string> = {
      fact: '事实',
      experience: '经验',
      skill: '技能',
      preference: '偏好',
    };

    const memoryDescriptions = memories.map(m => {
      const typeLabel = typeLabels[m.metadata?.type] || '信息';
      return `[${typeLabel}] ${m.content}`;
    });

    return `\n\n[相关记忆]\n${memoryDescriptions.join('\n')}\n[/相关记忆]`;
  }

  async storeUserFact(
    content: string,
    source: string,
    importance: number = 0.5
  ): Promise<string | null> {
    if (!this.longTermMemory) {
      console.warn('[MemoryIntegrator] Long-term memory not available');
      return null;
    }

    try {
      const id = await this.longTermMemory.store({
        content,
        embedding: [],
        metadata: {
          type: 'fact',
          source,
          tags: ['user-fact'],
          related: [],
        },
        importance,
      });

      console.log(`[MemoryIntegrator] Stored user fact: ${id}`);
      return id;
    } catch (error) {
      console.error('[MemoryIntegrator] Failed to store user fact:', error);
      return null;
    }
  }

  async storeExperience(
    content: string,
    source: string,
    importance: number = 0.5
  ): Promise<string | null> {
    if (!this.longTermMemory) {
      console.warn('[MemoryIntegrator] Long-term memory not available');
      return null;
    }

    try {
      const id = await this.longTermMemory.store({
        content,
        embedding: [],
        metadata: {
          type: 'experience',
          source,
          tags: ['experience'],
          related: [],
        },
        importance,
      });

      console.log(`[MemoryIntegrator] Stored experience: ${id}`);
      return id;
    } catch (error) {
      console.error('[MemoryIntegrator] Failed to store experience:', error);
      return null;
    }
  }

  extractAndStoreFacts(input: string, response: string, sessionId: string): void {
    const factPatterns = [
      /(?:我的名字是|我叫|I am|I\'m)\s*([A-Za-z\u4e00-\u9fa5]+)/i,
      /(?:我喜欢|I like|我喜欢)\s*(.+?)(?:\.|$)/i,
      /(?:我是|I'm|I am)\s*(.+?)(?:\.|$)/i,
    ];

    for (const pattern of factPatterns) {
      const match = input.match(pattern);
      if (match) {
        const fact = `${match[1].trim()}`;
        if (fact.length > 2 && fact.length < 100) {
          this.storeUserFact(fact, `session:${sessionId}`, 0.6).catch((err: Error) => {
            console.error('[MemoryIntegrator] Failed to store extracted fact:', err);
          });
        }
      }
    }
  }
}

let globalIntegrator: MemoryIntegrator | null = null;

export function getMemoryIntegrator(): MemoryIntegrator {
  if (!globalIntegrator) {
    globalIntegrator = new MemoryIntegrator();
  }
  return globalIntegrator;
}

export function initializeMemoryIntegrator(longTermMemory: any): MemoryIntegrator {
  globalIntegrator = new MemoryIntegrator(longTermMemory);
  return globalIntegrator;
}
