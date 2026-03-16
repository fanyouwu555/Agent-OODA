# OODA Agent 文档

本文档是 OODA Agent 的完整指南，包含快速开始、API 参考、架构说明和扩展开发。

---

## 目录

1. [快速开始](#快速开始)
2. [用户指南](#用户指南)
3. [API 参考](#api-参考)
4. [架构设计](#架构设计)
5. [扩展开发](#扩展开发)
6. [本地模型部署](#本地模型部署)

---

## 快速开始

### 环境要求

- Node.js 18+
- npm 或 pnpm
- (可选) Ollama - 用于本地模型支持

### 安装步骤

```bash
# 1. 克隆项目
git clone https://github.com/your-repo/ooda-agent.git
cd ooda-agent

# 2. 安装依赖
npm install --registry=https://registry.npmmirror.com

# 3. 构建项目
npm run build

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入必要的配置
```

### 启动服务

```bash
# 同时启动前后端
npm run dev

# 或分别启动
npm run dev:server  # 后端 http://localhost:3000
npm run dev:app     # 前端 http://localhost:5173
```

### 验证安装

```bash
# 健康检查
curl http://localhost:3000/health
# 预期: {"status": "ok", "timestamp": 1234567890}

# 查看模型列表
curl http://localhost:3000/api/models

# 创建测试会话
curl -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"message": "你好"}'
```

---

## 用户指南

### 功能概述

OODA Agent 是基于 OODA 循环策略的智能代理系统：

- **智能对话**: 基于 OODA 循环的理解和响应
- **文件操作**: 读取、写入、编辑文件
- **网络搜索**: 搜索互联网信息
- **代码执行**: 运行代码片段
- **数据分析**: 分析数据并生成报告
- **Git 操作**: 执行 Git 命令

### 界面说明

```
┌─────────────────────────────────────────────────────────┐
│  OODA Agent                                    [设置]  │
├────────────────┬────────────────────────────────────────┤
│                │                                        │
│  会话列表       │           消息区域                     │
│  ┌──────────┐  │           ┌─────────────────────┐     │
│  │ 会话 1   │  │           │ 用户: 你好          │     │
│  │ 会话 2   │  │           │ Agent: 你好！       │     │
│  └──────────┘  │           │                     │     │
│                │           │ [思考过程...]        │     │
│ [+ 新建会话]   │           │                     │     │
│                │           │ [工具调用: read_file]│     │
└────────────────┴────────────────────────────────────────┘
│  [输入消息...]                              [发送]      │
└─────────────────────────────────────────────────────────┘
```

### 技能使用

**文件操作:**
```
读取文件：/path/to/file.txt
写入文件：/path/to/file.txt，内容：Hello World
编辑文件：/path/to/file.txt，将 "old" 替换为 "new"
```

**网络搜索:**
```
搜索：AI Agent 技术
获取网页：https://example.com
```

**代码执行:**
```
执行代码：
```python
print("Hello, World!")
```
```

**Git 操作:**
```
查看 Git 状态
提交更改：提交信息
查看提交历史
```

### 权限系统

| 权限级别 | 说明 | 示例 |
|----------|------|------|
| `allow` | 自动允许 | 文件读取、搜索 |
| `ask` | 需要确认 | 文件写入、命令执行 |
| `deny` | 自动拒绝 | 访问系统敏感目录 |

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 发送消息 |
| `Shift + Enter` | 换行 |
| `Ctrl + N` | 新建会话 |

---

## API 参考

### 基础信息

- **基础 URL**: `http://localhost:3000`
- **SSE 事件流**: `http://localhost:3000/api/events`
- **内容类型**: `application/json`

### 会话管理

#### 创建会话

```http
POST /api/session
Content-Type: application/json

{
  "message": "可选的初始消息"
}
```

**响应:**
```json
{
  "sessionId": "uuid-string",
  "status": "created"
}
```

#### 获取会话历史

```http
GET /api/session/{sessionId}/history
```

#### 删除会话

```http
DELETE /api/session/{sessionId}
```

### 消息接口

#### 发送消息 (SSE 流式)

```http
POST /api/session/{sessionId}/message
Content-Type: application/json

{
  "message": "你的消息"
}
```

**响应:** Server-Sent Events 流

| 事件 | 说明 |
|------|------|
| `thinking` | 思考过程 |
| `intent` | 意图识别结果 |
| `reasoning` | 决策理由 |
| `content` | 流式内容输出 |
| `tool_call` | 工具调用开始 |
| `tool_result` | 工具执行结果 |
| `result` | 最终结果 |
| `end` | 流结束标记 |
| `error` | 错误信息 |

### 模型管理

#### 获取模型列表

```http
GET /api/models
```

**响应:**
```json
{
  "providers": [
    {
      "id": "local-ollama",
      "name": "Local Ollama",
      "type": "ollama",
      "models": [
        { "id": "qwen3:8b", "name": "Qwen3 8B" }
      ]
    }
  ],
  "activeModel": {
    "providerName": "local-ollama",
    "modelName": "qwen3:8b"
  }
}
```

#### 切换模型

```http
POST /api/models/switch
Content-Type: application/json

{
  "providerName": "local-ollama",
  "modelName": "qwen3:8b"
}
```

### SSE 事件流

#### 连接

```javascript
const eventSource = new EventSource('http://localhost:3000/api/events');
// 或指定会话
const eventSource = new EventSource('http://localhost:3000/api/events?session=session-123');
```

#### 事件命名空间

| 命名空间 | 说明 |
|----------|------|
| `session` | 会话生命周期事件 |
| `message` | 消息相关事件 |
| `tool` | 工具调用事件 |
| `permission` | 权限请求事件 |
| `agent` | Agent 状态事件 |
| `system` | 系统事件 |

### JavaScript 示例

```javascript
// 创建会话
const response = await fetch('http://localhost:3000/api/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: '你好' })
});
const { sessionId } = await response.json();

// 发送消息（SSE 流式）
const eventSource = new EventSource(
  `http://localhost:3000/api/session/${sessionId}/message`
);

eventSource.addEventListener('thinking', (event) => {
  const data = JSON.parse(event.data);
  console.log('思考:', data.content);
});

eventSource.addEventListener('content', (event) => {
  const data = JSON.parse(event.data);
  process.stdout.write(data.content); // 流式输出
});

eventSource.addEventListener('end', (event) => {
  console.log('处理完成');
  eventSource.close();
});
```

---

## 架构设计

### OODA 循环架构

OODA Agent 基于 OODA 循环（Observe-Orient-Decide-Act）构建：

```
┌─────────────────────────────────────────────────────────────┐
│                        OODA Loop                            │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐ │
│  │ Observe  │───▶│  Orient  │───▶│  Decide  │───▶│  Act   │ │
│  │  观察    │    │  定向    │    │  决策    │    │  执行  │ │
│  └──────────┘    └──────────┘    └──────────┘    └────────┘ │
│        ▲                                            │       │
│        └────────────────────────────────────────────┘       │
│                         Feedback                            │
└─────────────────────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 职责 | 位置 |
|------|------|------|
| `OODALoop` | 主循环协调 | `packages/core/src/ooda/loop.ts` |
| `Observe` | 输入处理、意图识别 | `packages/core/src/ooda/observe.ts` |
| `Orient` | 上下文分析、策略选择 | `packages/core/src/ooda/orient.ts` |
| `Decide` | 决策生成 | `packages/core/src/ooda/decide.ts` |
| `Act` | 工具执行 | `packages/core/src/ooda/act.ts` |
| `EventBus` | 事件发布订阅 | `packages/core/src/event-bus/index.ts` |
| `MemorySystem` | 记忆管理 | `packages/core/src/memory/index.ts` |

### 数据流

```
用户输入 → Observe → Orient → Decide → Act → 输出
                ↓         ↓        ↓      ↓
            EventBus ← MemorySystem ← Feedback
```

### 使用 OODALoop

```typescript
import { OODALoop, createConsoleStreamingHandler } from '@ooda-agent/core';

const loop = new OODALoop('session-id');

// 启用流式输出
const handler = createConsoleStreamingHandler();
loop.enableStreaming(handler, {
  enabled: true,
  showThinking: true,
  showProgress: true,
});

// 运行
const result = await loop.run('你的输入');
console.log(result.output);
```

---

## 扩展开发

### 创建自定义技能

```typescript
import { z } from 'zod';
import { BaseSkill } from '@ooda-agent/tools';
import { SkillContext } from '@ooda-agent/core';

export class MyCustomSkill extends BaseSkill {
  name = 'my_custom_skill';
  description = '我的自定义技能';
  category = 'custom';
  version = '1.0.0';
  dependencies: string[] = [];
  
  schema = z.object({
    action: z.enum(['action1', 'action2']),
    param: z.string(),
  });
  
  permissions = [
    { type: 'file_read', pattern: '**/*' },
  ];
  
  async execute(input: unknown, context: SkillContext): Promise<unknown> {
    const { action, param } = input as { action: string; param: string };
    // 实现你的逻辑
    return { result: `处理: ${param}` };
  }
}
```

### 注册技能

```typescript
import { registerSkill } from '@ooda-agent/core';
import { MyCustomSkill } from './my-custom-skill';

registerSkill(new MyCustomSkill());
```

### 使用 MCP 服务

```typescript
import { getMCPService } from '@ooda-agent/core';

const mcp = getMCPService();

// 发布事件
await mcp.publishEvent('custom.event', { data: 'value' });

// 订阅事件
const subscriptionId = mcp.subscribe('agent.message', (message) => {
  console.log('收到消息:', message.payload);
});

// 取消订阅
mcp.unsubscribe(subscriptionId);
```

---

## 本地模型部署

### 安装 Ollama

**Windows/macOS:**
访问 [Ollama 官网](https://ollama.com/download) 下载安装包

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 部署模型

```bash
# 拉取 Qwen3 8B
ollama pull qwen3:8b

# 验证
ollama list
```

### 配置项目

编辑 `config/local-model.json`：

```json
{
  "providers": [
    {
      "id": "local-ollama",
      "name": "Local Ollama",
      "type": "ollama",
      "baseUrl": "http://localhost:11434",
      "models": [
        { "id": "qwen3:8b", "name": "Qwen3 8B" }
      ]
    }
  ]
}
```

### 启动服务

```bash
# 启动 Ollama
ollama serve

# 启动 OODA Agent
npm run dev
```

### 性能要求

| 模型 | 最低内存 | 推荐内存 |
|------|----------|----------|
| qwen3:8b | 8GB | 16GB |
| qwen3:72b | 32GB | 64GB |

---

## 故障排除

### 常见问题

**端口被占用:**
服务会自动切换到其他端口，查看控制台输出获取实际端口号。

**前端无法连接后端:**
创建 `packages/app/.env.local`：
```
VITE_API_PORT=3001
```

**Ollama 连接失败:**
```bash
# 检查服务状态
ollama list

# 测试 API
curl http://localhost:11434/api/tags
```

### 调试命令

```bash
# 测试 SSE 端点
curl -N http://localhost:3000/api/events

# 检查事件流
curl -N http://localhost:3000/api/events?session=test

# 检查订阅状态
curl http://localhost:3000/api/events/status
```

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 同时启动前后端 |
| `npm run dev:server` | 仅启动后端 |
| `npm run dev:app` | 仅启动前端 |
| `npm run build` | 构建所有包 |
| `npm run test` | 运行测试 |
| `npm run lint` | 运行代码检查 |

---

## 获取帮助

- **GitHub Issues**: https://github.com/your-repo/ooda-agent/issues
- **文档**: https://docs.ooda-agent.com
