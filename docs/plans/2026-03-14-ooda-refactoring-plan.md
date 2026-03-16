# OODA 四代理架构重构方案

## 概述

本文档描述将现有 OODA 循环重构为四代理架构的详细方案。基于之前的讨论成果，保持与现有 EventBus/SSE 架构的集成。

## 现有架构分析

### 当前实现
- `OODALoop` 类管理四个阶段：Observe、Orient、Decide、Act
- 只有 Orient 和 Decider 调用 LLM
- Observe 和 Act 是纯规则组件
- 通过 `StreamingOutputManager` 集成 EventBus

### 目标架构
- 四个独立 Agent，每个都有 LLM 调用能力
- 每个 Agent 有独立的配置（工具、权限、Skills、MCP、模型参数）
- 串行协作，通过上下文传递信息
- Act Agent 的 LLM 判断任务是否完成

---

## 架构设计

### 整体流程

```
用户输入 → [Observe Agent] → [Orient Agent] → [Decide Agent] → [Act Agent]
              ↑                                                              ↓
              │                      循环直到完成 ←─────────────────────────────┘
              │
         记录上下文 + 结束标记
```

### 与现有系统集成

```
┌─────────────────────────────────────────────────────────────────┐
│                        OODALoop (重构后)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐ │
│  │ Observe  │───▶│  Orient  │───▶│  Decide  │───▶│   Act    │ │
│  │  Agent   │    │  Agent   │    │  Agent   │    │  Agent   │ │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘ │
│       │                │                │                │        │
│       └────────────────┴────────────────┴────────────────┘        │
│                              │                                     │
│                              ▼                                     │
│                    ┌─────────────────┐                            │
│                    │ StreamingManager│                            │
│                    └────────┬────────┘                            │
│                             │                                      │
│                             ▼                                      │
│                    ┌─────────────────┐                            │
│                    │   EventBus     │                            │
│                    │   (SSE)        │                            │
│                    └─────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 详细实现计划

### Phase 1: 类型定义扩展

**任务**: 扩展 `packages/core/src/ooda/types.ts`

新增类型：
- `AgentModelConfig` - 模型配置（name, temperature, topP, maxTokens）
- `AgentToolConfig` - 工具配置（allowed, denied, groups）
- `AgentSkillConfig` - 技能配置
- `AgentPermissionConfig` - 权限配置
- `AgentMCPConfig` - MCP 配置
- `OODAAgentConfig` - 单个 Agent 完整配置
- `OODAConfig` - 循环配置
- `AgentInput/AgentOutput` - Agent 输入输出类型

### Phase 2: Agent 基类

**任务**: 创建 `packages/core/src/ooda/agent/base.ts`

职责：
- 抽象基类 `BaseOODAAgent`
- LLM 调用封装
- 权限检查
- 工具执行
- 提示词构建

### Phase 3: Observe Agent 改造

**文件**: `packages/core/src/ooda/observe.ts`

改造内容：
1. 添加 LLM 环境分析能力
2. 保留现有异常检测逻辑
3. 保留现有模式识别逻辑
4. 输出观察报告

### Phase 4: Orient Agent 改造

**文件**: `packages/core/src/ooda/orient.ts`

改造内容：
1. 保留现有 LLM 意图分析
2. 添加约束识别规则
3. 保留历史压缩逻辑
4. 输出意图分析

### Phase 5: Decide Agent 改造

**文件**: `packages/core/src/ooda/decide.ts`

改造内容：
1. 保留现有 LLM 方案生成
2. 添加启发式决策规则
3. 保留任务分解逻辑
4. 输出执行计划

### Phase 6: Act Agent 改造

**文件**: `packages/core/src/ooda/act.ts`

改造内容：
1. 保留现有工具执行
2. 添加 LLM 结果评估
3. 添加结束判断（isComplete）
4. 保留启发式反馈
5. 输出执行结果 + isComplete

### Phase 7: Agent 工厂

**文件**: 新建 `packages/core/src/ooda/agent/factory.ts`

职责：
- 创建四个 Agent 实例
- 管理配置
- 依赖注入

### Phase 8: OODALoop 重构

**文件**: `packages/core/src/ooda/loop.ts`

改造内容：
1. 使用工厂创建四个 Agent
2. 实现四阶段串行协作
3. 实现循环控制（基于 isComplete）
4. 集成 StreamingManager
5. 集成 EventBus

### Phase 9: 默认配置

**文件**: 新建 `packages/core/src/ooda/config.ts`

定义四个 Agent 的默认配置：
- Observe: temperature=0.3, 读取工具
- Orient: temperature=0.5, 分析工具
- Decide: temperature=0.4, 规划工具
- Act: temperature=0.6, 执行工具+Skills+MCP

### Phase 10: EventBus/SSE 集成

**现有文件**: `packages/core/src/ooda/streaming.ts`

改造内容：
1. 复用现有 EventBus 集成
2. 添加四个 Agent 的事件
3. 支持流式 LLM 输出

---

## 事件定义

### OODA 事件（复用现有）

```typescript
type OODAEvent = {
  phase: 'observe' | 'orient' | 'decide' | 'act' | 'tool_result' | 'complete' | 'feedback';
  data?: {
    intent?: string;
    reasoning?: string;
    summary?: string;
    isComplete?: boolean;
    // ...
  };
};
```

### EventBus 事件

```typescript
// 新增 OODA 相关命名空间
type EventNamespace = 'ooda' | 'session' | 'message' | 'tool' | 'permission' | 'agent' | 'system';

type OODAAction = 'phase_start' | 'phase_progress' | 'phase_complete' | 'thinking' | 'complete';
```

---

## 配置文件结构

### 默认配置示例

```typescript
const defaultOODAConfig: OODAConfig = {
  observe: {
    role: 'observe',
    displayName: '信息收集与分析专家',
    systemPrompt: '...',
    model: { name: 'qwen2.5:7b', temperature: 0.3, maxTokens: 2000 },
    tools: { allowed: ['read', 'grep', 'glob', 'list'] },
    permissions: { inherit: true, tools: { read: 'allow', write: 'deny' } },
    anomalyDetection: { enabled: true, consecutiveFailureLimit: 3 },
    patternRecognition: { enabled: true, toolSequenceThreshold: 0.7 },
  },
  orient: { ... },
  decide: { ... },
  act: { ... },
  
  maxIterations: 10,
  timeout: 300000,
  contextMode: 'hybrid',
};
```

---

## 实施清单

| 序号 | 任务 | 文件 | 状态 |
|------|------|------|------|
| 1 | 扩展类型定义 | `ooda/types.ts` | ⬜ |
| 2 | 创建 Agent 基类 | `ooda/agent/base.ts` | ⬜ |
| 3 | 改造 Observe Agent | `ooda/observe.ts` | ⬜ |
| 4 | 改造 Orient Agent | `ooda/orient.ts` | ⬜ |
| 5 | 改造 Decide Agent | `ooda/decide.ts` | ⬜ |
| 6 | 改造 Act Agent | `ooda/act.ts` | ⬜ |
| 7 | 创建 Agent 工厂 | `ooda/agent/factory.ts` | ⬜ |
| 8 | 重构 OODALoop | `ooda/loop.ts` | ⬜ |
| 9 | 创建默认配置 | `ooda/config.ts` | ⬜ |
| 10 | 集成 EventBus/SSE | `ooda/streaming.ts` | ⬜ |
| 11 | 单元测试 | `ooda/__tests__/` | ⬜ |
| 12 | 代码审查 | - | ⬜ |

---

## 注意事项

1. **向后兼容**: 保留现有 OODA 实现，通过配置切换
2. **性能**: 4 次 LLM 调用会增加延迟，需要缓存支持
3. **错误处理**: 每个 Agent 独立的错误处理
4. **流式输出**: 复用现有的 SSE 机制
5. **权限**: 复用现有的权限系统
