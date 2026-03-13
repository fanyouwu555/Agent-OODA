# OODA Agent 核心架构

本文档详细描述 OODA 循环的实现架构、各阶段职责和核心机制。

## 概述

OODA (Observe-Orient-Decide-Act) 循环是系统的核心决策引擎，借鉴 John Boyd 的 OODA 环理论并扩展应用于 AI Agent 场景。

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OODA 循环架构                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐         │
│   │ Observe │───▶│ Orient  │───▶│ Decide  │───▶│   Act   │         │
│   │  观察    │    │  定向    │    │  决策    │    │  行动    │         │
│   └─────────┘    └─────────┘    └─────────┘    └─────────┘         │
│        │              │              │              │              │
│        ▼              ▼              ▼              ▼              │
│   信息收集        意图分析        方案生成        执行验证          │
│   异常检测        约束识别        风险评估        权限检查          │
│   模式识别        知识缺口        任务分解        结果反馈          │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐ │
│   │                      循环增强机制                           │ │
│   │  • 智能缓存    • 性能监控    • 自适应策略    • 学习洞察     │ │
│   └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## 核心类图

```
OODALoop (主控制器)
    │
    ├── Observer (观察)
    │   ├── storeToMemory()
    │   ├── extractToolResults()
    │   ├── detectAnomalies()     ← 异常检测
    │   └── recognizePatterns()    ← 模式识别
    │
    ├── Orienter (定向)
    │   ├── performDeepAnalysis() ← LLM分析
    │   ├── identifyConstraints()  ← 约束识别
    │   ├── identifyKnowledgeGaps()← 知识缺口
    │   └── synthesizePatterns()  ← 模式综合
    │
    ├── Decider (决策)
    │   ├── performDecisionAnalysis()
    │   ├── createPlan()           ← 任务分解
    │   ├── selectNextAction()    ← 动作选择
    │   └── buildRiskAssessment() ← 风险评估
    │
    └── Actor (行动)
        ├── executeTool()         ← 工具执行
        ├── executeSkill()        ← 技能执行
        ├── generateResponse()    ← 响应生成
        └── generateFeedback()   ← 反馈生成
```

## 各阶段详细设计

### 1. Observe 阶段 (观察)

**职责**: 收集信息、理解上下文、检测异常、识别模式

```typescript
class Observer {
  // 核心方法
  async observe(state: AgentState): Promise<Observation>
}
```

**功能列表**:

| 功能 | 说明 | 代码位置 |
|------|------|----------|
| 信息收集 | 从 AgentState 提取信息 | `storeToMemory()` |
| 工具结果提取 | 提取历史工具执行结果 | `extractToolResults()` |
| 异常检测 | 检测错误、慢执行、重复操作 | `detectAnomalies()` |
| 模式识别 | 识别工具序列、用户行为 | `recognizePatterns()` |

**异常检测类型**:

| 类型 | 检测条件 | 严重程度 |
|------|----------|----------|
| error | 工具执行错误 | 基于错误率 |
| warning | 执行时间过长 | medium |
| unusual_pattern | 重复操作模式 | low |
| consecutive_failures | 连续失败 >= 3 次 | high |

**模式识别类型**:

| 类型 | 检测内容 | 显著性阈值 |
|------|----------|------------|
| tool_sequence | 常见工具序列 | 0.7 |
| tool_frequency | 频繁使用工具 | 0.6 |
| error_pattern | 高频错误工具 | 0.8 |
| time_variance | 执行时间波动 | 0.5 |
| user_behavior | 用户行为模式 | 0.6 |
| workflow | 工作流模式 | 0.8+ |
| complexity | 任务复杂度 | 0.6+ |
| context_switch | 话题切换 | 0.75 |

---

### 2. Orient 阶段 (定向)

**职责**: 深度分析、意图识别、约束评估

```typescript
class Orienter {
  async orient(observation: Observation): Promise<Orientation>
}
```

**功能列表**:

| 功能 | 说明 | 代码位置 |
|------|------|----------|
| 深度分析 | LLM 驱动的上下文分析 | `performDeepAnalysis()` |
| 意图构建 | 从分析结果构建意图 | `buildIntent()` |
| 约束识别 | 识别资源、权限、逻辑约束 | `identifyConstraints()` |
| 知识缺口 | 检测信息不足 | `identifyKnowledgeGaps()` |
| 模式综合 | 合并观察阶段的模式 | `synthesizePatterns()` |
| 关系映射 | 映射组件关系 | `mapRelationships()` |

**意图类型**:

| 类型 | 说明 | 示例 |
|------|------|------|
| question | 提问 | "什么是 OODA?" |
| file_read | 文件读取 | "读取 config.json" |
| file_write | 文件写入 | "写入 data.txt" |
| execute | 命令执行 | "运行 npm test" |
| search | 搜索 | "搜索 AI 进展" |
| code_analysis | 代码分析 | "分析这个函数" |
| general | 一般请求 | 对话闲聊 |

**约束类型**:

| 类型 | 检测来源 | 严重程度 |
|------|----------|----------|
| resource | 内存/CPU 使用率 | high/medium |
| permission | 写入/执行操作 | medium/high |
| logic | 错误、工作流、复杂度 | medium/high |
| time | 历史长度、任务复杂度 | low/medium |

**历史压缩**:

当消息数量超过 20 条时，自动压缩旧消息为摘要：
- 保留最近 10 条消息
- 旧消息压缩为 300 字以内的摘要
- 保留关键意图和决策

---

### 3. Decide 阶段 (决策)

**职责**: 生成方案、评估风险、分解任务

```typescript
class Decider {
  async decide(orientation: Orientation): Promise<Decision>
}
```

**功能列表**:

| 功能 | 说明 | 代码位置 |
|------|------|----------|
| 方案生成 | LLM 生成 3+ 可选方案 | `performDecisionAnalysis()` |
| 方案评估 | 6 维度评估 | 内部逻辑 |
| 任务分解 | 分解为子任务 | `decomposeTask()` |
| 动作选择 | 选择下一个动作 | `selectNextAction()` |
| 风险评估 | 评估整体风险 | `buildRiskAssessment()` |

**决策评估维度**:

1. 技术正确性和健壮性
2. 可维护性和代码质量
3. 性能影响
4. 安全性考虑
5. 实现复杂度
6. 与现有模式的一致性

**动作类型**:

| 类型 | 触发条件 | 说明 |
|------|----------|------|
| tool_call | 有待执行任务 | 调用工具 |
| skill_call | 需要技能 | 调用技能 |
| response | 无子任务/直接回答 | 生成响应 |
| clarification | 知识缺口/风险约束 | 请求澄清 |

**启发式决策规则**:

| 规则 | 条件 | 动作 |
|------|------|------|
| 知识缺口 | 重要性 > 0.8 | 请求澄清 |
| 权限风险 | 高风险 + 执行操作 | 请求确认 |
| 连续失败 | 失败次数 >= 3 | 简化任务 |
| 上下文切换 | 切换 + 低置信度 | 确认意图 |
| 依赖选择 | 有可执行任务 | 按依赖排序 |
| 低风险优先 | 有低风险选项 | 优先选择 |

---

### 4. Act 阶段 (行动)

**职责**: 执行动作、权限检查、结果验证

```typescript
class Actor {
  async act(decision: Decision): Promise<ActionResult>
}
```

**功能列表**:

| 功能 | 说明 | 代码位置 |
|------|------|----------|
| 工具执行 | 执行注册的工具 | `executeTool()` |
| 技能执行 | 执行注册的技能 | `executeSkill()` |
| 权限检查 | 调用权限管理器 | 集成模块 |
| 响应生成 | 生成文本响应 | `generateResponse()` |
| 澄清请求 | 请求用户补充信息 | `requestClarification()` |
| 反馈生成 | 生成执行反馈 | `generateFeedback()` |

**反馈内容**:

| 字段 | 成功时 | 失败时 |
|------|--------|--------|
| observations | 操作成功信息 | 错误描述 |
| newInformation | 工具结果摘要 | - |
| issues | - | 错误类型 |
| suggestions | 后续建议 | 修复建议 |

**启发式反馈**:

错误类型 → 具体建议：
- 文件不存在 → 检查路径、使用 glob
- 权限不足 → 检查权限设置
- 文件过大 → 分块读取
- 命令不存在 → 检查命令名称
- 命令超时 → 简化命令
- 网络问题 → 检查网络
- 频率限制 → 稍后重试

---

## 循环增强机制

### 迭代控制

```typescript
class OODALoop {
  private maxIterations = 10;    // 最大迭代次数
  private timeout = 300000;       // 5分钟超时
  private maxHistorySize = 100;   // 历史上限
}
```

### 智能缓存

三级缓存机制：
- **Observation 缓存**: 基于输入+历史 key
- **Orientation 缓存**: 基于观察结果 key
- **Decision 缓存**: 基于意图+约束 key

```typescript
private cacheTTL = 60000;      // 缓存有效期
private enableCache = false;    // 默认关闭
```

### 性能监控

每个循环记录性能指标：

```typescript
interface PerformanceMetrics {
  observeTime: number;   // 观察阶段耗时
  orientTime: number;    // 定向阶段耗时
  decideTime: number;    // 决策阶段耗时
  actTime: number;       // 行动阶段耗时
  totalTime: number;     // 总耗时
}
```

### 自适应策略

失败率 >= 50% 或检测到重复错误时触发：

```typescript
private shouldAdapt(state: AgentState): boolean {
  const recentResults = this.loopContext.previousResults.slice(-3);
  const failureRate = recentResults.filter(r => !r.success).length / recentResults.length;
  return failureRate >= 0.5 || this.findRepeatedErrors(recentResults).length > 0;
}
```

### 学习洞察

从执行结果中提取学习内容：

```typescript
private extractLearningInsights(actionResult, decision): void {
  // 失败时记录失败原因
  // 成功时记录新信息
  // 保留最近 20 条洞察
}
```

---

## 事件系统

OODA 循环通过事件与外部系统通信：

```typescript
type OODAEvent = {
  phase: 'observe' | 'orient' | 'decide' | 'act' | 'tool_result' | 'complete' | 'feedback' | 'adaptation';
  data?: {
    intent?: string;
    reasoning?: string;
    options?: string[];
    selectedOption?: string;
    toolCall?: { id, name, args, result };
    feedback?: { observations, issues, suggestions };
    adaptation?: { reason, action };
  };
};
```

**流式输出**:

集成 `StreamingOutputManager` 实现实时输出：
- 阶段开始/完成事件
- 思考过程
- 工具调用
- 结果反馈
- 进度百分比

---

## 配置选项

```typescript
interface OODAConfig {
  maxIterations?: number;      // 最大迭代次数 (默认 10)
  timeout?: number;            // 超时时间 (默认 5 分钟)
  maxHistorySize?: number;     // 历史大小 (默认 100)
  cacheTTL?: number;           // 缓存有效期 (默认 60 秒)
  enableCache?: boolean;       // 启用缓存 (默认 false)
  maxCacheSize?: number;      // 缓存大小 (默认 100)
}
```

---

## 使用示例

### 基本使用

```typescript
import { OODALoop } from '@ooda-agent/core';

const loop = new OODALoop('session-1');
const result = await loop.run('分析项目结构');
console.log(result.output);
```

### 启用流式输出

```typescript
import { OODALoop, createConsoleStreamingHandler } from '@ooda-agent/core';

const handler = createConsoleStreamingHandler();
const loop = new OODALoop('session-1', handler, {
  enabled: true,
  showThinking: true,
  showProgress: true,
});

await loop.run('读取 config.json');
```

### 自定义回调

```typescript
const callback = async (event) => {
  console.log(`[${event.phase}]`, event.data);
};

const result = await loop.runWithCallback('搜索 AI 新闻', callback);
```

---

## 与传统 OODA 的对比

| 方面 | 传统 OODA | 本项目实现 |
|------|-----------|------------|
| 循环次数 | 单次 | 多次迭代 |
| 信息处理 | 人工 | LLM 驱动 |
| 决策依据 | 经验 | 启发式 + LLM |
| 反馈机制 | 有限 | 完整的反馈生成 |
| 学习能力 | 无 | 洞察提取与适应 |
| 工具集成 | 无 | 完整工具生态 |

---

## 扩展点

1. **自定义观察器**: 扩展 `Observer` 添加新模式
2. **自定义分析器**: 扩展 `Orienter` 添加新约束
3. **自定义决策器**: 扩展 `Decider` 添加新策略
4. **自定义执行器**: 扩展 `Actor` 添加新动作
5. **缓存策略**: 实现自定义缓存逻辑
6. **监控集成**: 扩展事件系统添加监控
