// packages/core/src/memory/long-term.ts
import { z } from 'zod';

export interface Memory {
  id: string;
  content: string;
  embedding: number[];
  metadata: MemoryMetadata;
  createdAt: number;
  lastAccessed: number;
  importance: number;
}

export interface MemoryMetadata {
  type: 'fact' | 'experience' | 'skill' | 'preference';
  source: string;
  tags: string[];
  related: string[];
}

export class LongTermMemory {
  private memories: Map<string, Memory> = new Map();
  private capacity: number;
  
  constructor(capacity: number = 1000) {
    this.capacity = capacity;
  }
  
  store(memory: Omit<Memory, 'id' | 'createdAt' | 'lastAccessed'>): string {
    const id = `memory-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newMemory: Memory = {
      ...memory,
      id,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
    };
    
    this.memories.set(id, newMemory);
    
    // 保持容量限制
    if (this.memories.size > this.capacity) {
      this.evictLeastImportant();
    }
    
    return id;
  }
  
  retrieve(id: string): Memory | undefined {
    const memory = this.memories.get(id);
    if (memory) {
      memory.lastAccessed = Date.now();
    }
    return memory;
  }
  
  search(query: string, limit: number = 5): Memory[] {
    // 简单的基于关键词的搜索
    // 实际项目中应该使用向量搜索
    const results: Memory[] = [];
    
    for (const memory of this.memories.values()) {
      if (memory.content.toLowerCase().includes(query.toLowerCase())) {
        results.push(memory);
        if (results.length >= limit) break;
      }
    }
    
    // 按重要性和最近访问时间排序
    return results.sort((a, b) => {
      const scoreA = a.importance * 0.7 + (Date.now() - a.lastAccessed) * 0.3;
      const scoreB = b.importance * 0.7 + (Date.now() - b.lastAccessed) * 0.3;
      return scoreB - scoreA;
    });
  }
  
  update(id: string, updates: Partial<Memory>): boolean {
    const memory = this.memories.get(id);
    if (!memory) return false;
    
    this.memories.set(id, {
      ...memory,
      ...updates,
      lastAccessed: Date.now(),
    });
    
    return true;
  }
  
  delete(id: string): boolean {
    return this.memories.delete(id);
  }
  
  private evictLeastImportant(): void {
    // 移除最不重要的记忆
    let leastImportant: Memory | null = null;
    
    for (const memory of this.memories.values()) {
      if (!leastImportant || 
          memory.importance < leastImportant.importance ||
          (memory.importance === leastImportant.importance && 
           memory.lastAccessed < leastImportant.lastAccessed)) {
        leastImportant = memory;
      }
    }
    
    if (leastImportant) {
      this.memories.delete(leastImportant.id);
    }
  }
  
  size(): number {
    return this.memories.size;
  }
  
  clear(): void {
    this.memories.clear();
  }
}

// 记忆压缩和摘要
export class MemoryCompressor {
  static compress(memories: Memory[], maxTokens: number = 1000): Memory {
    // 简单的压缩逻辑
    const combinedContent = memories.map(m => m.content).join('\n');
    
    // 实际项目中应该使用LLM进行摘要
    const compressedContent = combinedContent.length > maxTokens * 4 
      ? combinedContent.substring(0, maxTokens * 4) + '...' 
      : combinedContent;
    
    return {
      id: `compressed-${Date.now()}`,
      content: compressedContent,
      embedding: [], // 实际项目中应该生成嵌入
      metadata: {
        type: 'experience',
        source: 'compression',
        tags: ['compressed'],
        related: memories.map(m => m.id),
      },
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      importance: memories.reduce((sum, m) => sum + m.importance, 0) / memories.length,
    };
  }
}