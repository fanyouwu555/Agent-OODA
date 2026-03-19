# OODA Agent 项目说明文档

## 1. 项目概述

**OODA Agent** 是一个基于 **OODA (Observe-Orient-Decide-Act)** 循环架构的 AI Agent 系统，采用 ReAct 和 PEV (Prompt-Execution-Validation) 架构设计。该系统旨在提供一个灵活、可扩展的智能代理框架，支持多模型集成、工具调用、记忆管理和权限控制。

### 核心特性
- **OODA 循环引擎**：四阶段认知循环（观察→定向→决策→行动）
- **多模型支持**：支持 Ollama、OpenAI、Kimi (Moonshot) 等多种 LLM 提供商
- **工具系统**：内置文件操作、搜索、网络请求等多种工具
- **记忆系统**：短期记忆、长期记忆、人格记忆、向量嵌入
- **权限管理**：基于角色的细粒度权限控制
- **流式输出**：支持 Server-Sent Events (SSE) 流式响应
- **MCP 集成**：支持 Model Context Protocol 扩展

---

## 2. 技术栈清单

### 编程语言
| 语言 | 版本 | 说明 |
|------|------|------|
| TypeScript | ^5.4.3 | 主开发语言 |
| JavaScript | ES2022 | 编译目标 |

### 核心框架与库
| 名称 | 版本 | 用途 |
|------|------|------|
| Hono | ^4.0.0 | HTTP Web 框架 |
| Node.js | - | 运行时环境 |
| zod | ^3.22.4 | 数据验证 |
| sql.js | ^1.10.0 | SQLite 内存数据库 |
| jsonwebtoken | ^9.0.3 | JWT 认证 |
| ws | ^8.16.0 | WebSocket 支持 |
| dotenv | ^17.3.1 | 环境变量加载 |

### 开发工具
| 名称 | 版本 | 用途 |
|------|------|------|
| TypeScript | ^5.4.3 | 类型检查与编译 |
| Vitest | ^1.4.0 | 单元测试框架 |
| ESLint | ^8.57.0 | 代码规范检查 |
| tsx | ^4.7.0 | TypeScript 执行器 |

### LLM 提供商
- **Ollama** (本地模型)
- **OpenAI** (GPT 系列)
- **Kimi** (Moonshot AI)
- **OpenAI Compatible API** (兼容 OpenAI 的第三方 API)

---

## 3. 工程模块与目录结构

```
ooda-agent/
├── packages/
│   ├── core/              # 核心 OODA 引擎
│   │   └── src/
│   │       ├── ooda/          # OODA 循环实现
│   │       │   ├── loop.ts       # 主循环调度器
│   │       │   ├── observe.ts    # Observe 阶段
│   │       │   ├── orient.ts      # Orient 阶段
│   │       │   ├── decide.ts      # Decide 阶段
│   │       │   ├── act.ts         # Act 阶段
│   │       │   ├── streaming.ts   # 流式输出
│   │       │   └── types.ts       # 类型定义
│   │       ├── llm/           # LLM 集成
│   │       │   ├── provider.ts    # 提供商接口
│   │       │   ├── service.ts    # LLM 服务
│   │       │   ├── ollama.ts     # Ollama 提供商
│   │       │   └── openai-compatible.ts
│   │       ├── memory/         # 记忆系统
│   │       │   ├── short-term.ts     # 短期记忆
│   │       │   ├── long-term.ts      # 长期记忆
│   │       │   ├── embedding.ts      # 向量嵌入
│   │       │   ├── persona.ts        # 人格记忆
│   │       │   └── context-compressor.ts
│   │       ├── tool/           # 工具系统
│   │       │   ├── registry.ts      # 工具注册表
│   │       │   └── interface.ts      # 工具接口
│   │       ├── permission/      # 权限管理
│   │       ├── skill/          # Skill 系统
│   │       ├── mcp/            # MCP 协议
│   │       ├── workflow/       # 工作流
│   │       ├── collaboration/  # 协作系统
│   │       └── event-bus/      # 事件总线
│   │
│   ├── server/             # HTTP 服务器
│   │   └── src/
│   │       ├── index.ts        # 入口文件
│   │       ├── routes/         # API 路由
│   │       │   ├── session.ts      # 会话管理
│   │       │   ├── agents.ts      # Agent 管理
│   │       │   ├── tools.ts       # 工具查询
│   │       │   ├── auth.ts        # 认证
│   │       │   ├── permissions.ts # 权限
│   │       │   ├── events.ts      # 事件
│   │       │   └── logging.ts    # 日志
│   │       └── middleware/      # 中间件
│   │
│   ├── tools/             # 工具实现
│   │   └── src/
│   │       ├── base-tool.ts     # 基础工具
│   │       ├── web-tools.ts     # 网络工具
│   │       ├── git-tools.ts     # Git 工具
│   │       ├── utility-tools.ts # 实用工具
│   │       └── skills/          # Skill 实现
│   │
│   ├── storage/           # 数据存储
│   │   └── src/
│   │       ├── database.ts      # SQLite 管理
│   │       └── repositories/    # 数据仓库
│   │
│   └── app/               # 前端应用
│
├── config/                # 配置文件
│   ├── config.v2.json     # Agent 配置
│   └── local-model.json   # 本地模型配置
│
├── scripts/               # 脚本
│   └── start.ts          # 启动脚本
│
└── package.json           # 根包配置
```

---

## 4. 功能模块列表

### 4.1 OODA 循环引擎 (packages/core/src/ooda/)

| 模块 | 功能 | 关键实现 |
|------|------|----------|
| **Observe (观察)** | 收集环境信息、检测异常、识别模式 | `observe.ts` |
| **Orient (定向)** | 分析用户意图、识别约束、发现知识缺口 | `orient.ts` |
| **Decide (决策)** | 生成选项、选择最佳方案、制定行动计划 | `decide.ts` |
| **Act (行动)** | 执行工具/技能、验证结果、生成反馈 | `act.ts` |
| **Loop (调度)** | 协调四阶段循环、管理迭代、缓存、适应策略 | `loop.ts` |

### 4.2 记忆系统 (packages/core/src/memory/)

| 模块 | 功能 |
|------|------|
| **短期记忆 (short-term)** | 会话级消息存储、上下文管理 |
| **长期记忆 (long-term)** | 持久化存储、事实/经验/技能/偏好 |
| **人格记忆 (persona)** | Agent 个性化配置 |
| **向量嵌入 (embedding)** | 语义搜索支持（可选） |
| **上下文压缩 (context-compressor)** | 长对话上下文压缩 |

### 4.3 LLM 集成 (packages/core/src/llm/)

| 模块 | 功能 |
|------|------|
| **Provider 接口** | 统一的 LLM 提供商抽象 |
| **Ollama** | 本地模型支持 |
| **OpenAI** | OpenAI API 兼容 |
| **Kimi** | Moonshot AI 支持 |
| **Service** | LLM 调用封装 |

### 4.4 工具系统 (packages/tools/src/)

| 类别 | 工具 |
|------|------|
| **文件系统** | read, write, edit, delete, list, glob |
| **搜索** | grep, glob |
| **网络** | webfetch, web_search |
| **Git** | git status, git diff, git log 等 |
| **实用** | calculator, weather, translate, timer, uuid, base64, hash, random, color |

### 4.5 Skill 系统 (packages/tools/src/skills/)

| Skill | 功能 |
|-------|------|
| **FileSkill** | 文件处理 |
| **WebSkill** | Web 操作 |
| **CodeSkill** | 代码分析 |
| **DataAnalysisSkill** | 数据分析 |
| **ImageProcessingSkill** | 图像处理 |
| **PDFProcessingSkill** | PDF 处理 |
| **CodeAnalysisSkill** | 代码分析 |
| **APITestSkill** | API 测试 |
| **DatabaseQuerySkill** | 数据库查询 |

### 4.6 权限管理 (packages/core/src/permission/)

- **基础权限**: allow/ask/deny 三种模式
- **增强权限管理器**: 基于路径、命令、正则的模式匹配
- **权限组**: readonly, dangerous 等预定义组

### 4.7 其他模块

| 模块 | 功能 |
|------|------|
| **MCP Service** | Model Context Protocol 消息服务 |
| **Workflow** | Pocket Flow 工作流引擎 |
| **Collaboration** | 多 Agent 协作编排 |
| **Event Bus** | 事件驱动架构 |
| **Pattern Store** | 模式识别与存储 |

---

## 5. API 接口文档

### 5.1 认证相关 (Auth)

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| POST | /api/auth/login | 用户登录 | `{username, password}` | `{token, user}` |
| POST | /api/auth/logout | 用户登出 | - | `{success}` |
| GET | /api/auth/me | 获取当前用户 | - | `{user}` |

### 5.2 会话管理 (Session)

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| POST | /api/session | 创建新会话 | - | `{sessionId}` |
| POST | /api/session/:id/message | 发送消息 (SSE) | `{message}` | Stream |
| GET | /api/session/:id | 获取会话详情 | - | `{session, messages}` |
| GET | /api/session/:id/history | 获取会话历史 | - | `[messages]` |
| DELETE | /api/session/:id | 删除会话 | - | `{success}` |
| GET | /api/sessions | 获取所有会话 | - | `[sessions]` |
| GET | /api/sessions/search | 搜索会话 | `?q=query` | `[sessions]` |
| PATCH | /api/session/:id/title | 更新会话标题 | `{title}` | `{success}` |
| PATCH | /api/session/:id/archive | 归档会话 | - | `{success}` |
| PATCH | /api/session/:id/restore | 恢复会话 | - | `{success}` |
| POST | /api/session/:id/confirm | 权限确认 | `{confirmationId, allowed}` | `{success}` |
| DELETE | /api/sessions | 清空所有会话 | - | `{success}` |
| DELETE | /api/sessions/old | 清理旧会话 | `?days=30` | `{success}` |

### 5.3 Agent 管理 (Agents)

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| GET | /api/agents | 获取所有 Agent | `{agents, default}` |
| GET | /api/agents/:name | 获取单个 Agent | `{agent}` |
| POST | /api/agents | 创建新 Agent | `{agent}` |
| PATCH | /api/agents/:name | 更新 Agent | `{agent}` |
| DELETE | /api/agents/:name | 删除 Agent | `{success}` |
| POST | /api/agents/:name/enable | 启用 Agent | `{agent}` |
| POST | /api/agents/:name/disable | 禁用 Agent | `{agent}` |
| POST | /api/agents/default | 设置默认 Agent | `{success}` |

### 5.4 工具 (Tools)

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| GET | /api/tools | 获取所有工具 | `{tools, groups}` |
| GET | /api/tools/:name | 获取单个工具 | `{tool}` |
| GET | /api/tools/groups | 获取工具分组 | `[groups]` |

### 5.5 权限 (Permissions)

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| GET | /api/permissions | 获取权限配置 | `{permissions}` |
| POST | /api/permissions/check | 检查权限 | `{allowed, mode}` |

### 5.6 模型 (Models)

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| GET | /api/models | 获取所有模型 | `{providers, activeModel}` |
| GET | /api/models/active | 获取当前模型 | `{activeModel}` |
| POST | /api/models/switch | 切换模型 | `{success, activeModel}` |

### 5.7 其他端点

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| GET | /health | 健康检查 | `{status, timestamp, ...}` |
| GET | /api/skills | 获取所有 Skills | `[skills]` |
| GET | /api/events | Server-Sent Events | Stream |
| GET | /api/logging | 日志查询 | `[logs]` |

### SSE 事件类型

会话消息接口支持以下 Server-Sent Events：

| 事件名 | 说明 | 数据 |
|--------|------|------|
| `thinking` | 思考中状态 | `{content}` |
| `intent` | 识别到的意图 | `{content}` |
| `reasoning` | 推理过程 | `{content}` |
| `message.part` | 消息片段 | `{part, isComplete}` |
| `content` | 内容块 | `{content, isComplete}` |
| `tool_call` | 工具调用 | `{toolCall, status}` |
| `tool_result` | 工具结果 | `{toolCall, status}` |
| `result` | 最终结果 | `{content}` |
| `error` | 错误信息 | `{content}` |
| `end` | 结束标记 | `{type, status}` |

---

## 6. 已实现功能清单

### 6.1 OODA 循环
- ✅ **四阶段循环执行**：Observe → Orient → Decide → Act
- ✅ **至少执行一轮**：循环确保每个阶段都会执行
- ✅ **迭代控制**：默认最大 10 次迭代，可配置
- ✅ **超时处理**：默认 5 分钟超时
- ✅ **缓存机制**：观察、定向、决策结果缓存

### 6.2 流式输出
- ✅ **SSE 流式响应**：实时推送思考过程和内容
- ✅ **分块内容推送**：按块发送最终响应
- ✅ **事件回调**：各阶段事件可订阅

### 6.3 记忆系统
- ✅ **短期记忆**：会话消息存储
- ✅ **长期记忆**：持久化事实/经验/技能/偏好
- ✅ **人格记忆**：默认人格加载
- ✅ **上下文压缩**：超过阈值自动压缩
- ✅ **向量嵌入**：可选启用语义搜索

### 6.4 工具系统
- ✅ **工具注册与发现**：统一工具注册表
- ✅ **工具分组**：按功能分组
- ✅ **权限控制**：基于工具的细粒度权限
- ✅ **工具执行**：统一执行接口

### 6.5 权限管理
- ✅ **三种模式**：allow / ask / deny
- ✅ **模式匹配**：支持通配符和正则
- ✅ **权限组**：预定义只读、危险操作组
- ✅ **用户确认**：需要确认的操作通过 SSE 推送

### 6.6 会话管理
- ✅ **会话创建/删除**
- ✅ **消息历史**
- ✅ **会话归档/恢复**
- ✅ **会话搜索**
- ✅ **自动标题生成**

### 6.7 LLM 集成
- ✅ **多提供商支持**：Ollama、OpenAI、Kimi
- ✅ **动态模型切换**
- ✅ **Ollama 预热**

---

## 7. 潜在问题与待完善点

### 7.1 硬编码问题
- ⚠️ **默认模型硬编码**：多处硬编码 `moonshot-v1-8k` 作为默认模型
- ⚠️ **超时时间硬编码**：`60000ms` 确认超时在 session.ts 中

### 7.2 待完成功能
- ⚠️ **Agent 模板系统**：config.v2.json 中定义了模板，但运行时模板继承逻辑可能未完全实现
- ⚠️ **MCP 服务器连接**：配置文件中的 MCP 服务器配置未被实际使用
- ⚠️ **WebSocket 支持**：代码中有 WebSocket 相关逻辑但未完全启用

### 7.3 异常处理
- ⚠️ **错误恢复**：部分错误处理不够完善，异常可能未正确传播
- ⚠️ **数据库错误**：批量写入失败时的恢复机制简化

### 7.4 性能隐患
- ⚠️ **缓存无淘汰策略**：使用简单的大小限制，可能导致内存泄漏
- ⚠️ **数据库自动保存**：频繁写入可能影响性能
- ⚠️ **历史消息无限增长**：虽然有压缩，但最大历史大小仅 100 条

### 7.5 配置问题
- ⚠️ **配置加载优先级**：多处配置加载路径，优先级不明确
- ⚠️ **缺少环境变量校验**：启动时未校验必要环境变量

### 7.6 其他
- ⚠️ **日志敏感信息**：可能记录敏感数据
- ⚠️ **并发会话**：未发现会话并发控制机制

---

## 8. 运行与部署说明

### 8.1 环境要求

| 要求 | 详情 |
|------|------|
| Node.js | >= 18.0.0 |
| npm | >= 9.0.0 |
| Ollama (可选) | >= 0.1.0 |

### 8.2 环境变量配置

创建 `.env` 文件（参考 `.env.example`）：

```bash
# 记忆系统
ENABLE_EMBEDDING=true
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768

# 数据库
DB_PATH=./data/agent.db

# LLM 配置
DEFAULT_PROVIDER=ollama
OLLAMA_MODEL=qwen3:8b
OLLAMA_URL=http://localhost:11434
KIMI_API_KEY=your_kimi_api_key
OPENAI_API_KEY=your_openai_api_key

# 服务器
PORT=3000
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
NODE_ENV=development

# 日志
LOG_LEVEL=info
```

### 8.3 安装步骤

```bash
# 1. 安装依赖
npm install

# 2. 构建所有包
npm run build

# 3. 启动开发服务器（同时启动 server 和 app）
npm run dev

# 或单独启动
npm run dev:server  # 仅启动后端
npm run dev:app     # 仅启动前端
```

### 8.4 生产部署

```bash
# 1. 构建生产版本
npm run build

# 2. 启动服务器
npm start
```

### 8.5 Docker 部署

项目包含 `docker-compose.dev.yml`，可使用 Docker Compose 启动：

```bash
docker-compose -f docker-compose.dev.yml up
```

### 8.6 配置文件

| 文件 | 用途 |
|------|------|
| `config/config.v2.json` | Agent 定义、权限、工具配置 |
| `config/local-model.json` | 本地模型配置 |
| `config/example.json` | 配置示例 |

### 8.7 验证运行

启动后访问：
- 健康检查：`http://localhost:3000/health`
- Skills 列表：`http://localhost:3000/api/skills`

---

## 附录：数据库表结构

| 表名 | 用途 |
|------|------|
| `sessions` | 会话信息 |
| `session_tags` | 会话标签 |
| `session_metadata` | 会话元数据 |
| `messages` | 消息记录 |
| `tool_calls` | 工具调用记录 |
| `long_term_memories` | 长期记忆 |

---

*文档生成时间：2026-03-17*
