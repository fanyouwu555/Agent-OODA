# SQLite 持久化存储设计

## 概述

为 OODA Agent 添加 SQLite 持久化存储支持，实现会话、消息、工具调用和长期记忆的持久化存储。

## 设计目标

- 全部数据持久化（会话、消息、长期记忆、工具调用记录）
- 数据库文件存储在项目目录 `data/ooda-agent.db`
- 模块化设计，易于测试和扩展
- 支持未来切换到其他数据库

## 架构

```
packages/storage/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # 导出公共接口
    ├── database.ts           # 数据库连接管理
    ├── types.ts              # 类型定义
    ├── repositories/
    │   ├── base.repository.ts
    │   ├── session.repository.ts
    │   ├── message.repository.ts
    │   ├── toolcall.repository.ts
    │   └── memory.repository.ts
    └── migrations/
        └── 001-init.sql
```

## 数据库表结构

### sessions 表
- id: TEXT PRIMARY KEY
- created_at: INTEGER
- updated_at: INTEGER
- metadata: TEXT (JSON)

### messages 表
- id: TEXT PRIMARY KEY
- session_id: TEXT
- role: TEXT (user/assistant/system/tool)
- content: TEXT
- timestamp: INTEGER

### tool_calls 表
- id: TEXT PRIMARY KEY
- message_id: TEXT
- tool_name: TEXT
- args: TEXT (JSON)
- status: TEXT (running/success/error)
- result: TEXT (JSON)
- error: TEXT
- start_time: INTEGER
- end_time: INTEGER

### long_term_memories 表
- id: TEXT PRIMARY KEY
- content: TEXT
- embedding: TEXT (JSON)
- type: TEXT (fact/experience/skill/preference)
- source: TEXT
- tags: TEXT (JSON)
- related_ids: TEXT (JSON)
- importance: REAL
- created_at: INTEGER
- last_accessed: INTEGER

## 使用方式

```typescript
import { Database, SessionRepository, MessageRepository } from '@ooda-agent/storage';

const db = new Database('./data/ooda-agent.db');
await db.initialize();

const sessionRepo = new SessionRepository(db);
const session = await sessionRepo.create({ id: 'session-123' });
```

## 依赖

- better-sqlite3: 高性能同步 SQLite 绑定
