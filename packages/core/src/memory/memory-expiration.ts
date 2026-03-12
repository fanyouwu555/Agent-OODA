// packages/core/src/memory/memory-expiration.ts
import type { MemoryRepository, MemoryRecord } from '@ooda-agent/storage';

export interface ExpirationConfig {
  // 默认记忆存活时间（毫秒）
  defaultTTL: number;
  // 最大记忆数量
  maxMemoryCount: number;
  // 重要性阈值，低于此值的记忆会被优先清理
  importanceThreshold: number;
  // 访问次数阈值，低于此值的记忆会被优先清理
  minAccessCount: number;
  // 自动清理间隔（毫秒）
  cleanupInterval: number;
  // 是否启用自动清理
  enableAutoCleanup: boolean;
}

export interface MemoryStats {
  totalCount: number;
  byType: Record<string, number>;
  averageImportance: number;
  oldestMemory: number;
  totalSize: number;
}

export interface CleanupResult {
  deleted: number;
  archived: number;
  errors: string[];
}

export class MemoryExpirationManager {
  private repository: MemoryRepository;
  private config: ExpirationConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(repository: MemoryRepository, config: Partial<ExpirationConfig> = {}) {
    this.repository = repository;
    this.config = {
      defaultTTL: 30 * 24 * 60 * 60 * 1000, // 30 天
      maxMemoryCount: 10000,
      importanceThreshold: 0.3,
      minAccessCount: 1,
      cleanupInterval: 24 * 60 * 60 * 1000, // 24 小时
      enableAutoCleanup: true,
      ...config,
    };

    if (this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * 启动自动清理定时器
   */
  startAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);

    console.log('[MemoryExpiration] Auto cleanup started, interval:', this.config.cleanupInterval);
  }

  /**
   * 停止自动清理
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('[MemoryExpiration] Auto cleanup stopped');
    }
  }

  /**
   * 执行清理操作
   */
  async cleanup(): Promise<CleanupResult> {
    const result: CleanupResult = {
      deleted: 0,
      archived: 0,
      errors: [],
    };

    try {
      // 1. 清理过期记忆
      const expiredCount = await this.cleanupExpired();
      result.deleted += expiredCount;

      // 2. 清理低重要性记忆
      const lowImportanceCount = await this.cleanupLowImportance();
      result.deleted += lowImportanceCount;

      // 3. 清理不活跃记忆
      const inactiveCount = await this.cleanupInactive();
      result.deleted += inactiveCount;

      // 4. 如果记忆数量仍然过多，清理最旧的记忆
      const overflowCount = await this.cleanupOverflow();
      result.deleted += overflowCount;

      console.log(`[MemoryExpiration] Cleanup completed: ${result.deleted} deleted, ${result.archived} archived`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(errorMsg);
      console.error('[MemoryExpiration] Cleanup error:', error);
    }

    return result;
  }

  /**
   * 清理过期记忆
   */
  private async cleanupExpired(): Promise<number> {
    const allMemories = this.getAllMemories();
    const now = Date.now();
    let deleted = 0;

    for (const memory of allMemories) {
      const age = now - memory.createdAt;
      const ttl = this.getTTL(memory);

      if (age > ttl) {
        try {
          this.repository.delete(memory.id);
          deleted++;
        } catch (error) {
          console.error(`[MemoryExpiration] Failed to delete memory ${memory.id}:`, error);
        }
      }
    }

    if (deleted > 0) {
      console.log(`[MemoryExpiration] Cleaned up ${deleted} expired memories`);
    }

    return deleted;
  }

  /**
   * 清理低重要性记忆
   */
  private async cleanupLowImportance(): Promise<number> {
    const allMemories = this.getAllMemories();
    let deleted = 0;

    for (const memory of allMemories) {
      // 重要性低且访问次数少的记忆
      const accessCount = (memory as {accessCount?: number}).accessCount || 0;
      if (memory.importance < this.config.importanceThreshold && 
          accessCount < this.config.minAccessCount) {
        // 检查记忆年龄，保留较新的
        const age = Date.now() - memory.createdAt;
        if (age > 7 * 24 * 60 * 60 * 1000) { // 7 天以上
          try {
            this.repository.delete(memory.id);
            deleted++;
          } catch (error) {
            console.error(`[MemoryExpiration] Failed to delete memory ${memory.id}:`, error);
          }
        }
      }
    }

    if (deleted > 0) {
      console.log(`[MemoryExpiration] Cleaned up ${deleted} low importance memories`);
    }

    return deleted;
  }

  /**
   * 清理不活跃记忆
   */
  private async cleanupInactive(): Promise<number> {
    const allMemories = this.getAllMemories();
    const now = Date.now();
    let deleted = 0;

    // 30 天未访问的记忆
    const inactiveThreshold = 30 * 24 * 60 * 60 * 1000;

    for (const memory of allMemories) {
      const inactiveTime = now - memory.lastAccessed;
      
      if (inactiveTime > inactiveThreshold && memory.importance < 0.5) {
        try {
          this.repository.delete(memory.id);
          deleted++;
        } catch (error) {
          console.error(`[MemoryExpiration] Failed to delete memory ${memory.id}:`, error);
        }
      }
    }

    if (deleted > 0) {
      console.log(`[MemoryExpiration] Cleaned up ${deleted} inactive memories`);
    }

    return deleted;
  }

  /**
   * 清理超出数量限制的记忆
   */
  private async cleanupOverflow(): Promise<number> {
    const allMemories = this.getAllMemories();

    if (allMemories.length <= this.config.maxMemoryCount) {
      return 0;
    }

    // 按重要性、访问时间排序，删除最不重要的
    const sorted = allMemories.sort((a, b) => {
      const accessCountA = (a as {accessCount?: number}).accessCount || 0;
      const accessCountB = (b as {accessCount?: number}).accessCount || 0;
      const scoreA = a.importance * 0.6 + (accessCountA * 0.1) + (a.lastAccessed / Date.now() * 0.3);
      const scoreB = b.importance * 0.6 + (accessCountB * 0.1) + (b.lastAccessed / Date.now() * 0.3);
      return scoreA - scoreB;
    });

    const toDelete = sorted.slice(0, allMemories.length - this.config.maxMemoryCount);
    let deleted = 0;

    for (const memory of toDelete) {
      try {
        this.repository.delete(memory.id);
        deleted++;
      } catch (error) {
        console.error(`[MemoryExpiration] Failed to delete memory ${memory.id}:`, error);
      }
    }

    if (deleted > 0) {
      console.log(`[MemoryExpiration] Cleaned up ${deleted} overflow memories`);
    }

    return deleted;
  }

  /**
   * 获取记忆的 TTL
   */
  private getTTL(memory: MemoryRecord): number {
    // 根据重要性调整 TTL
    const importanceMultiplier = memory.importance;
    return this.config.defaultTTL * (0.5 + importanceMultiplier);
  }

  /**
   * 获取所有记忆
   */
  private getAllMemories(): MemoryRecord[] {
    // 这里假设 repository 有 findAll 方法
    // 如果没有，需要通过其他方式获取
    if ('findAll' in this.repository) {
      return (this.repository as any).findAll();
    }
    return [];
  }

  /**
   * 获取记忆统计信息
   */
  getStats(): MemoryStats {
    const allMemories = this.getAllMemories();

    if (allMemories.length === 0) {
      return {
        totalCount: 0,
        byType: {},
        averageImportance: 0,
        oldestMemory: 0,
        totalSize: 0,
      };
    }

    const byType: Record<string, number> = {};
    let totalImportance = 0;
    let oldestTime = Date.now();
    let totalSize = 0;

    for (const memory of allMemories) {
      // 按类型统计
      const type = memory.type || 'unknown';
      byType[type] = (byType[type] || 0) + 1;

      // 重要性
      totalImportance += memory.importance;

      // 最旧记忆
      if (memory.createdAt < oldestTime) {
        oldestTime = memory.createdAt;
      }

      // 估算大小
      totalSize += JSON.stringify(memory).length;
    }

    return {
      totalCount: allMemories.length,
      byType,
      averageImportance: totalImportance / allMemories.length,
      oldestMemory: oldestTime,
      totalSize,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ExpirationConfig>): void {
    this.config = { ...this.config, ...config };
    
    // 如果自动清理配置改变，重启定时器
    if (config.cleanupInterval !== undefined || config.enableAutoCleanup !== undefined) {
      this.stopAutoCleanup();
      if (this.config.enableAutoCleanup) {
        this.startAutoCleanup();
      }
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): ExpirationConfig {
    return { ...this.config };
  }

  /**
   * 手动触发清理
   */
  async forceCleanup(): Promise<CleanupResult> {
    console.log('[MemoryExpiration] Force cleanup triggered');
    return this.cleanup();
  }
}

// 导出单例管理器
let defaultExpirationManager: MemoryExpirationManager | null = null;

export function initializeExpirationManager(
  repository: MemoryRepository,
  config?: Partial<ExpirationConfig>
): MemoryExpirationManager {
  defaultExpirationManager = new MemoryExpirationManager(repository, config);
  return defaultExpirationManager;
}

export function getExpirationManager(): MemoryExpirationManager | null {
  return defaultExpirationManager;
}

export function resetExpirationManager(): void {
  if (defaultExpirationManager) {
    defaultExpirationManager.stopAutoCleanup();
    defaultExpirationManager = null;
  }
}
