# OODA Agent 系统介绍

> 本文档详细介绍基于 OODA（Observe-Orient-Decide-Act）循环策略的智能代理系统

---

## 一、OODA 循环概述

### 1.1 什么是 OODA 循环

**OODA 循环**是由美国军事战略家 John Boyd 提出的决策框架，全称为 **Observe-Orient-Decide-Act**（观察-定向-决策-执行）。这一框架最初用于军事对抗中的快速决策，如今已被广泛应用于商业、技术和人工智能领域。

**核心思想**：通过快速、迭代的 OODA 循环，智能体能够：
- 持续观察环境和状态变化
- 基于上下文理解当前情况
- 做出明智的决策
- 执行行动并评估结果
- 从反馈中学习和适应

### 1.2 本项目中的 OODA 实现

本项目将 OODA 循环作为智能代理的核心决策引擎，实现了以下能力：

```
┌─────────────────────────────────────────────────────────────────┐
│                         OODA Loop                                │
│                                                                  │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐   │
│   │ Observe  │───▶│  Orient  │───▶│  Decide  │───▶│  Act   │   │
│   │   观察    │    │   定向    │    │   决策    │    │   执行  │   │
│   └──────────┘    └──────────┘    └──────────┘    └────────┘   │
│         ▲                                                │       │
│         └────────────────────────────────────────────────┘       │
│                          Feedback Loop                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、系统架构

### 2.1 核心组件

| 组件 | 文件位置 | 职责说明 |
|------|----------|----------|
| **OODALoop** | `packages/core/src/ooda/loop.ts` | 主循环协调器，管理整个 OODA 流程的执行 |
| **Observer** | `packages/core/src/ooda/observe.ts` | 观察阶段，处理输入和环境信息采集 |
| **Orienter** | `packages/core/src/ooda/orient.ts` | 定向阶段，上下文分析和意图识别 |
| **Decider** | `packages/core/src/ooda/decide.ts` | 决策阶段，生成和选择执行方案 |
| **Actor** | `packages/core/src/ooda/act.ts` | 执行阶段，调用工具执行决策 |
| **AdaptationEngine** | `packages/core/src/ooda/adaptation/engine.ts` | 自适应引擎，根据反馈调整策略 |

### 2.2 整体数据流

```
用户输入
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                     OODA 循环主体                            │
│                                                              │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐     │
│  │ Observe │──▶│ Orient  │──▶│ Decide  │──▶│   Act   │     │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘     │
│      │                                            │         │
│      │           反馈循环 ◀────────────────────────         │
│      │              │                                    │
│      ▼              ▼                                    │
│  ┌─────────────────────────┐                            │
│  │     Memory System       │                            │
│  │  (短期/长期/分层记忆)     │                            │
│  └─────────────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
输出结果
```

---

## 三、OODA 四阶段详解

### 3.1 Observe（观察）阶段

**职责**：感知和理解当前环境状态

**核心功能**：

1. **输入处理**
   - 接收用户原始输入
   - 加载对话历史记录
   - 提取工具执行结果

2. **环境状态采集**
   - 获取系统资源使用情况（内存、CPU）
   - 获取可用工具列表
   - 获取当前时间戳

3. **异常检测**
   - 检测工具执行错误
   - 检测执行时间异常
   - 检测重复操作模式
   - 检测连续失败情况

4. **模式识别**
   - 工具使用频率分析
   - 工具调用序列分析
   - 工作流模式检测（读→写、搜索→分析等）
   - 复杂度评估
   - 上下文切换检测

5. **主动探索**（可选）
   - 项目结构探索
   - 依赖信息收集
   - Git 状态检查

**关键类型定义**：
```typescript
interface Observation {
  userInput: string;           // 用户原始输入
  toolResults: ToolResult[];   // 工具执行结果
  context: Context;            // 上下文信息
  environment: EnvironmentState;  // 环境状态
  history: Message[];          // 对话历史
  anomalies?: Anomaly[];       // 检测到的异常
  patterns?: Pattern[];        // 识别到的模式
}
```

**输出示例**：
```json
{
  "userInput": "帮我读取 config.json 文件",
  "toolResults": [],
  "anomalies": [],
  "patterns": [
    {
      "type": "workflow",
      "description": "检测到文件编辑工作流 (读取-修改-写入)",
      "significance": 0.85
    }
  ]
}
```

### 3.2 Orient（定向）阶段

**职责**：深度理解上下文，识别用户真实意图

**核心功能**：

1. **意图识别**
   - 分析用户输入的真实意图
   - 识别意图类型（question、file_read、file_write、execute、search、code_analysis、general）
   - 评估意图置信度

2. **约束识别**
   - 资源约束（内存、CPU）
   - 权限约束
   - 逻辑约束
   - 时间约束

3. **知识缺口检测**
   - 自动检测当前信息是否满足需求
   - 推荐需要调用的工具
   - 支持新闻摘要、实时信息等特殊场景

4. **上下文总结**
   - 历史对话压缩
   - 关键信息提取
   - 相关事实关联

5. **模式与关系分析**
   - 识别数据中的模式
   - 建立实体间关系图

**关键类型定义**：
```typescript
interface Orientation {
  primaryIntent: Intent;           // 主要意图
  relevantContext: Context;        // 上下文信息
  constraints: Constraint[];       // 约束条件
  knowledgeGaps: KnowledgeGap[];   // 知识缺口
  patterns: Pattern[];             // 模式
  relationships: Relationship[];    // 关系
  assumptions: string[];           // 假设
  risks: string[];                 // 风险
}
```

**意图类型**：

| 意图类型 | 说明 | 示例 |
|----------|------|------|
| `question` | 用户提问 | "什么是 OODA 循环？" |
| `file_read` | 读取文件 | "帮我看看 config.json" |
| `file_write` | 写入文件 | "创建 README.md" |
| `execute` | 执行命令 | "运行 npm test" |
| `search` | 搜索信息 | "搜索 AI Agent 最新进展" |
| `code_analysis` | 代码分析 | "分析这个函数的逻辑" |
| `general` | 一般对话 | "今天天气怎么样" |

### 3.3 Decide（决策）阶段

**职责**：制定执行计划，选择最佳行动方案

**核心功能**：

1. **方案生成**
   - 基于意图生成多个可选方案
   - 评估每个方案的优缺点
   - 计算方案得分

2. **方案选择**
   - 根据评分选择最优方案
   - 考虑约束条件和风险
   - 生成推理过程（ReAct 风格）

3. **任务分解**
   - 将复杂任务分解为子任务
   - 建立任务依赖关系图
   - 支持并行任务识别

4. **自我反思机制**
   - 生成备用策略
   - 预判可能的失败情况
   - 准备降级方案

5. **决策输出**
   - 清晰的下一步行动
   - 完整的推理链
   - 风险评估

**关键类型定义**：
```typescript
interface Decision {
  problemStatement: string;      // 问题陈述
  options: Option[];             // 可选方案
  selectedOption: Option;        // 选中方案
  plan: ActionPlan;              // 执行计划
  nextAction: Action;            // 下一步行动
  reasoning: string;             // 推理过程
  reasoningChain: ReasoningStep[];  // 推理链
  riskAssessment: RiskAssessment;    // 风险评估
}
```

**行动类型**：
```typescript
type Action = 
  | { type: 'tool_call'; toolName: string; args: Record<string, unknown> }
  | { type: 'skill_call'; toolName: string; args: Record<string, unknown> }
  | { type: 'response'; content: string }
  | { type: 'clarification'; clarificationQuestion: string };
```

### 3.4 Act（执行）阶段

**职责**：执行决策并处理结果

**核心功能**：

1. **工具执行**
   - 权限检查
   - 工具调用
   - 错误处理
   - 重试机制

2. **智能重试**
   - 错误分类
   - 可重试性判断
   - 动态工具路由
   - 退避策略

3. **断路器保护**
   - 防止雪崩效应
   - 自动熔断
   - 恢复机制

4. **结果反馈生成**
   - 成功/失败反馈
   - 观察总结
   - 新信息提取
   - 问题诊断
   - 改进建议

5. **副作用追踪**
   - 文件修改记录
   - 命令执行记录
   - 状态变更记录

**关键类型定义**：
```typescript
interface ActionResult {
  success: boolean;              // 是否成功
  result: unknown;               // 执行结果
  sideEffects: string[];         // 副作用
  feedback: ActionFeedback;       // 反馈信息
}

interface ActionFeedback {
  observations: string[];       // 观察结果
  newInformation: string[];       // 新信息
  issues: string[];              // 发现的问题
  suggestions: string[];          // 改进建议
}
```

---

## 四、高级特性

### 4.1 自适应策略（Adaptation）

系统具备自我学习和适应能力：

```typescript
interface AdaptationStrategy {
  type: 'cache' | 'retry' | 'tool_selection' | 'model';
  trigger: 'threshold' | 'pattern' | 'manual';
  enabled: boolean;
}
```

**触发条件**：
- **阈值触发**：错误率超过阈值、延迟超过阈值
- **模式触发**：检测到连续失败模式、性能下降模式
- **冷却机制**：避免过度调整

### 4.2 结果验证（Validation）

在 Act 阶段执行完成后，验证结果是否符合用户需求：

```typescript
interface ValidationResult {
  isValid: boolean;
  score: number;           // 0-1
  issues: string[];
  suggestions: string[];
  improvedContent?: string;  // 改进后的内容
}
```

### 4.3 知识缺口检测（Knowledge Gap）

自动检测当前信息是否满足用户需求：

| 缺口类型 | 说明 | 建议工具 |
|----------|------|----------|
| `news_summary` | 需要新闻摘要 | web_search_and_fetch |
| `realtime_info` | 需要实时信息 | web_search |
| `web_search` | 需要网络搜索 | web_search |

### 4.4 分层记忆系统

系统采用三层记忆架构：

1. **短期记忆（Short-term Memory）**
   - 存储最近的对话消息
   - 快速访问
   - 容量限制

2. **长期记忆（Long-term Memory）**
   - 持久化存储重要信息
   - 向量语义搜索
   - 自动过期

3. **分层记忆（Hierarchical Memory）**
   - 工作记忆：当前任务上下文
   - 情景记忆：历史交互
   - 语义记忆：通用知识

---

## 五、循环流程详解

### 5.1 完整循环执行流程

```typescript
async function runWithCallback(input: string, callback: OODACallback): Promise<AgentResult> {
  // 1. 初始化
  const initialState: AgentState = {
    originalInput: input,
    history: [],
    currentStep: 0,
    isComplete: false,
  };

  // 2. 迭代执行 OODA 循环
  while (!state.isComplete && currentIteration < maxIterations) {
    // 2.1 Observe - 观察环境
    const observation = await observer.observe(state);

    // 2.2 Orient - 分析意图
    const orientation = await orienter.orient(observation);

    // 2.3 Decide - 制定决策
    const decision = await decider.decide(orientation);

    // 2.4 Act - 执行行动
    const actionResult = await actor.act(decision);

    // 2.5 验证结果
    const validatedResult = await validateActionResult(actionResult);

    // 2.6 学习与适应
    await learningModule.learnFromResult(actionResult);
    await adaptationEngine.analyzeAndAdapt(metrics);

    // 2.7 更新状态
    state = {
      ...state,
      isComplete: evaluateCompletion(validatedResult),
      validationFeedback: validatedResult.feedback,
    };
  }

  return state.result;
}
```

### 5.2 完成判断逻辑

```typescript
function evaluateCompletion(intentType: string, actionSuccess: boolean): boolean {
  // 执行失败，绝对不完成
  if (!actionSuccess) return false;

  // 根据意图类型判断
  switch (intentType) {
    case 'question':
    case 'general':
      return actionSuccess;  // 回复即完成

    case 'file_read':
    case 'file_write':
    case 'execute':
    case 'search':
      // 需要检查是否有实际产出
      return hasNewInfo || noIssues;

    case 'clarification':
      return false;  // 需要用户响应

    default:
      return actionSuccess;
  }
}
```

### 5.3 流式输出支持

系统支持实时流式输出，用户可以看到完整的推理过程：

```typescript
interface OODAEvent {
  phase: 'observe' | 'orient' | 'decide' | 'act' | 'complete' | 'feedback';
  data?: {
    intent?: string;
    reasoning?: string;
    options?: string[];
    selectedOption?: string;
    chunk?: string;           // 流式输出块
    toolCall?: ToolCallInfo;
    feedback?: ActionFeedback;
  };
}
```

---

## 六、工具生态

### 6.1 内置工具

| 工具类型 | 工具名称 | 说明 |
|----------|----------|------|
| **文件操作** | `read_file` | 读取文件内容 |
| | `write_file` | 写入文件 |
| | `edit_file` | 编辑文件 |
| | `glob` | 文件模式匹配 |
| **命令执行** | `run_bash` | 执行 Bash 命令 |
| | `run_python` | 执行 Python 代码 |
| **网络工具** | `web_search` | 网络搜索 |
| | `web_fetch` | 获取网页内容 |
| **代码工具** | `grep` | 文本搜索 |
| | `git_tools` | Git 操作 |

### 6.2 工具注册与路由

```typescript
// 动态工具路由
class DynamicToolRouter {
  generateAlternativeTool(
    failedTool: string,
    error: Error,
    context: RetryContext,
    attemptNumber: number
  ): AlternativeTool | null;
}
```

### 6.3 错误分类与策略映射

```typescript
class ErrorClassifier {
  classify(error: Error): ClassifiedError {
    // 分类结果
    category: 'network' | 'timeout' | 'permission' | 'resource' | 'unknown';
    retryRecommended: boolean;
    severity: 'low' | 'medium' | 'high';
  }
}
```

---

## 七、性能优化

### 7.1 LRU 缓存

```typescript
class LRUCache<T> {
  constructor(options: { maxSize: number; ttl?: number });
  get(key: string): T | undefined;
  set(key: string, value: T, ttl?: number): void;
  cleanup(): void;  // 清理过期条目
}
```

### 7.2 多级缓存

- **L1 缓存**：内存缓存，低延迟
- **L2 缓存**：本地文件缓存，持久化
- **自适应调整**：根据性能指标动态调整缓存策略

### 7.3 连接池

```typescript
class LLMConnectionPool {
  acquire(options: { type: ProviderType; model: string }): Promise<LLMService>;
  release(service: LLMService): void;
}
```

---

## 八、配置说明

### 8.1 OODA 配置结构

```typescript
interface OODAConfig {
  observe: OODAAgentConfig;    // Observe 阶段配置
  orient: OODAAgentConfig;     // Orient 阶段配置
  decide: OODAAgentConfig;    // Decide 阶段配置
  act: OODAAgentConfig;        // Act 阶段配置
  cache?: OODACacheConfig;    // 缓存配置
  adaptation?: OODAAdaptationConfig;  // 适应配置
  maxIterations?: number;      // 最大迭代次数
  timeout?: number;            // 超时时间
}
```

### 8.2 阶段模型配置

支持每个阶段使用不同的 LLM 模型：

```typescript
interface OODAPhaseModelConfig {
  observe?: { provider: string; model: string; temperature?: number };
  orient?: { provider: string; model: string; temperature?: number };
  decide?: { provider: string; model: string; temperature?: number };
  act?: { provider: string; model: string; temperature?: number };
}
```

---

## 九、使用示例

### 9.1 基本使用

```typescript
import { OODALoop, createConsoleStreamingHandler } from '@ooda-agent/core';

// 创建循环实例
const loop = new OODALoop('session-123');

// 启用流式输出
const handler = createConsoleStreamingHandler();
loop.enableStreaming(handler, {
  enabled: true,
  showThinking: true,
  showProgress: true,
});

// 运行
const result = await loop.run('帮我读取 package.json 文件');
console.log(result.output);
```

### 9.2 自定义回调

```typescript
await loop.runWithCallback('搜索 AI Agent 最新进展', async (event) => {
  switch (event.phase) {
    case 'observe':
      console.log('📊 观察中...');
      break;
    case 'orient':
      console.log('💭 理解意图:', event.data?.intent);
      break;
    case 'decide':
      console.log('🎯 决策:', event.data?.selectedOption);
      break;
    case 'act':
      if (event.data?.toolCall) {
        console.log('🔧 执行:', event.data.toolCall.name);
      }
      break;
    case 'complete':
      console.log('✅ 完成');
      break;
  }
});
```

---

## 十、总结

OODA Agent 系统通过将复杂的智能决策过程分解为**观察-定向-决策-执行**四个清晰阶段，实现了：

1. **可解释性**：每个阶段的输入输出明确可见
2. **可扩展性**：易于添加新的工具、策略和适应机制
3. **自适应性**：能够从反馈中学习和调整策略
4. **容错性**：完善的错误处理和重试机制
5. **性能优化**：多级缓存和连接池

这一架构使得系统能够高效、智能地处理各种用户请求，同时保持良好的可维护性和可观测性。

---

*文档版本：1.0.0*
*最后更新：2026-03-20*
