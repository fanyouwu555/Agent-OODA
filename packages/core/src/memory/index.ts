// packages/core/src/memory/index.ts
export * from './short-term';
export * from './long-term';

import { MemoryManager } from './short-term';
import { LongTermMemory } from './long-term';

class GlobalMemory {
  private shortTerm: MemoryManager;
  private longTerm: LongTermMemory;
  
  constructor() {
    this.shortTerm = new MemoryManager();
    this.longTerm = new LongTermMemory();
  }
  
  getShortTerm(): MemoryManager {
    return this.shortTerm;
  }
  
  getLongTerm(): LongTermMemory {
    return this.longTerm;
  }
  
  clear(): void {
    this.shortTerm.clear();
    this.longTerm.clear();
  }
}

// 全局记忆实例
let globalMemory: GlobalMemory | null = null;

export function getMemory(): GlobalMemory {
  if (!globalMemory) {
    globalMemory = new GlobalMemory();
  }
  return globalMemory;
}

export function setMemory(memory: GlobalMemory): void {
  globalMemory = memory;
}