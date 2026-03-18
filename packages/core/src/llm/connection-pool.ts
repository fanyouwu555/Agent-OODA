// packages/core/src/llm/connection-pool.ts
// LLM连接池 - 复用连接，避免重复创建

import { LLMService } from './service';
import { LLMProviderConfig } from './provider';

interface PooledConnection {
  service: LLMService;
  config: LLMProviderConfig;
  inUse: boolean;
  lastUsed: number;
  createdAt: number;
}

export class LLMConnectionPool {
  private pool: Map<string, PooledConnection[]> = new Map();
  private maxConnectionsPerConfig = 3;
  private maxIdleTime = 5 * 60 * 1000; // 5分钟
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * 获取连接
   */
  async acquire(config?: LLMProviderConfig): Promise<LLMService> {
    const configKey = this.getConfigKey(config);
    
    // 查找可用连接
    const connections = this.pool.get(configKey) || [];
    const available = connections.find(c => !c.inUse);
    
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      return available.service;
    }

    // 创建新连接（允许临时超出限制，避免等待）
    const service = new LLMService(config);
    const connection: PooledConnection = {
      service,
      config: config || this.getDefaultConfig(),
      inUse: true,
      lastUsed: Date.now(),
      createdAt: Date.now(),
    };
    connections.push(connection);
    this.pool.set(configKey, connections);
    
    // 如果超出限制，记录警告
    if (connections.length > this.maxConnectionsPerConfig) {
      console.warn(`[LLMConnectionPool] Connection pool exceeded for ${configKey}: ${connections.length}/${this.maxConnectionsPerConfig}`);
    }
    
    return service;
  }

  /**
   * 释放连接
   */
  release(service: LLMService): void {
    for (const [key, connections] of this.pool.entries()) {
      const connection = connections.find(c => c.service === service);
      if (connection) {
        connection.inUse = false;
        connection.lastUsed = Date.now();
        return;
      }
    }
  }

  /**
   * 获取连接池统计
   */
  getStats(): {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    configs: string[];
  } {
    let total = 0;
    let active = 0;
    const configs: string[] = [];

    for (const [key, connections] of this.pool.entries()) {
      total += connections.length;
      active += connections.filter(c => c.inUse).length;
      configs.push(key);
    }

    return {
      totalConnections: total,
      activeConnections: active,
      idleConnections: total - active,
      configs,
    };
  }

  /**
   * 关闭连接池
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.pool.clear();
  }

  private getConfigKey(config?: LLMProviderConfig): string {
    if (!config) return 'default';
    return `${config.type}:${config.model || 'default'}`;
  }

  private getDefaultConfig(): LLMProviderConfig {
    return { type: 'local', model: 'default' };
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, 60000); // 每分钟清理一次
  }

  private cleanupIdleConnections(): void {
    const now = Date.now();
    
    for (const [key, connections] of this.pool.entries()) {
      // 保留至少一个连接，删除超时的空闲连接
      const toRemove: PooledConnection[] = [];
      let idleCount = 0;

      for (const conn of connections) {
        if (!conn.inUse) {
          idleCount++;
          if (idleCount > 1 && now - conn.lastUsed > this.maxIdleTime) {
            toRemove.push(conn);
          }
        }
      }

      // 删除超时连接
      const filtered = connections.filter(c => !toRemove.includes(c));
      
      if (filtered.length === 0) {
        this.pool.delete(key);
      } else {
        this.pool.set(key, filtered);
      }
    }
  }
}

// 全局连接池实例
let globalPool: LLMConnectionPool | null = null;

export function getLLMConnectionPool(): LLMConnectionPool {
  if (!globalPool) {
    globalPool = new LLMConnectionPool();
  }
  return globalPool;
}

export function resetLLMConnectionPool(): void {
  if (globalPool) {
    globalPool.destroy();
    globalPool = null;
  }
}

// 兼容旧API的包装函数
export async function getLLMServiceFromPool(config?: LLMProviderConfig): Promise<LLMService> {
  const pool = getLLMConnectionPool();
  return pool.acquire(config);
}

export function releaseLLMService(service: LLMService): void {
  const pool = getLLMConnectionPool();
  pool.release(service);
}
