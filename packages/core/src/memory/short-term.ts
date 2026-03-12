// packages/core/src/memory/short-term.ts
import { Message } from '../types';

export class ShortTermMemory {
  private messages: Message[] = [];
  private capacity: number;
  
  constructor(capacity: number = 100) {
    this.capacity = capacity;
  }
  
  store(message: Message): void {
    this.messages.push(message);
    
    // 保持容量限制
    if (this.messages.length > this.capacity) {
      this.messages.shift();
    }
  }
  
  getRecent(count: number = 10): Message[] {
    return this.messages.slice(-count);
  }
  
  getRecentMessages(count: number = 10): Message[] {
    return this.messages.slice(-count);
  }
  
  clear(): void {
    this.messages = [];
  }
  
  size(): number {
    return this.messages.length;
  }
}

export class WorkingMemory {
  private context: Record<string, any> = {};
  private timestamp: number;
  
  constructor() {
    this.timestamp = Date.now();
  }
  
  set(key: string, value: any): void {
    this.context[key] = value;
    this.timestamp = Date.now();
  }
  
  get(key: string): any {
    return this.context[key];
  }
  
  has(key: string): boolean {
    return key in this.context;
  }
  
  remove(key: string): void {
    delete this.context[key];
  }
  
  clear(): void {
    this.context = {};
  }
  
  getAge(): number {
    return Date.now() - this.timestamp;
  }
}

export class MemoryManager {
  private shortTerm: ShortTermMemory;
  private working: WorkingMemory;
  
  constructor() {
    this.shortTerm = new ShortTermMemory();
    this.working = new WorkingMemory();
  }
  
  storeMessage(message: Message): void {
    this.shortTerm.store(message);
  }
  
  getRecentMessages(count: number = 10): Message[] {
    return this.shortTerm.getRecent(count);
  }
  
  setContext(key: string, value: any): void {
    this.working.set(key, value);
  }
  
  getContext(key: string): any {
    return this.working.get(key);
  }
  
  clear(): void {
    this.shortTerm.clear();
    this.working.clear();
  }
  
  getStats(): {
    shortTermSize: number;
    workingMemorySize: number;
    workingMemoryAge: number;
  } {
    return {
      shortTermSize: this.shortTerm.size(),
      workingMemorySize: Object.keys(this.working).length,
      workingMemoryAge: this.working.getAge(),
    };
  }
}