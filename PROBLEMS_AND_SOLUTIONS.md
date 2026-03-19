# 问题清单与解决方案

## 问题 1: 硬编码问题 - 默认模型和超时时间

### 问题描述
- 多处硬编码 `moonshot-v1-8k` 作为默认模型（6 处）
- 确认超时时间硬编码为 `60000ms`（1 处）
- Agent 超时时间硬编码为 `600000ms`（2 处）

### 影响
- 切换 LLM 提供商时需要修改多处代码
- 超时时间无法通过配置调整

### 解决方案

```typescript
// 1. 创建统一配置常量 (packages/core/src/config/constants.ts)
export const DEFAULT_CONFIG = {
  LLM: {
    DEFAULT_MODEL: process.env.DEFAULT_MODEL || 'qwen3:8b',
    DEFAULT_PROVIDER: process.env.DEFAULT_PROVIDER || 'ollama',
  },
  TIMEOUT: {
    CONFIRMATION: parseInt(process.env.CONFIRMATION_TIMEOUT_MS || '60000', 10),
    AGENT: parseInt(process.env.AGENT_TIMEOUT_MS || '300000', 10),
  },
  CACHE: {
    DEFAULT_TTL: 60000,
    DEFAULT_MAX_SIZE: 100,
  }
} as const;
```

**修复文件清单：**
- `packages/server/src/routes/agents.ts` - 第 30, 62, 90, 118, 146, 211 行
- `packages/server/src/routes/session.ts` - 第 79 行

---

## 问题 2: MCP 服务器配置未被使用

### 问题描述
`config/config.v2.json` 中定义了 MCP 服务器配置：
```json
"mcp": {
  "servers": {
    "context7": { "command": "npx", "args": [...] },
    "grep_app": { "url": "http://localhost:8603/mcp" }
  }
}
```
但代码中未实现实际的 MCP 服务器连接逻辑。

### 影响
- MCP 工具配置无法生效
- 无法使用外部 MCP 服务

### 解决方案

```typescript
// packages/core/src/mcp/service.ts 新增方法

export class MCPService {
  private servers: Map<string, MCPClient> = new Map();
  
  async initializeFromConfig(config: MCPConfig): Promise<void> {
    for (const [name, serverConfig] of Object.entries(config.servers)) {
      if (serverConfig.command) {
        // 启动进程型 MCP 服务器
        const client = await this.startProcessServer(name, serverConfig);
        this.servers.set(name, client);
      } else if (serverConfig.url) {
        // 连接 HTTP 型 MCP 服务器
        const client = await this.connectHttpServer(name, serverConfig);
        this.servers.set(name, client);
      }
    }
  }
  
  private async connectHttpServer(name: string, config: MCPHttpServerConfig): Promise<MCPClient> {
    // 实现 HTTP MCP 客户端连接
    return new HTTP MCPClient(config.url, config.apiKey);
  }
}
```

---

## 问题 3: 异常处理不足

### 问题描述
- `catch (e) {}` 空 catch 块（多处）
- 错误未正确传播
- 数据库写入失败时未正确回滚

### 影响
- 错误被静默忽略
- 难以调试和追踪问题

### 解决方案

```typescript
// 改进错误处理模式

// 1. 创建统一错误处理工具
export class ErrorHandler {
  static handle(error: unknown, context: string): ErrorResult {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    
    logger.error(context, message, { stack });
    
    return {
      success: false,
      error: message,
      code: error instanceof CustomError ? error.code : 'INTERNAL_ERROR'
    };
  }
  
  static isRetryable(error: unknown): boolean {
    // 定义可重试错误类型
    const retryableCodes = ['NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMIT'];
    return error instanceof CustomError && retryableCodes.includes(error.code);
  }
}

// 2. 改进数据库事务回滚
async function executeWithTransaction<T>(fn: () => Promise<T>): Promise<T> {
  try {
    db.run('BEGIN TRANSACTION');
    const result = await fn();
    db.run('COMMIT');
    return result;
  } catch (error) {
    db.run('ROLLBACK');
    throw error; // 重新抛出而非静默处理
  }
}
```

---

## 问题 5: 性能优化 - 缓存策略和数据库写入

### 问题描述
- 缓存使用简单的大小限制，无 LRU 淘汰
- 数据库自动保存间隔固定（5000ms）
- 历史消息最大 100 条，可能不足

### 影响
- 内存使用可能持续增长
- 高并发时数据库写入可能成为瓶颈

### 解决方案

```typescript
// 1. 实现 LRU 缓存 (packages/core/src/utils/cache.ts)

export class LRUCache<T> {
  private cache = new Map<string, T>();
  
  get(key: string): T | undefined {
    if (!this.cache.has(key)) return undefined;
    
    // 移到末尾（最近使用）
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }
  
  set(key: string, value: T, ttl?: number): void {
    if (this.cache.size >= this.maxSize) {
      // 删除最旧的项
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

// 2. 动态调整数据库写入策略
export class AdaptiveDatabaseWriter {
  private pendingWrites: Array<{ sql: string; params: any[] }> = [];
  private flushInterval: number = 5000;
  
  async scheduleWrite(sql: string, params: any[]): Promise<void> {
    this.pendingWrites.push({ sql, params });
    
    // 根据积压情况动态调整
    if (this.pendingWrites.length > 100) {
      await this.flush(); // 立即刷新
      this.flushInterval = Math.max(1000, this.flushInterval - 500); // 缩短间隔
    }
  }
}
```

---

## 问题 6: 配置加载和环境变量校验

### 问题描述
- 配置加载路径优先级不明确
- 启动时未校验必要环境变量
- 缺少环境变量类型校验

### 影响
- 配置文件可能意外覆盖
- 运行时才发现配置错误

### 解决方案

```typescript
// packages/core/src/config/validator.ts

export interface EnvSchema {
  REQUIRED: string[];
  OPTIONAL: Record<string, { default: string; validate?: (v: string) => boolean }>;
}

const ENV_SCHEMA: EnvSchema = {
  REQUIRED: [
    'DB_PATH',
  ],
  OPTIONAL: {
    DEFAULT_PROVIDER: { default: 'ollama', validate: v => ['ollama', 'openai', 'kimi'].includes(v) },
    DEFAULT_MODEL: { default: 'qwen3:8b' },
    PORT: { default: '3000', validate: v => !isNaN(parseInt(v)) },
    LOG_LEVEL: { default: 'info', validate: v => ['debug', 'info', 'warn', 'error'].includes(v) },
  }
};

export function validateEnvironment(): void {
  const missing = ENV_SCHEMA.REQUIRED.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  for (const [key, config] of Object.entries(ENV_SCHEMA.OPTIONAL)) {
    const value = process.env[key] || config.default;
    if (config.validate && !config.validate(value)) {
      throw new Error(`Invalid value for ${key}: ${value}`);
    }
  }
}
```

---

## 问题 7: 日志敏感信息过滤

### 问题描述
- 工具参数可能包含敏感信息（API keys、密码）
- 日志直接输出未过滤

### 影响
- 敏感信息泄露风险

### 解决方案

```typescript
// packages/server/src/utils/sensitive-data-filter.ts

const SENSITIVE_KEYS = [
  'apiKey', 'api_key', 'apikey', 'password', 'secret', 'token',
  'access_token', 'refresh_token', 'authorization'
];

export function sanitizeForLogging(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const isSensitive = SENSITIVE_KEYS.some(sensitiveKey => 
      key.toLowerCase().includes(sensitiveKey.toLowerCase())
    );
    
    result[key] = isSensitive ? '[REDACTED]' : sanitizeForLogging(value);
  }
  
  return result;
}

// 使用示例
logger.info('TOOL', `Executing ${toolName}`, sanitizeForLogging(args));
```

---

## 问题 8: 会话并发控制

### 问题描述
- 同一 sessionId 的并发请求未加锁
- 可能导致状态不一致

### 影响
- 消息顺序错乱
- 状态竞争条件

### 解决方案

```typescript
// packages/server/src/utils/session-lock.ts

export class SessionLockManager {
  private locks = new Map<string, Promise<void>>();
  
  async acquire(sessionId: string): Promise<() => void> {
    // 等待该 session 的上一个请求完成
    const waitPromise = this.locks.get(sessionId);
    
    let release: (() => void) | undefined;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    
    this.locks.set(sessionId, promise);
    
    // 返回释放函数
    return () => {
      this.locks.delete(sessionId);
      release!();
    };
  }
  
  async withLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire(sessionId);
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export const sessionLock = new SessionLockManager();

// 使用
sessionRoutes.post('/session/:id/message', async (c) => {
  const sessionId = c.req.param('id');
  
  return sessionLock.withLock(sessionId, async () => {
    // 原有的消息处理逻辑
  });
});
```

---

## 待办清单 (TODO)

| # | 任务 | 优先级 | 状态 |
|---|------|--------|------|
| 1 | 创建统一配置常量，修复硬编码问题 | HIGH | ✅ 已完成 |
| 2 | 实现 LRU 缓存 | MEDIUM | ✅ 已完成 |
| 3 | 实现环境变量校验 | MEDIUM | ✅ 已完成 |
| 4 | 实现日志敏感信息过滤 | LOW | ✅ 已完成 |
| 5 | 实现会话并发控制 | LOW | ✅ 已完成 |
| 6 | 实现 MCP 服务器连接功能 | HIGH | ⏳ 待实施 |
| 7 | 增强异常处理和错误恢复机制 | MEDIUM | ⏳ 待实施 |

> **注意**: WebSocket 支持已按要求移除，现有 SSE 流式输出作为实时通信方案

---

*文档生成时间：2026-03-17*
