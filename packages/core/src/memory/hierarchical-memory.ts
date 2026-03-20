// packages/core/src/memory/hierarchical-memory.ts
// 分层记忆系统 - Working/Episodic/Semantic 三层分离

import { Message } from '../types';
import { getLLMService } from '../llm/service';
import type { MemoryExpirationManager } from './memory-expiration';
import type { CleanupResult } from './memory-expiration';

/**
 * 工作记忆 - 保留最近的关键上下文
 * 类似于大脑的"工作台"
 */
export class HierarchicalWorkingMemory {
  private context: Map<string, any> = new Map();
  private recentIntent: string | null = null;
  private recentActions: Array<{ tool: string; success: boolean }> = [];
  private currentTask: string | null = null;
  
  // 配置
  private readonly MAX_RECENT_ACTIONS = 5;
  
  setIntent(intent: string): void {
    this.recentIntent = intent;
  }
  
  getIntent(): string | null {
    return this.recentIntent;
  }
  
  addAction(tool: string, success: boolean): void {
    this.recentActions.push({ tool, success });
    if (this.recentActions.length > this.MAX_RECENT_ACTIONS) {
      this.recentActions.shift();
    }
  }
  
  getRecentActions(): Array<{ tool: string; success: boolean }> {
    return [...this.recentActions];
  }
  
  setCurrentTask(task: string): void {
    this.currentTask = task;
  }
  
  getCurrentTask(): string | null {
    return this.currentTask;
  }
  
  set(key: string, value: any): void {
    this.context.set(key, value);
  }
  
  get(key: string): any {
    return this.context.get(key);
  }
  
  has(key: string): boolean {
    return this.context.has(key);
  }
  
  clear(): void {
    this.context.clear();
    this.recentIntent = null;
    this.recentActions = [];
    this.currentTask = null;
  }
  
  /**
   * 导出为可序列化的格式
   */
  toJSON(): Record<string, any> {
    return {
      intent: this.recentIntent,
      currentTask: this.currentTask,
      recentActions: this.recentActions,
      contextKeys: Array.from(this.context.keys()),
    };
  }
}

/**
 * 情景记忆 - 压缩后的历史会话
 * 保留关键事件和决策
 */
export interface EpisodicMemoryEntry {
  id: string;
  summary: string;
  timestamp: number;
  keyEvents: string[];
  outcome: 'success' | 'failure' | 'partial';
  tags: string[];
}

export class EpisodicMemory {
  private episodes: EpisodicMemoryEntry[] = [];
  private currentEpisode: EpisodicMemoryEntry | null = null;
  private readonly MAX_EPISODES = 50;
  
  // 开始新的情景片段
  startEpisode(input: string): void {
    this.currentEpisode = {
      id: `ep_${Date.now()}`,
      summary: input.slice(0, 100),
      timestamp: Date.now(),
      keyEvents: [],
      outcome: 'partial',
      tags: [],
    };
  }
  
  // 添加关键事件
  addKeyEvent(event: string): void {
    if (this.currentEpisode) {
      this.currentEpisode.keyEvents.push(event);
    }
  }
  
  // 标记结果
  completeEpisode(outcome: 'success' | 'failure' | 'partial'): void {
    if (this.currentEpisode) {
      this.currentEpisode.outcome = outcome;
      this.episodes.push(this.currentEpisode);
      
      // 限制存储数量
      if (this.episodes.length > this.MAX_EPISODES) {
        this.episodes.shift();
      }
      
      this.currentEpisode = null;
    }
  }
  
  // 获取最近的片段
  getRecentEpisodes(count: number = 5): EpisodicMemoryEntry[] {
    return this.episodes.slice(-count);
  }
  
  // 搜索相关片段
  searchEpisodes(query: string): EpisodicMemoryEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.episodes.filter(ep => 
      ep.summary.toLowerCase().includes(lowerQuery) ||
      ep.keyEvents.some(e => e.toLowerCase().includes(lowerQuery))
    );
  }
  
  // 获取成功/失败的模式
  getPatterns(type: 'success' | 'failure'): string[] {
    const relevantEpisodes = this.episodes.filter(ep => ep.outcome === type);
    return relevantEpisodes.flatMap(ep => ep.keyEvents);
  }
  
  size(): number {
    return this.episodes.length;
  }
  
  clear(): void {
    this.episodes = [];
    this.currentEpisode = null;
  }
  
  toJSON(): EpisodicMemoryEntry[] {
    return this.episodes;
  }
}

/**
 * 语义记忆 - 长期存储的事实、知识和偏好
 * 存储结构化知识
 */
export interface SemanticMemoryEntry {
  id: string;
  type: 'fact' | 'skill' | 'preference' | 'pattern';
  content: string;
  importance: number;
  timestamp: number;
  tags: string[];
  verified: boolean;
}

export class SemanticMemory {
  private memories: SemanticMemoryEntry[] = [];
  private readonly MAX_MEMORIES = 1000;
  
  // 存储新记忆
  store(
    type: SemanticMemoryEntry['type'],
    content: string,
    importance: number = 0.5,
    tags: string[] = []
  ): string {
    const id = `sem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.memories.push({
      id,
      type,
      content,
      importance,
      timestamp: Date.now(),
      tags,
      verified: false,
    });
    
    // 按重要性排序
    this.memories.sort((a, b) => b.importance - a.importance);
    
    // 限制存储数量
    if (this.memories.length > this.MAX_MEMORIES) {
      // 删除最低重要性的
      const toRemove = this.memories.length - this.MAX_MEMORIES;
      this.memories.splice(0, toRemove);
    }
    
    return id;
  }
  
  // 检索记忆
  retrieve(query: string, limit: number = 5): SemanticMemoryEntry[] {
    const lowerQuery = query.toLowerCase();
    
    // 简单的关键词匹配（生产环境应该用embedding）
    const scored = this.memories.map(mem => {
      let score = 0;
      if (mem.content.toLowerCase().includes(lowerQuery)) score += 1;
      if (mem.tags.some(t => lowerQuery.includes(t))) score += 0.5;
      score *= mem.importance;
      return { mem, score };
    });
    
    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, limit).map(s => s.mem);
  }
  
  // 按类型检索
  retrieveByType(type: SemanticMemoryEntry['type']): SemanticMemoryEntry[] {
    return this.memories.filter(m => m.type === type);
  }
  
  // 标记为已验证
  verify(id: string): void {
    const mem = this.memories.find(m => m.id === id);
    if (mem) {
      mem.verified = true;
      mem.importance = Math.min(1, mem.importance + 0.1); // 增加重要性
    }
  }
  
  // 存储技能
  storeSkill(skillContent: string, tags: string[] = []): string {
    return this.store('skill', skillContent, 0.8, tags);
  }
  
  // 存储偏好
  storePreference(preference: string, tags: string[] = []): string {
    return this.store('preference', preference, 0.7, tags);
  }
  
  // 存储模式
  storePattern(pattern: string, tags: string[] = []): string {
    return this.store('pattern', pattern, 0.6, ['pattern', ...tags]);
  }
  
  size(): number {
    return this.memories.length;
  }
  
  clear(): void {
    this.memories = [];
  }
  
  toJSON(): SemanticMemoryEntry[] {
    return this.memories;
  }
}

/**
 * 分层记忆管理器 - 统一接口
 */
export class HierarchicalMemoryManager {
  private working: HierarchicalWorkingMemory;
  private episodic: EpisodicMemory;
  private semantic: SemanticMemory;
  private sessionId: string;
  private expirationManager: MemoryExpirationManager | null = null;
  private lastCleanupTime: number = 0;
  private cleanupThreshold: number = 100; // 每 100 次操作触发一次检查

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.working = new HierarchicalWorkingMemory();
    this.episodic = new EpisodicMemory();
    this.semantic = new SemanticMemory();
  }

  setExpirationManager(manager: MemoryExpirationManager): void {
    this.expirationManager = manager;
  }

  getExpirationManager(): MemoryExpirationManager | null {
    return this.expirationManager;
  }

  private shouldCleanup(): boolean {
    if (!this.expirationManager) return false;
    return this.expirationManager.getConfig().enableAutoCleanup;
  }

  private async triggerCleanupIfNeeded(): Promise<CleanupResult | null> {
    if (!this.shouldCleanup()) return null;

    const now = Date.now();
    const interval = this.expirationManager!.getConfig().cleanupInterval;

    if (now - this.lastCleanupTime >= interval) {
      this.lastCleanupTime = now;
      return this.expirationManager!.cleanup();
    }

    return null;
  }
  
  // ==================== Working Memory API ====================
  setIntent(intent: string): void {
    this.working.setIntent(intent);
  }
  
  getIntent(): string | null {
    return this.working.getIntent();
  }
  
  addAction(tool: string, success: boolean): void {
    this.working.addAction(tool, success);
  }
  
  getRecentActions(): Array<{ tool: string; success: boolean }> {
    return this.working.getRecentActions();
  }
  
  setCurrentTask(task: string): void {
    this.working.setCurrentTask(task);
    // 同时开始新的情景片段
    this.episodic.startEpisode(task);
  }
  
  getCurrentTask(): string | null {
    return this.working.getCurrentTask();
  }
  
  // ==================== Episodic Memory API ====================
  addKeyEvent(event: string): void {
    this.episodic.addKeyEvent(event);
  }
  
  completeEpisode(outcome: 'success' | 'failure' | 'partial'): void {
    this.episodic.completeEpisode(outcome);
  }
  
  getRecentEpisodes(count: number = 5): EpisodicMemoryEntry[] {
    return this.episodic.getRecentEpisodes(count);
  }
  
  searchEpisodes(query: string): EpisodicMemoryEntry[] {
    return this.episodic.searchEpisodes(query);
  }
  
  getSuccessPatterns(): string[] {
    return this.episodic.getPatterns('success');
  }
  
  getFailurePatterns(): string[] {
    return this.episodic.getPatterns('failure');
  }
  
  // ==================== Semantic Memory API ====================
  storeFact(fact: string, tags: string[] = []): string {
    const id = this.semantic.store('fact', fact, 0.7, tags);
    this.triggerCleanupIfNeeded();
    return id;
  }

  storeExperience(
    success: boolean,
    action: string,
    result: string,
    tags: string[] = []
  ): void {
    this.episodic.addKeyEvent(`${action}: ${result}`);
    this.episodic.completeEpisode(success ? 'success' : 'failure');

    if (!success) {
      this.semantic.store(
        'pattern',
        `失败模式: ${action} -> ${result}`,
        0.6,
        ['failure', action, ...tags]
      );
    }

    this.triggerCleanupIfNeeded();
  }
  
  storeSkill(skill: string, tags: string[] = []): string {
    return this.semantic.storeSkill(skill, tags);
  }
  
  storePreference(preference: string, tags: string[] = []): string {
    return this.semantic.storePreference(preference, tags);
  }
  
  storePattern(pattern: string, tags: string[] = []): string {
    return this.semantic.storePattern(pattern, tags);
  }
  
  retrieveMemories(query: string, limit: number = 5): SemanticMemoryEntry[] {
    return this.semantic.retrieve(query, limit);
  }
  
  // ==================== 综合 API ====================
  
  /**
   * 任务完成后的学习
   */
  learnFromResult(
    success: boolean,
    action: string,
    result: string,
    tags: string[] = []
  ): void {
    // 添加到情景记忆
    this.episodic.addKeyEvent(`${action}: ${result}`);
    this.episodic.completeEpisode(success ? 'success' : 'failure');
    
    // 如果失败，存储到语义记忆作为模式
    if (!success) {
      this.storePattern(
        `失败模式: ${action} -> ${result}`,
        ['failure', action, ...tags]
      );
    }
  }
  
  /**
   * 获取决策上下文
   */
  getDecisionContext(): {
    recentActions: Array<{ tool: string; success: boolean }>;
    relevantMemories: SemanticMemoryEntry[];
    successPatterns: string[];
    failurePatterns: string[];
  } {
    return {
      recentActions: this.getRecentActions(),
      relevantMemories: this.retrieveMemories(this.getCurrentTask() || '', 3),
      successPatterns: this.getSuccessPatterns().slice(0, 3),
      failurePatterns: this.getFailurePatterns().slice(0, 3),
    };
  }
  
  /**
   * 清理所有记忆
   */
  clear(): void {
    this.working.clear();
    this.episodic.clear();
    this.semantic.clear();
  }

  /**
   * 手动触发过期清理
   */
  async cleanup(): Promise<CleanupResult | null> {
    if (!this.expirationManager) {
      return null;
    }
    return this.expirationManager.cleanup();
  }

  /**
   * 获取记忆统计信息
   */
  getStats(): {
    workingMemory: number;
    episodicMemory: number;
    semanticMemory: number;
    expirationEnabled: boolean;
    expirationStats: ReturnType<MemoryExpirationManager['getStats']> | null;
  } {
    const expStats = this.expirationManager?.getStats() || null;
    return {
      workingMemory: Object.keys(this.working.toJSON()).length,
      episodicMemory: this.episodic.size(),
      semanticMemory: this.semantic.size(),
      expirationEnabled: this.expirationManager !== null,
      expirationStats: expStats,
    };
  }

  /**
   * 更新过期配置
   */
  updateExpirationConfig(config: Partial<{
    defaultTTL: number;
    maxMemoryCount: number;
    importanceThreshold: number;
    cleanupInterval: number;
    enableAutoCleanup: boolean;
  }>): void {
    if (this.expirationManager) {
      this.expirationManager.updateConfig(config);
    }
  }
  
  /**
   * 导出完整状态
   */
  toJSON(): {
    working: Record<string, any>;
    episodic: EpisodicMemoryEntry[];
    semantic: SemanticMemoryEntry[];
  } {
    return {
      working: this.working.toJSON(),
      episodic: this.episodic.toJSON(),
      semantic: this.semantic.toJSON(),
    };
  }
}

// 全局管理器
const memoryManagers: Map<string, HierarchicalMemoryManager> = new Map();

export function getHierarchicalMemory(sessionId: string): HierarchicalMemoryManager {
  if (!memoryManagers.has(sessionId)) {
    memoryManagers.set(sessionId, new HierarchicalMemoryManager(sessionId));
  }
  return memoryManagers.get(sessionId)!;
}

export function clearHierarchicalMemory(sessionId: string): void {
  memoryManagers.delete(sessionId);
}
