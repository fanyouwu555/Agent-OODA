# OODA Agent 系统重构设计方案

> 文档版本：1.0.0
> 创建日期：2026-03-20
> 方案选择：渐进式重构（方案 A）

---

## 一、现有系统问题分析

### 1.1 高优先级问题

| 问题 | 位置 | 影响 | 现状 |
|------|------|------|------|
| **缓存无 LRU 淘汰** | `ooda/loop.ts` | 可能导致内存泄漏 | 简单 Map 实现，仅按 size 淘汰 |
| **结果验证范围有限** | `ooda/loop.ts:960-1039` | 仅验证搜索工具 | 硬编码验证搜索类工具 |
| **Agent 配置未持久化** | `server/routes/agents.ts` | 重启后丢失 | 内存 Map 存储 |
| **权限配置未持久化** | `server/routes/permissions.ts` | 重启后重置 | 内存变量存储 |

### 1.2 中优先级问题

| 问题 | 位置 | 影响 | 现状 |
|------|------|------|------|
| **记忆过期未集成** | `memory/hierarchical-memory.ts` | 记忆无限增长 | 接口存在但未使用 |
| **适应策略未执行** | `ooda/loop.ts` | 无法自适应调整 | 仅日志记录 |

---

## 二、重构目标与范围

### 2.1 重构目标

1. **缓存系统**：添加 LRU 淘汰策略，支持 TTL 过期
2. **结果验证**：扩展验证范围，支持可配置的工具验证规则
3. **配置持久化**：Agent/权限配置迁移到 SQLite
4. **记忆过期**：集成过期机制，防止记忆无限增长
5. **适应策略**：实现基于反馈的策略调整

### 2.2 重构范围

- **packages/core**：OODA 循环、记忆系统、工具系统
- **packages/server**：API 路由、配置管理
- **packages/storage**：数据库 Schema、Repository

---

## 三、系统架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Server Layer                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │  agents.ts  │  │permissions.ts│  │  session.ts │                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
│         │                │                │                         │
│         └────────────────┼────────────────┘                         │
│                          ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Configuration Repository Layer                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │   │
│  │  │   Agent     │  │ Permission  │  │    User     │          │   │
│  │  │ Repository  │  │ Repository  │  │ Repository  │          │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                          │                                          │
└──────────────────────────┼──────────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────────┐
│                    Storage Layer                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   SQLite Database                             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │   │
│  │  │ sessions │ │ messages │ │ memories │ │ configs  │       │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     Core Package Layer                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    OODA Loop                                 │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │ Observe  │→ │  Orient  │→ │  Decide  │→ │   Act    │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │   │
│  │         ↑                                                   │   │
│  │         └──────────────── Feedback ──────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                          │                                          │
│  ┌───────────────────────┼───────────────────────────────────────┐│
│  │              Support Modules                                   ││
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          ││
│  │  │ LRUCache     │ │ResultValidator│ │MemoryExpiration│          ││
│  │  └──────────────┘ └──────────────┘ └──────────────┘          ││
│  └──────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 模块依赖关系

```
┌─────────────────────────────────────────────────────────────┐
│                     Module Dependencies                      │
└─────────────────────────────────────────────────────────────┘

     ┌──────────────────────────────────────────────┐
     │                  OODALoop                     │
     │  (依赖于 Cache, Validator, Adaptation)       │
     └─────────────────────┬────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐ ┌────────────┐ ┌────────────┐
    │ LRUCache   │ │  Result    │ │ Adaptation │
    │  Module    │ │ Validator  │ │  Module    │
    └────────────┘ └────────────┘ └────────────┘

     ┌──────────────────────────────────────────────┐
     │              HierarchicalMemory              │
     │  (依赖于 MemoryExpiration Module)            │
     └─────────────────────┬────────────────────────┘
                           ▼
                  ┌──────────────┐
                  │   Memory     │
                  │  Expiration  │
                  └──────────────┘

     ┌──────────────────────────────────────────────┐
     │              AgentRegistry                    │
     │  (依赖于 AgentRepository)                    │
     └─────────────────────┬────────────────────────┘
                           ▼
                  ┌──────────────┐
                  │    Agent     │
                  │ Repository   │
                  └──────────────┘
```

---

## 四、详细设计方案

### 4.1 阶段一：缓存系统重构

#### 4.1.1 LRU 缓存模块设计

**文件位置**：`packages/core/src/utils/cache.ts`

```typescript
// 核心接口
interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessTime: number;
}

interface LRUCacheOptions<T> {
  maxSize: number;
  ttl?: number;
  onEvict?: (key: string, value: T) => void;
}

class LRUCache<K extends string, V> {
  private cache: Map<K, CacheEntry<V>>;
  private maxSize: number;
  private defaultTTL: number;
  private onEvict?: (key: K, value: V) => void;

  constructor(options: LRUCacheOptions<V>);
  get(key: K): V | undefined;
  set(key: K, value: V, ttl?: number): void;
  has(key: K): boolean;
  delete(key: K): boolean;
  clear(): void;
  // LRU 淘汰核心方法
  private evictIfNeeded(): void;
  private access(key: K): void;
}
```

**设计要点**：
1. 使用 `Map` 保持插入顺序，尾部为最新
2. 访问时移动到尾部（最新位置）
3. 淘汰时从头部删除（最老位置）
4. 支持 TTL 过期检查

#### 4.1.2 多级缓存设计

```typescript
// packages/core/src/utils/multi-level-cache.ts

interface MultiLevelCacheConfig {
  l1: { maxSize: number; ttl: number };      // 内存 L1
  l2: { maxSize: number; ttl: number };      // 内存 L2
  enablePersistence?: boolean;
}

class MultiLevelCache {
  private l1Cache: LRUCache<string, unknown>;
  private l2Cache: LRUCache<string, unknown>;

  async get<T>(key: string): Promise<T | null>;
  async set<T>(key: string, value: T, level?: 'l1' | 'l2'): Promise<void>;
}
```

#### 4.1.3 OODA Loop 缓存集成

```typescript
// loop.ts 修改点

// 之前
private observationCache = new Map<string, CacheEntry<Observation>>();
private orientationCache = new Map<string, CacheEntry<Orientation>>();
private decisionCache = new Map<string, CacheEntry<Decision>>();

// 之后
private observationCache: LRUCache<string, Observation>;
private orientationCache: LRUCache<string, Orientation>;
private decisionCache: LRUCache<string, Decision>;

// 构造函数中初始化
this.observationCache = new LRUCache({
  maxSize: 100,
  ttl: 60000,
  onEvict: (key, value) => {
    console.log(`[Cache] Observe evicted: ${key}`);
  }
});
```

---

### 4.2 阶段二：结果验证扩展

#### 4.2.1 验证规则配置化

**文件位置**：`packages/core/src/ooda/types.ts` 或新建 `packages/core/src/ooda/validation.ts`

```typescript
// 验证规则定义
interface ValidationRule {
  toolPattern: RegExp | string[];  // 匹配的工具名称
  validator: 'llm' | 'rule' | 'schema';
  schema?: z.ZodSchema;             // 用于 rule 类型的 schema
  llmPrompt?: string;               // 用于 llm 类型的提示模板
  enabled: boolean;
}

// 默认验证规则
const DEFAULT_VALIDATION_RULES: ValidationRule[] = [
  {
    toolPattern: ['web_search', 'web_search_and_fetch', 'search_web'],
    validator: 'llm',
    llmPrompt: '请判断以下搜索结果是否满足用户需求...',
    enabled: true,
  },
  {
    toolPattern: /^read_file$/,
    validator: 'schema',
    schema: z.object({
      content: z.string().optional(),
      exists: z.boolean().optional(),
    }),
    enabled: true,
  },
  {
    toolPattern: /^write_file$/,
    validator: 'rule',
    schema: z.object({
      success: z.boolean(),
      path: z.string(),
    }),
    enabled: true,
  },
];

// 验证结果
interface ValidationResult {
  isValid: boolean;
  score: number;           // 0-1
  issues: string[];
  suggestions: string[];
  improvedContent?: string;
}
```

#### 4.2.2 验证器接口

```typescript
// packages/core/src/ooda/validators/base.ts

interface ResultValidator {
  validate(
    toolName: string,
    result: unknown,
    context: ValidationContext
  ): Promise<ValidationResult>;
}

interface ValidationContext {
  userInput: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  timestamp: number;
}

// 内置验证器
class LLMValidator implements ResultValidator { ... }
class SchemaValidator implements ResultValidator { ... }
class RuleValidator implements ResultValidator { ... }
```

#### 4.2.3 验证管理器

```typescript
// packages/core/src/ooda/validators/manager.ts

class ValidationManager {
  private validators: Map<string, ResultValidator> = new Map();
  private rules: ValidationRule[] = DEFAULT_VALIDATION_RULES;

  registerValidator(name: string, validator: ResultValidator): void;
  addRule(rule: ValidationRule): void;
  removeRule(name: string): void;
  getRules(): ValidationRule[];

  async validate(
    toolName: string,
    result: unknown,
    context: ValidationContext
  ): Promise<ValidationResult>;

  // 匹配工具对应的验证器
  private matchValidator(toolName: string): ResultValidator;
}
```

---

### 4.3 阶段三：配置持久化

#### 4.3.1 Storage 层扩展

**文件位置**：`packages/storage/src/database.ts`

```typescript
// 新增表 Schema
const AGENT_CONFIG_TABLE = `
  CREATE TABLE IF NOT EXISTS agent_configs (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    config TEXT NOT NULL,  -- JSON
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`;

const PERMISSION_CONFIG_TABLE = `
  CREATE TABLE IF NOT EXISTS permission_configs (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    config_type TEXT NOT NULL,  -- 'global' | 'agent' | 'group'
    config TEXT NOT NULL,  -- JSON
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agent_configs(id)
  )
`;
```

#### 4.3.2 Repository 实现

**Agent Repository**

```typescript
// packages/storage/src/repositories/agent-config.ts

export class AgentConfigRepository {
  constructor(private db: DatabaseManager) {}

  create(input: {
    id: string;
    name: string;
    config: AgentConfigV2;
  }): AgentConfigRecord;

  findById(id: string): AgentConfigRecord | null;
  findByName(name: string): AgentConfigRecord | null;
  findAll(): AgentConfigRecord[];
  update(id: string, config: Partial<AgentConfigV2>): boolean;
  delete(id: string): boolean;
}
```

**Permission Repository**

```typescript
// packages/storage/src/repositories/permission-config.ts

export class PermissionConfigRepository {
  constructor(private db: DatabaseManager) {}

  saveGlobal(config: GlobalPermissionConfig): boolean;
  getGlobal(): GlobalPermissionConfig | null;

  saveAgent(agentId: string, config: AgentPermissionConfig): boolean;
  getAgent(agentId: string): AgentPermissionConfig | null;

  saveGroup(groupName: string, config: Record<string, PermissionMode>): boolean;
  getGroup(groupName: string): Record<string, PermissionMode> | null;

  findAll(): PermissionConfigRecord[];
}
```

#### 4.3.3 Server 层集成

**agents.ts 修改**

```typescript
// 之前：内存存储
const agentRegistry = getAgentRegistry();

// 之后：从数据库加载
async function initializeAgentRepository() {
  const db = getDatabase();
  const repository = new AgentConfigRepository(db);

  // 从数据库加载所有 Agent 配置
  const configs = repository.findAll();
  const registry = getAgentRegistry();

  for (const config of configs) {
    registry.register(config.name, JSON.parse(config.config));
  }
}
```

---

### 4.4 阶段四：记忆过期机制

#### 4.4.1 过期策略接口

```typescript
// packages/core/src/memory/memory-expiration.ts

interface ExpirationPolicy {
  type: 'ttl' | 'lru' | 'importance' | 'hybrid';
  maxAge?: number;           // TTL: 最大存活时间 ms
  maxSize?: number;           // LRU: 最大条目数
  minImportance?: number;      // Importance: 最低重要性阈值
}

interface MemoryWithExpiration {
  id: string;
  content: string;
  createdAt: number;
  lastAccessed: number;
  importance: number;
  expiresAt?: number;
}

class MemoryExpirationManager {
  constructor(
    private policy: ExpirationPolicy,
    private storage: MemoryStorage
  ) {}

  // 检查并清理过期记忆
  async cleanup(): Promise<CleanupResult>;

  // 访问记忆（更新 lastAccessed）
  async access(id: string): Promise<MemoryWithExpiration | null>;

  // 添加记忆
  async add(memory: Omit<MemoryWithExpiration, 'lastAccessed'>): Promise<string>;

  // 获取统计
  getStats(): MemoryStats;
}
```

#### 4.4.2 分层记忆集成

```typescript
// hierarchical-memory.ts 修改

export class HierarchicalMemoryManager {
  private expirationManager: MemoryExpirationManager;

  constructor(sessionId: string, config?: MemoryConfig) {
    // ...

    // 初始化过期管理器
    this.expirationManager = new MemoryExpirationManager(
      config?.expirationPolicy || { type: 'hybrid', maxAge: 3600000, maxSize: 500 },
      this.semantic
    );
  }

  // 存储记忆时自动处理过期
  storeFact(fact: string, tags: string[] = []): string {
    const id = this.semantic.store('fact', fact, 0.7, tags);

    // 注册到过期管理器
    this.expirationManager.add({
      id,
      content: fact,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      importance: 0.7,
    });

    return id;
  }

  // 定期清理
  async cleanupIfNeeded(): Promise<void> {
    const stats = this.expirationManager.getStats();
    if (stats.shouldCleanup) {
      await this.expirationManager.cleanup();
    }
  }
}
```

---

### 4.5 阶段五：适应策略实现

#### 4.5.1 策略调整接口

```typescript
// packages/core/src/ooda/adaptation.ts

interface AdaptationStrategy {
  type: 'cache' | 'retry' | 'tool_selection' | 'model';
  trigger: 'threshold' | 'pattern' | 'manual';
  config: Record<string, unknown>;
}

interface AdaptationResult {
  applied: boolean;
  strategy: AdaptationStrategy;
  effect: 'positive' | 'negative' | 'neutral';
  metrics: {
    before: PerformanceMetrics;
    after: PerformanceMetrics;
  };
}

class AdaptationEngine {
  private strategies: Map<string, AdaptationStrategy> = new Map();
  private history: AdaptationResult[] = [];

  // 基于指标的自动调整
  async analyzeAndAdapt(metrics: PerformanceMetrics): Promise<AdaptationResult>;

  // 注册新策略
  registerStrategy(strategy: AdaptationStrategy): void;

  // 获取推荐策略
  getRecommendedStrategy(intent: string): AdaptationStrategy | null;

  // 评估策略效果
  evaluateResult(result: AdaptationResult): void;
}
```

#### 4.5.2 OODA Loop 集成

```typescript
// loop.ts 修改

export class OODALoop {
  private adaptationEngine: AdaptationEngine;
  private adaptationEnabled = true;

  // 在循环结束后评估是否需要调整
  private async evaluateAndAdapt(state: AgentState): Promise<void> {
    if (!this.adaptationEnabled) return;

    const metrics = this.computeMetrics(state);
    const result = await this.adaptationEngine.analyzeAndAdapt(metrics);

    if (result.applied) {
      await this.applyStrategy(result.strategy);
    }
  }

  // 应用策略
  private async applyStrategy(strategy: AdaptationStrategy): Promise<void> {
    switch (strategy.type) {
      case 'cache':
        this.adjustCacheStrategy(strategy.config);
        break;
      case 'retry':
        this.adjustRetryPolicy(strategy.config);
        break;
      case 'tool_selection':
        this.adjustToolSelection(strategy.config);
        break;
    }
  }
}
```

---

## 五、数据流设计

### 5.1 配置加载数据流

```
应用启动
    │
    ▼
┌─────────────────────────┐
│  DatabaseManager       │
│  initialize()          │
└───────────┬────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│  Repository Initialization                              │
│  ┌──────────────────┐  ┌──────────────────┐           │
│  │AgentConfigRepo   │  │PermissionConfigRepo│           │
│  │.findAll()       │  │.findAll()        │           │
│  └────────┬─────────┘  └────────┬─────────┘           │
└───────────┼──────────────────────┼─────────────────────┘
            │                      │
            ▼                      ▼
┌─────────────────────────┐  ┌─────────────────────────┐
│  AgentRegistry          │  │  PermissionManager     │
│  register(name, config)│  │  loadConfig(config)    │
│  .initializeDefaults() │  │  .initializeDefaults() │
└─────────────────────────┘  └─────────────────────────┘
```

### 5.2 结果验证数据流

```
Act 阶段执行完成
        │
        ▼
┌─────────────────────────────────────┐
│  ValidationManager                  │
│  .validate(toolName, result, ctx)   │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  匹配验证规则                        │
│  rule = matchRule(toolName)         │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  执行验证器                          │
│  validator.validate(...)            │
│  ┌──────────┐ ┌──────────┐        │
│  │ LLM       │ │ Schema    │ ...   │
│  └─────┬─────┘ └────┬─────┘        │
└────────┼────────────┼──────────────┘
         │            │
         ▼            ▼
    ┌─────────┐  ┌─────────┐
    │ValidationResult         │
    │.isValid, .score,        │
    │.issues, .suggestions    │
    └─────────────────────────┘
```

---

## 六、实施步骤

### 6.1 阶段划分

| 阶段 | 任务 | 工期估计 | 风险等级 |
|------|------|----------|----------|
| **Phase 1** | 缓存系统重构 | 3-4 天 | 低 |
| **Phase 2** | 结果验证扩展 | 2-3 天 | 中 |
| **Phase 3** | 配置持久化 | 4-5 天 | 中 |
| **Phase 4** | 记忆过期机制 | 2-3 天 | 低 |
| **Phase 5** | 适应策略实现 | 3-4 天 | 高 |

### 6.2 详细任务分解

#### Phase 1: 缓存系统重构

1. **T1.1**: 创建 `LRUCache` 类
   - 实现基础的 Map 结构
   - 实现 LRU 淘汰逻辑
   - 添加 TTL 支持

2. **T1.2**: 创建 `MultiLevelCache` 类
   - 实现 L1/L2 两级缓存
   - 实现预取逻辑（可选）

3. **T1.3**: 重构 `OODALoop` 缓存
   - 替换 Map 为 LRUCache
   - 添加缓存监控指标

4. **T1.4**: 添加单元测试
   - LRUCache 测试
   - 缓存集成测试

#### Phase 2: 结果验证扩展

5. **T2.1**: 定义 `ValidationRule` 接口
   - 创建规则配置 Schema
   - 实现规则匹配逻辑

6. **T2.2**: 实现验证器
   - `LLMValidator`
   - `SchemaValidator`
   - `RuleValidator`

7. **T2.3**: 创建 `ValidationManager`
   - 规则注册与管理
   - 验证执行逻辑

8. **T2.4**: 重构 `validateActionResult`
   - 替换硬编码为 ValidationManager
   - 保留向后兼容

9. **T2.5**: 添加验证规则配置

#### Phase 3: 配置持久化

10. **T3.1**: 扩展数据库 Schema
    - 添加 `agent_configs` 表
    - 添加 `permission_configs` 表

11. **T3.2**: 实现 Repository
    - `AgentConfigRepository`
    - `PermissionConfigRepository`

12. **T3.3**: 重构 `agents.ts`
    - 从数据库加载
    - 写入时同步到数据库

13. **T3.4**: 重构 `permissions.ts`
    - 同上

14. **T3.5**: 数据迁移脚本
    - 从内存到 SQLite
    - 验证迁移完整性

#### Phase 4: 记忆过期机制

15. **T4.1**: 定义 `ExpirationPolicy` 接口

16. **T4.2**: 实现 `MemoryExpirationManager`
    - TTL 检查
    - LRU 淘汰
    - 重要性排序

17. **T4.3**: 集成到 `HierarchicalMemoryManager`
    - 自动过期注册
    - 定期清理触发

#### Phase 5: 适应策略实现

18. **T5.1**: 定义 `AdaptationStrategy` 接口

19. **T5.2**: 实现 `AdaptationEngine`
    - 策略注册
    - 指标分析
    - 策略推荐

20. **T5.3**: 集成到 `OODALoop`
    - 循环后评估
    - 策略应用

---

## 七、测试计划

### 7.1 单元测试

| 模块 | 测试用例 | 通过标准 |
|------|----------|----------|
| LRUCache | get/set/eviction/ttl | 100% 覆盖 |
| ValidationManager | rule matching/validation | 90% 覆盖 |
| Repository | CRUD operations | 95% 覆盖 |
| AdaptationEngine | strategy evaluation | 85% 覆盖 |

### 7.2 集成测试

| 场景 | 测试用例 | 验证点 |
|------|----------|--------|
| 缓存 | 并发访问/多会话 | 数据一致性 |
| 验证 | 多种工具验证 | 规则正确匹配 |
| 持久化 | 重启后恢复 | 数据完整性 |
| 过期 | 记忆自动清理 | 无内存泄漏 |

### 7.3 系统测试

| 场景 | 测试用例 | 验证点 |
|------|----------|--------|
| OODA 循环 | 完整流程 | 缓存命中/验证生效 |
| 配置管理 | Agent 创建/修改/删除 | 持久化成功 |
| 记忆系统 | 长期运行 | 内存稳定 |

---

## 八、风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 数据迁移丢失 | 高 | 中 | 先备份，后迁移 |
| 缓存不一致 | 中 | 低 | 添加一致性检查 |
| 验证规则误判 | 中 | 低 | 添加人工审核接口 |
| 性能回退 | 中 | 低 | 添加性能监控 |

---

## 九、验收标准

### 9.1 功能验收

- [ ] LRU 缓存正确淘汰最老条目
- [ ] TTL 过期正常工作
- [ ] 验证规则可配置
- [ ] Agent 配置重启后恢复
- [ ] 权限配置重启后恢复
- [ ] 记忆过期自动清理
- [ ] 适应策略可配置

### 9.2 性能验收

- [ ] 缓存命中时响应时间 < 100ms
- [ ] 验证执行时间 < 500ms
- [ ] 记忆无明显内存增长
- [ ] 重启后配置加载 < 2s

### 9.3 质量验收

- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试通过率 100%
- [ ] 无 TypeScript 编译错误
- [ ] ESLint 检查通过

---

## 十、后续规划

本阶段重构完成后，可考虑以下改进：

1. **分布式缓存**：引入 Redis 支持多实例共享缓存
2. **自适应模型选择**：根据任务类型自动选择最优模型
3. **A/B 测试框架**：支持策略对比实验
4. **完整链路追踪**：引入 OpenTelemetry

---

*文档版本：1.0.0*
*最后更新：2026-03-20*
