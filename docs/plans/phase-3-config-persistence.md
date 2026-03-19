# Phase 3: 配置持久化

> 所属项目：OODA Agent 系统重构
> 阶段序号：3/5
> 设计文档：docs/plans/2026-03-20-ooda-system-refactoring-design.md

---

## 1. 任务概述

### 1.1 目标
将 Agent 和权限配置从内存存储迁移到 SQLite 数据库，实现重启后配置持久化。

### 1.2 当前问题
- `agentRegistry` 使用内存 Map 存储
- `permissionConfigs` 使用内存变量存储
- 服务重启后配置丢失

### 1.3 验收标准
- [ ] 新增 `agent_configs` 表
- [ ] 新增 `permission_configs` 表
- [ ] 实现 `AgentConfigRepository`
- [ ] 实现 `PermissionConfigRepository`
- [ ] 重构 `agents.ts` 使用 Repository
- [ ] 重构 `permissions.ts` 使用 Repository
- [ ] 数据迁移脚本

---

## 2. 文件清单

### 2.1 新增文件

| 文件路径 | 描述 | 优先级 |
|----------|------|--------|
| `packages/storage/src/migrations/003_add_agent_configs.ts` | Agent 配置表迁移 | 🔴 高 |
| `packages/storage/src/migrations/004_add_permission_configs.ts` | 权限配置表迁移 | 🔴 高 |
| `packages/storage/src/repositories/agent-config.ts` | Agent 配置 Repository | 🔴 高 |
| `packages/storage/src/repositories/permission-config.ts` | 权限配置 Repository | 🔴 高 |
| `packages/storage/src/scripts/migrate-configs.ts` | 数据迁移脚本 | 🟡 中 |
| `packages/storage/src/repositories/__tests__/agent-config.test.ts` | 测试 | 🟡 中 |

### 2.2 修改文件

| 文件路径 | 修改内容 | 优先级 |
|----------|----------|--------|
| `packages/server/src/routes/agents.ts` | 使用 Repository | 🔴 高 |
| `packages/server/src/routes/permissions.ts` | 使用 Repository | 🔴 高 |
| `packages/server/src/index.ts` | 初始化 Repository | 🟡 中 |
| `packages/storage/src/database.ts` | 添加表创建语句 | 🟡 中 |

---

## 3. 详细实施步骤

### 3.1 Step 1: 创建数据库迁移

**文件**: `packages/storage/src/migrations/003_add_agent_configs.ts`

```typescript
import { DatabaseManager } from '../database';

export async function up(db: DatabaseManager): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS agent_configs (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      config TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_agent_configs_name
    ON agent_configs(name)
  `);
}

export async function down(db: DatabaseManager): Promise<void> {
  await db.execute(`DROP TABLE IF EXISTS agent_configs`);
}
```

**文件**: `packages/storage/src/migrations/004_add_permission_configs.ts`

```typescript
export async function up(db: DatabaseManager): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS permission_configs (
      id TEXT PRIMARY KEY,
      agent_id TEXT,
      config_type TEXT NOT NULL,
      config TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agent_configs(id)
    )
  `);
}
```

### 3.2 Step 2: 实现 AgentConfigRepository

**文件**: `packages/storage/src/repositories/agent-config.ts`

```typescript
interface AgentConfigRecord {
  id: string;
  name: string;
  config: string;  // JSON stringified AgentConfigV2
  created_at: number;
  updated_at: number;
}

export class AgentConfigRepository {
  constructor(private db: DatabaseManager) {}

  async create(input: {
    id: string;
    name: string;
    config: AgentConfigV2;
  }): Promise<AgentConfigRecord> {
    const now = Date.now();
    const configJson = JSON.stringify(input.config);

    await this.db.execute(
      `INSERT INTO agent_configs (id, name, config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [input.id, input.name, configJson, now, now]
    );

    return { id: input.id, name: input.name, config: configJson, created_at: now, updated_at: now };
  }

  async findById(id: string): Promise<AgentConfigRecord | null> {
    const result = await this.db.query(
      'SELECT * FROM agent_configs WHERE id = ?',
      [id]
    );
    return result.rows[0] || null;
  }

  async findByName(name: string): Promise<AgentConfigRecord | null> {
    const result = await this.db.query(
      'SELECT * FROM agent_configs WHERE name = ?',
      [name]
    );
    return result.rows[0] || null;
  }

  async findAll(): Promise<AgentConfigRecord[]> {
    const result = await this.db.query(
      'SELECT * FROM agent_configs ORDER BY created_at DESC'
    );
    return result.rows;
  }

  async update(id: string, config: Partial<AgentConfigV2>): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) return false;

    const updatedConfig = { ...JSON.parse(existing.config), ...config };
    const configJson = JSON.stringify(updatedConfig);

    await this.db.execute(
      'UPDATE agent_configs SET config = ?, updated_at = ? WHERE id = ?',
      [configJson, Date.now(), id]
    );

    return true;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM agent_configs WHERE id = ?',
      [id]
    );
    return result.changes > 0;
  }
}
```

### 3.3 Step 3: 实现 PermissionConfigRepository

**文件**: `packages/storage/src/repositories/permission-config.ts`

```typescript
export class PermissionConfigRepository {
  constructor(private db: DatabaseManager) {}

  async saveGlobal(config: GlobalPermissionConfig): Promise<boolean> {
    const id = 'global';
    const configJson = JSON.stringify(config);
    const now = Date.now();

    await this.db.execute(`
      INSERT INTO permission_configs (id, config_type, config, created_at, updated_at)
      VALUES (?, 'global', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET config = ?, updated_at = ?
    `, [id, configJson, now, now, configJson, now]);

    return true;
  }

  async getGlobal(): Promise<GlobalPermissionConfig | null> {
    const result = await this.db.query(
      "SELECT config FROM permission_configs WHERE id = 'global'"
    );
    if (!result.rows[0]) return null;
    return JSON.parse(result.rows[0].config);
  }

  async saveAgent(agentId: string, config: AgentPermissionConfig): Promise<boolean> {
    const id = `agent_${agentId}`;
    const configJson = JSON.stringify(config);
    const now = Date.now();

    await this.db.execute(`
      INSERT INTO permission_configs (id, agent_id, config_type, config, created_at, updated_at)
      VALUES (?, ?, 'agent', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET config = ?, updated_at = ?
    `, [id, agentId, configJson, now, now, configJson, now]);

    return true;
  }

  async getAgent(agentId: string): Promise<AgentPermissionConfig | null> {
    const result = await this.db.query(
      "SELECT config FROM permission_configs WHERE agent_id = ? AND config_type = 'agent'",
      [agentId]
    );
    if (!result.rows[0]) return null;
    return JSON.parse(result.rows[0].config);
  }

  async findAll(): Promise<PermissionConfigRecord[]> {
    return (await this.db.query('SELECT * FROM permission_configs')).rows;
  }
}
```

### 3.4 Step 4: 重构 agents.ts

**文件**: `packages/server/src/routes/agents.ts`

```typescript
// 添加 Repository 依赖
import { AgentConfigRepository } from '@agent共storage/repositories/agent-config';

let agentConfigRepository: AgentConfigRepository;

export async function initializeAgents(config: { storageDir: string }) {
  const db = getDatabase();
  agentConfigRepository = new AgentConfigRepository(db);

  // 从数据库加载所有 Agent
  const configs = await agentConfigRepository.findAll();
  for (const record of configs) {
    const agentConfig = JSON.parse(record.config) as AgentConfigV2;
    agentRegistry.register(record.name, {
      ...agentConfig,
      id: record.id,
    });
  }

  console.log(`[Agents] Loaded ${configs.length} agents from database`);
}

// 修改 createAgent
export async function createAgent(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { name, config } = req.body;

    // 验证 name 唯一性
    const existing = await agentConfigRepository.findByName(name);
    if (existing) {
      return res.status(409).json({ error: 'Agent name already exists' });
    }

    const id = generateId();
    await agentConfigRepository.create({ id, name, config });

    // 注册到内存（保持兼容性）
    agentRegistry.register(name, { ...config, id });

    res.status(201).json({ id, name, ...config });
  } catch (error) {
    next(error);
  }
}

// 类似修改 updateAgent, deleteAgent
```

### 3.5 Step 5: 创建数据迁移脚本

**文件**: `packages/storage/src/scripts/migrate-configs.ts`

```typescript
import { DatabaseManager } from '../database';
import { AgentConfigRepository } from '../repositories/agent-config';
import { PermissionConfigRepository } from '../repositories/permission-config';

async function migrate() {
  console.log('[Migration] Starting config migration...');

  const db = new DatabaseManager('./data/storage.db');
  await db.initialize();

  const agentRepo = new AgentConfigRepository(db);
  const permRepo = new PermissionConfigRepository(db);

  // 检查是否已有数据
  const existing = await agentRepo.findAll();
  if (existing.length > 0) {
    console.log('[Migration] Configs already exist, skipping...');
    return;
  }

  // TODO: 从内存加载现有配置并写入数据库
  // 这需要访问 server 包的内存变量

  console.log('[Migration] Config migration complete');
  await db.close();
}
```

---

## 4. 测试计划

### 4.1 单元测试

```bash
npm test -- --testPathPattern="agent-config.test.ts"
npm test -- --testPathPattern="permission-config.test.ts"
```

### 4.2 集成测试

```bash
# 测试完整的 CRUD 流程
npm test -- --testPathPattern="integration.test.ts"
```

### 4.3 手动验证

1. 创建 Agent，重启服务，验证 Agent 仍然存在
2. 修改权限配置，重启服务，验证配置仍然有效

---

## 5. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 数据迁移丢失 | 中 | 高 | 迁移前备份 |
| 双写不一致 | 中 | 中 | 使用事务 |
| 迁移脚本执行失败 | 低 | 高 | 添加重试和回滚 |

---

## 6. 时间估算

| 步骤 | 预估时间 |
|------|----------|
| Step 1: 数据库迁移 | 1h |
| Step 2: AgentConfigRepository | 2h |
| Step 3: PermissionConfigRepository | 2h |
| Step 4: 重构 agents.ts | 2h |
| Step 5: 重构 permissions.ts | 2h |
| Step 6: 数据迁移脚本 | 2h |
| 测试与修复 | 3h |
| **总计** | **14h** |

---

## 7. 依赖项

- SQLite3
- 现有 DatabaseManager
- 现有 Agent/权限类型定义

---

## 8. 下游阶段

Phase 3 完成后：
- Agent 和权限配置将持久化存储
- 支持配置的备份和恢复

---

*阶段负责人：待定*
*创建日期：2026-03-20*
