# Phase 4: 记忆过期机制

> 所属项目：OODA Agent 系统重构
> 阶段序号：4/5
> 设计文档：docs/plans/2026-03-20-ooda-system-refactoring-design.md

---

## 1. 任务概述

### 1.1 目标
实现记忆过期机制，防止记忆无限增长，支持多种过期策略。

### 1.2 当前问题
- `HierarchicalMemoryManager` 有过期接口但未使用
- 记忆会无限增长
- 无内存管理机制

### 1.3 验收标准
- [ ] 实现 `ExpirationPolicy` 接口
- [ ] 实现 `MemoryExpirationManager`
- [ ] 集成到 `HierarchicalMemoryManager`
- [ ] 支持 TTL/LRU/Importance/Hybrid 四种策略
- [ ] 定期清理机制

---

## 2. 文件清单

### 2.1 新增文件

| 文件路径 | 描述 | 优先级 |
|----------|------|--------|
| `packages/core/src/memory/expiration/types.ts` | 过期策略类型定义 | 🔴 高 |
| `packages/core/src/memory/expiration/manager.ts` | 过期管理器 | 🔴 高 |
| `packages/core/src/memory/expiration/policies.ts` | 内置过期策略实现 | 🟡 中 |
| `packages/core/src/memory/expiration/__tests__/manager.test.ts` | 测试 | 🟡 中 |

### 2.2 修改文件

| 文件路径 | 修改内容 | 优先级 |
|----------|----------|--------|
| `packages/core/src/memory/hierarchical-memory.ts` | 集成过期管理 | 🔴 高 |
| `packages/core/src/memory/memory-config.ts` | 添加过期配置 | 🟡 中 |

---

## 3. 详细实施步骤

### 3.1 Step 1: 定义过期策略类型

**文件**: `packages/core/src/memory/expiration/types.ts`

```typescript
// 过期策略类型
type ExpirationPolicyType = 'ttl' | 'lru' | 'importance' | 'hybrid';

interface ExpirationPolicy {
  type: ExpirationPolicyType;
  maxAge?: number;           // TTL: 最大存活时间 ms
  maxSize?: number;          // LRU: 最大条目数
  minImportance?: number;     // Importance: 最低重要性阈值
  hybridWeights?: {
    age: number;      // 权重：年龄
    importance: number; // 权重：重要性
    accessCount: number; // 权重：访问次数
  };
}

// 带过期的记忆条目
interface MemoryWithExpiration {
  id: string;
  content: string;
  type: 'fact' | 'experience' | 'preference';
  createdAt: number;
  lastAccessed: number;
  importance: number;
  accessCount: number;
  expiresAt?: number;
}

// 清理结果
interface CleanupResult {
  removedCount: number;
  removedIds: string[];
  remainingCount: number;
  stats: {
    totalMemories: number;
    expiredMemories: number;
    lowImportanceMemories: number;
  };
}
```

### 3.2 Step 2: 实现过期管理器

**文件**: `packages/core/src/memory/expiration/manager.ts`

```typescript
export class MemoryExpirationManager {
  private policy: ExpirationPolicy;
  private memoryStorage: MemoryStorage;
  private lastCleanup: number = 0;
  private cleanupInterval: number = 60000; // 默认 1 分钟

  constructor(
    policy: ExpirationPolicy,
    memoryStorage: MemoryStorage,
    options?: { cleanupInterval?: number }
  ) {
    this.policy = policy;
    this.memoryStorage = memoryStorage;
    if (options?.cleanupInterval) {
      this.cleanupInterval = options.cleanupInterval;
    }
  }

  async cleanup(): Promise<CleanupResult> {
    const allMemories = await this.memoryStorage.getAll();
    const now = Date.now();
    const result: CleanupResult = {
      removedCount: 0,
      removedIds: [],
      remainingCount: allMemories.length,
      stats: {
        totalMemories: allMemories.length,
        expiredMemories: 0,
        lowImportanceMemories: 0,
      },
    };

    const toRemove: string[] = [];

    for (const memory of allMemories) {
      if (this.shouldRemove(memory, now)) {
        toRemove.push(memory.id);
        result.removedIds.push(memory.id);
        result.removedCount++;

        if (this.isExpired(memory)) {
          result.stats.expiredMemories++;
        } else {
          result.stats.lowImportanceMemories++;
        }
      }
    }

    // 执行删除
    for (const id of toRemove) {
      await this.memoryStorage.delete(id);
    }

    this.lastCleanup = now;
    result.remainingCount = allMemories.length - result.removedCount;

    return result;
  }

  private shouldRemove(memory: MemoryWithExpiration, now: number): boolean {
    switch (this.policy.type) {
      case 'ttl':
        return this.isExpired(memory);
      case 'lru':
        return allMemories.length > (this.policy.maxSize || 100);
      case 'importance':
        return memory.importance < (this.policy.minImportance || 0.5);
      case 'hybrid':
        return this.shouldRemoveHybrid(memory);
      default:
        return false;
    }
  }

  private isExpired(memory: MemoryWithExpiration): boolean {
    if (!this.policy.maxAge) return false;
    const age = Date.now() - memory.createdAt;
    return age > this.policy.maxAge;
  }

  private shouldRemoveHybrid(memory: MemoryWithExpiration): boolean {
    const weights = this.policy.hybridWeights || {
      age: 0.3,
      importance: 0.5,
      accessCount: 0.2,
    };

    const age = Date.now() - memory.createdAt;
    const ageScore = this.policy.maxAge
      ? Math.min(age / this.policy.maxAge, 1)
      : 0;
    const importanceScore = memory.importance;
    const accessScore = Math.min(memory.accessCount / 10, 1);

    const compositeScore =
      weights.age * ageScore +
      weights.importance * (1 - importanceScore) +
      weights.accessCount * (1 - accessScore);

    return compositeScore > 0.7;
  }

  async access(id: string): Promise<void> {
    const memory = await this.memoryStorage.get(id);
    if (memory) {
      memory.lastAccessed = Date.now();
      memory.accessCount++;
      await this.memoryStorage.update(id, memory);
    }
  }

  shouldCleanupNow(): boolean {
    return Date.now() - this.lastCleanup > this.cleanupInterval;
  }

  getStats(): MemoryStats {
    return {
      totalMemories: this.memoryStorage.size(),
      expiredMemories: 0, // 实时计算
      lastCleanup: this.lastCleanup,
      policy: this.policy,
    };
  }
}
```

### 3.3 Step 3: 集成到 HierarchicalMemoryManager

**文件**: `packages/core/src/memory/hierarchical-memory.ts`

```typescript
// 在构造函数中添加
export class HierarchicalMemoryManager {
  private expirationManager: MemoryExpirationManager;

  constructor(sessionId: string, config?: MemoryConfig) {
    // ... 现有初始化

    // 添加过期管理器
    if (config?.expirationPolicy) {
      this.expirationManager = new MemoryExpirationManager(
        config.expirationPolicy,
        this.semantic,
        { cleanupInterval: config.cleanupInterval || 60000 }
      );
    }
  }

  storeFact(fact: string, tags: string[] = []): string {
    const id = this.semantic.store('fact', fact, 0.7, tags);

    if (this.expirationManager) {
      this.expirationManager.add({
        id,
        content: fact,
        type: 'fact',
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        importance: 0.7,
        accessCount: 0,
      });
    }

    return id;
  }

  async recall(query: string): Promise<Memory[]> {
    const results = await this.semantic.search(query);

    // 更新访问信息
    if (this.expirationManager) {
      for (const result of results) {
        await this.expirationManager.access(result.id);
      }
    }

    return results;
  }

  async cleanupIfNeeded(): Promise<CleanupResult | null> {
    if (!this.expirationManager) return null;

    if (this.expirationManager.shouldCleanupNow()) {
      return this.expirationManager.cleanup();
    }

    return null;
  }
}
```

### 3.4 Step 4: 添加配置支持

**文件**: `packages/core/src/memory/memory-config.ts`

```typescript
interface MemoryConfig {
  // ... 现有字段
  expirationPolicy?: ExpirationPolicy;
  cleanupInterval?: number;
}
```

---

## 4. 测试计划

### 4.1 单元测试

```typescript
describe('MemoryExpirationManager', () => {
  describe('TTL policy', () => {
    it('should remove expired memories');
    it('should keep non-expired memories');
  });

  describe('LRU policy', () => {
    it('should remove least recently used when over maxSize');
  });

  describe('Importance policy', () => {
    it('should remove low importance memories');
  });

  describe('Hybrid policy', () => {
    it('should calculate composite score correctly');
  });
});
```

---

## 5. 时间估算

| 步骤 | 预估时间 |
|------|----------|
| Step 1: 类型定义 | 1h |
| Step 2: 管理器实现 | 2h |
| Step 3: 集成到 HierarchicalMemory | 2h |
| Step 4: 配置支持 | 1h |
| 测试与修复 | 2h |
| **总计** | **8h** |

---

## 6. 依赖项

- Phase 1 的 LRUCache（可用于记忆缓存）
- 现有 `HierarchicalMemoryManager`

---

## 7. 下游阶段

Phase 4 完成后：
- 记忆系统将自动管理内存
- 支持配置化的过期策略

---

*阶段负责人：待定*
*创建日期：2026-03-20*
