# OODA Agent

基于 OODA 循环和 ReAct 框架的 AI Agent 系统，借鉴 Manus 的 PEV 架构设计。

## 功能特性

### 核心引擎

- **OODA 循环**: 完整的观察(Observe)→定向(Orient)→决策(Decide)→行动(Act)循环
  - 智能缓存机制
  - 性能指标追踪
  - 自适应策略调整
  - 学习洞察提取

- **多 Agent 协作**: 支持 5 种协作策略
  - `parallel`: 并行执行
  - `sequential`: 顺序执行
  - `hierarchical`: 层级协作
  - `consensus`: 共识决策
  - `competitive`: 竞争模式

### 工具与技能

- **统一工具注册表**: 集成工具、技能、MCP 工具
- **权限管理系统**: 三级权限模式（allow/ask/deny）
- **增强权限控制**: 基于条件的权限规则

### 记忆系统

- **短期记忆**: 会话上下文管理
- **长期记忆**: 持久化存储
- **向量检索**: 语义搜索支持
- **角色管理**: Persona 系统

### 工作流

- **PocketFlow**: 可配置的工作流引擎
- **FlowSelector**: 智能流程选择

### 输出与监控

- **流式输出**: 实时显示处理进度
- **响应聚合**: 多源响应整合
- **性能监控**: 详细的性能指标
- **日志系统**: 可配置的日志记录

## 技术栈

- **语言**: TypeScript
- **运行时**: Node.js 18+
- **后端**: Hono API 框架
- **前端**: SolidJS + Vite
- **数据库**: SQLite
- **验证**: Zod

## 快速开始

### 安装

```bash
# 克隆项目
git clone https://github.com/your-repo/ooda-agent.git
cd ooda-agent

# 安装依赖
npm install

# 构建项目
npm run build
```

### 配置

```bash
# 复制环境变量模板
cp .env.example .env
# 编辑 .env 文件
```

### 启动

```bash
# 同时启动前后端
npm run dev

# 分别启动
npm run dev:server  # 后端 http://localhost:3000
npm run dev:app     # 前端 http://localhost:5173
```

## 项目结构

```
AgentProject/
├── config/                 # 配置文件
├── docs/                   # 文档
│   ├── guides/            # 使用指南
│   └── api/               # API 文档
├── packages/               # 核心包
│   ├── core/              # 核心逻辑
│   │   ├── ooda/          # OODA 循环实现
│   │   ├── memory/        # 记忆系统
│   │   ├── llm/           # LLM 集成
│   │   ├── tool/          # 工具系统
│   │   ├── skill/         # 技能系统
│   │   ├── permission/   # 权限系统
│   │   ├── workflow/      # 工作流引擎
│   │   ├── collaboration/# 多 Agent 协作
│   │   ├── multimodal/    # 多模态支持
│   │   └── monitoring/   # 监控
│   ├── server/            # 后端服务
│   ├── app/               # 前端应用
│   ├── tools/             # 工具实现
│   └── storage/           # 数据存储
├── scripts/               # 脚本工具
└── tests/                 # 测试
```

## 文档

- [快速开始](./docs/guides/quickstart.md)
- [用户指南](./docs/guides/user-guide.md)
- [API 文档](./docs/api/README.md)
- [OODA 架构详解](./docs/architecture/ooda.md)
- [技能扩展示例](./docs/guides/skill-extension.md)
- [MCP 扩展示例](./docs/guides/mcp-extension.md)
- [记忆系统](./docs/guides/memory-system.md)
- [流式输出](./docs/guides/streaming.md)
- [Ollama 部署](./docs/guides/ollama-setup.md)

## 核心概念

### OODA 循环

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Observe │───▶│ Orient  │───▶│ Decide  │───▶│   Act   │
│  观察    │    │  定向    │    │  决策    │    │  行动    │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
```

**各阶段职责：**

| 阶段 | 职责 | 主要任务 |
|------|------|---------|
| Observe | 收集信息 | 输入解析、历史同步、模式检测、异常检测 |
| Orient | 分析理解 | 意图识别、上下文分析、约束识别、知识缺口 |
| Decide | 制定方案 | 选项生成、风险评估、任务分解、方案选择 |
| Act | 执行验证 | 工具调用、权限检查、结果验证、反馈处理 |

**增强特性：**

| 特性 | 说明 |
|------|------|
| 启发式规则 | 工作流模式、复杂度评估、上下文切换检测 |
| 智能缓存 | 三级缓存优化性能 |
| 自适应策略 | 失败率 >50% 时自动调整 |
| 学习洞察 | 从执行结果提取经验 |
| 性能监控 | 各阶段耗时追踪 |

### 多 Agent 协作

支持 5 种协作策略：

```typescript
// 并行执行
const orchestrator = new CollaborationOrchestrator({
  strategy: 'parallel',
  maxAgents: 5,
  maxConcurrentTasks: 3,
});

// 共识决策
const result = await orchestrator.executeSession(sessionId, {
  strategy: 'consensus',
  consensusThreshold: 0.7,
});
```

### 工具系统

| 类型 | 说明 | 示例 |
|------|------|------|
| tool | 基础工具 | 文件读写、命令执行 |
| skill | 技能 | Web搜索、代码执行 |
| mcp-tool | MCP工具 | 外部服务集成 |

### 权限模式

| 模式 | 说明 | 使用场景 |
|------|------|---------|
| `allow` | 自动允许 | 低风险操作 |
| `ask` | 需要确认 | 写入、执行类操作 |
| `deny` | 自动拒绝 | 敏感操作 |

**增强权限控制：**

```typescript
const config = {
  agents: {
    'my-agent': {
      patterns: [
        {
          pattern: 'file:*',
          mode: 'ask',
          conditions: [
            { type: 'path', operator: 'startsWith', value: '/home/user' }
          ]
        }
      ]
    }
  }
};
```

### 记忆类型

| 类型 | 说明 | 用途 |
|------|------|------|
| `fact` | 事实信息 | 用户偏好、项目信息 |
| `experience` | 经验记录 | 操作结果、错误处理 |
| `skill` | 技能知识 | 编程规范、最佳实践 |
| `preference` | 偏好设置 | 语言、风格偏好 |

## 开发命令

```bash
# 运行测试
npm test

# 代码检查
npm run lint

# 类型检查
npm run typecheck

# 构建所有包
npm run build
```

## 配置本地模型

### Ollama

```bash
# 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 拉取模型
ollama pull qwen3:8b
```

### 配置项目

编辑 `config/local-model.json`：

```json
{
  "providers": [
    {
      "id": "local-ollama",
      "type": "ollama",
      "baseUrl": "http://localhost:11434",
      "models": [{ "id": "qwen3:8b", "name": "Qwen3 8B" }]
    }
  ]
}
```

## 贡献

欢迎提交 Issue 和 Pull Request。

## 许可证

MIT License
