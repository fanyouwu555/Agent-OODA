# 记忆系统指南

本文档介绍 OODA Agent 记忆系统的功能和使用方法。

## 概述

记忆系统提供以下核心功能：

- **短期记忆**: 当前会话的上下文信息
- **长期记忆**: 持久化存储的事实、经验、技能和偏好
- **向量搜索**: 基于语义的智能检索
- **角色设定**: 预置的 Agent 角色和知识库

## 快速开始

### 1. 环境配置

复制环境变量示例文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置记忆系统：

```env
# 启用向量嵌入（需要 Ollama）
ENABLE_EMBEDDING=true
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
```

### 2. 安装 Ollama（可选）

如需使用向量搜索，安装 Ollama：

```bash
# 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 拉取嵌入模型
ollama pull nomic-embed-text
```

### 3. 启动服务

```bash
npm run dev:server
```

服务启动时会自动：
- 初始化 SQLite 数据库
- 加载记忆系统
- 加载默认角色设定

## 使用示例

### 存储记忆

```typescript
import { getSessionMemory } from '@ooda-agent/core';

const memory = getSessionMemory('session-id');

// 存储事实
await memory.storeFact(
  '用户喜欢使用 TypeScript',
  ['programming', 'typescript'],
  0.8
);

// 存储偏好
await memory.storePreference(
  '用户偏好中文交流',
  ['language'],
  0.9
);

// 存储经验
await memory.storeExperience(
  '成功完成文件操作',
  ['tool', 'file'],
  0.6
);

// 存储技能
await memory.storeSkill(
  '擅长 React 开发',
  ['frontend', 'react'],
  0.8
);
```

### 检索记忆

```typescript
// 语义检索
const memories = await memory.recall('编程语言', 5);

// 按类型检索
const facts = await memory.recallByType('fact');
const preferences = await memory.recallByType('preference');

// 高级搜索
const results = await memory.getLongTerm().search('查询内容', {
  useVectorSearch: true,
  limit: 5,
  threshold: 0.5,
  types: ['fact', 'experience']
});
```

### 角色设定

```typescript
import { initializePersonaManager, getPersonaManager } from '@ooda-agent/core';

// 初始化角色管理器
const personaManager = initializePersonaManager(memoryRepository);

// 加载角色
await personaManager.loadPersona('coder');

// 获取角色信息
const persona = personaManager.getPersona('coder');
console.log(persona.name);        // "Code Expert"
console.log(persona.description); // "A coding expert..."
```

### 自定义角色

```typescript
import { PersonaManager, PersonaConfig } from '@ooda-agent/core';

const customConfig: PersonaConfig = {
  defaultPersona: 'my-assistant',
  personas: [
    {
      id: 'my-assistant',
      name: 'My Assistant',
      description: 'A custom assistant',
      systemPrompt: 'You are a helpful assistant.',
      defaultTags: ['custom'],
      memories: [
        {
          id: 'custom-knowledge',
          content: '这是我的自定义知识',
          type: 'fact',
          tags: ['custom'],
          importance: 0.9
        }
      ]
    }
  ]
};

const manager = new PersonaManager(repository, customConfig);
await manager.loadPersona('my-assistant');
```

## 记忆类型

| 类型 | 说明 | 用途 |
|------|------|------|
| `fact` | 事实信息 | 用户偏好、项目信息 |
| `experience` | 经验记录 | 操作结果、错误处理 |
| `skill` | 技能知识 | 编程规范、最佳实践 |
| `preference` | 偏好设置 | 语言、风格偏好 |

## 向量搜索 vs 关键词搜索

### 向量搜索

- **优点**: 理解语义，支持同义词、相关概念
- **缺点**: 需要 Ollama 服务，计算开销大
- **适用**: 语义理解、概念关联

### 关键词搜索

- **优点**: 简单快速，无需额外服务
- **缺点**: 只能匹配字面内容
- **适用**: 精确匹配、简单查询

系统会自动降级：当向量搜索不可用时，自动使用关键词搜索。

## 配置选项

### 服务端配置

在 `packages/server/src/index.ts` 中：

```typescript
// 初始化存储
const storage = await createStorage('./data/agent.db');

// 初始化记忆系统
const enableEmbedding = process.env.ENABLE_EMBEDDING !== 'false';
initializeMemorySystem(storage.memories, enableEmbedding);

// 加载角色
const personaManager = initializePersonaManager(storage.memories);
await personaManager.loadDefaultPersona();
```

### 嵌入服务配置

```typescript
import { getEmbeddingService } from '@ooda-agent/core';

const embeddingService = getEmbeddingService({
  provider: 'ollama',
  model: 'nomic-embed-text',
  baseUrl: 'http://localhost:11434',
  dimensions: 768
});

const embedding = await embeddingService.getEmbedding('文本内容');
```

## 最佳实践

1. **重要性评分**: 使用 0-1 之间的值，重要信息用高分
2. **标签管理**: 使用一致的标签体系，便于分类检索
3. **定期清理**: 删除过期或不再相关的记忆
4. **向量缓存**: 嵌入结果会自动缓存，提高性能

## 故障排除

### 向量搜索不工作

- 检查 Ollama 是否运行：`curl http://localhost:11434/api/tags`
- 检查嵌入模型是否已下载：`ollama list`
- 查看日志中的错误信息

### 记忆无法持久化

- 检查数据库文件权限
- 确认磁盘空间充足
- 查看 SQLite 错误日志

### 性能问题

- 禁用向量嵌入（设置 `ENABLE_EMBEDDING=false`）
- 减少同时加载的角色数量
- 定期清理旧记忆

## API 参考

详见源码注释：
- `packages/core/src/memory/index.ts` - 会话记忆管理
- `packages/core/src/memory/long-term.ts` - 长期记忆
- `packages/core/src/memory/embedding.ts` - 向量嵌入
- `packages/core/src/memory/persona.ts` - 角色管理
