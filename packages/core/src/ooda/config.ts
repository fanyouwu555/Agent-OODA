// packages/core/src/ooda/config.ts
// OODA 四代理默认配置

import { OODAConfig } from './types';
import { PermissionMode } from '../permission';

export const defaultOODAConfig: OODAConfig = {
  observe: {
    role: 'observe',
    displayName: '信息收集与分析专家',
    description: '负责收集信息、理解上下文、检测异常、识别模式',
    systemPrompt: `你是一个专业的智能助手，负责收集和分析环境信息。

你的职责：
1. 从当前环境和历史信息中提取关键内容
2. 理解任务背景和上下文关系
3. 检测异常情况（如错误、过慢操作、重复行为）
4. 识别有意义的模式（如工具使用模式、任务类型）

输出要求：
- 用清晰简洁的语言描述当前环境状态
- 突出与任务相关的关键信息
- 标记需要关注的异常和模式
- 以 JSON 格式输出分析结果`,

    model: { name: 'qwen2.5:7b', temperature: 0.3, topP: 0.8, maxTokens: 2000 },
    tools: { allowed: ['read', 'grep', 'glob', 'list', 'web_fetch', 'search'], denied: ['write', 'execute', 'delete'] },
    permissions: { inherit: true, tools: { read: PermissionMode.ALLOW, grep: PermissionMode.ALLOW, glob: PermissionMode.ALLOW, write: PermissionMode.DENY, execute: PermissionMode.DENY } },
    anomalyDetection: { enabled: true, errorThreshold: 0.3, warningThreshold: 10000, consecutiveFailureLimit: 3 },
    patternRecognition: { enabled: true, toolSequenceThreshold: 0.7, toolFrequencyThreshold: 0.6, userBehaviorThreshold: 0.6 },
    enabled: true,
  },

  orient: {
    role: 'orient',
    displayName: '意图分析与规划专家',
    description: '负责深度分析、意图识别、约束评估',
    systemPrompt: `你是一个专业的智能助手，擅长理解和分析用户意图。

你的职责：
1. 深入理解用户的真实需求和目标
2. 识别任务相关的约束条件（资源、权限、时间等）
3. 发现知识缺口，评估是否需要补充信息
4. 将模糊的描述转化为明确的行动目标

分析维度：
- 用户的直接意图与潜在意图
- 显式约束与隐式约束
- 已掌握的信息与需要补充的信息`,

    model: { name: 'qwen2.5:7b', temperature: 0.5, topP: 0.85, maxTokens: 3000 },
    tools: { allowed: ['read', 'grep', 'glob', 'list', 'analyze', 'search'], denied: ['write', 'execute', 'delete'] },
    permissions: { inherit: true, tools: { read: PermissionMode.ALLOW, write: PermissionMode.ASK, execute: PermissionMode.DENY } },
    compression: { enabled: true, threshold: 20, keepRecent: 10, maxSummaryLength: 300 },
    enabled: true,
  },

  decide: {
    role: 'decide',
    displayName: '方案规划与风险评估专家',
    description: '负责生成方案、评估风险、分解任务',
    systemPrompt: `你是一个专业的智能助手，擅长制定执行方案。

你的职责：
1. 基于当前信息生成多个可行的执行方案
2. 从多个维度评估每个方案
3. 选取最优方案并分解为具体执行步骤
4. 识别潜在风险并准备应对策略

方案评估维度：
1. 技术正确性和可行性
2. 实现复杂度和维护成本
3. 性能影响
4. 安全性
5. 与现有模式的兼容性`,

    model: { name: 'qwen2.5:7b', temperature: 0.4, topP: 0.8, maxTokens: 2500 },
    tools: { allowed: ['read', 'grep', 'glob', 'list', 'plan', 'evaluate'], denied: [] },
    permissions: { inherit: true, tools: { read: PermissionMode.ALLOW, write: PermissionMode.ASK, execute: PermissionMode.DENY } },
    heuristicRules: { enabled: true, rules: { knowledgeGapAction: 'clarify', consecutiveFailureThreshold: 3, contextSwitchThreshold: 0.75 } },
    enabled: true,
  },

  act: {
    role: 'act',
    displayName: '执行与结果评估专家',
    description: '负责执行动作、权限检查、结果验证',
    systemPrompt: `你是一个专业的执行专家，擅长将方案转化为具体行动。

你的职责：
1. 执行具体的工具调用或技能操作
2. 验证执行结果是否符合预期目标
3. 判断任务是否完成或需要继续
4. 生成清晰的任务报告和反馈

判断标准：
- 执行结果是否满足预期目标
- 是否遇到错误或需要重试
- 任务完成的标志是什么
- 需要生成怎样的反馈`,

    model: { name: 'qwen2.5:7b', temperature: 0.6, topP: 0.9, maxTokens: 2000 },
    tools: { allowed: ['read', 'write', 'execute', 'grep', 'glob', 'list'], denied: [] },
    skills: { allowed: ['pdf', 'skill-creator', 'create-readme', 'web-design-guidelines'], autoInitialize: true },
    permissions: { inherit: false, tools: { read: PermissionMode.ALLOW, write: PermissionMode.ALLOW, execute: PermissionMode.ALLOW, delete: PermissionMode.ASK }, skills: { pdf: PermissionMode.ALLOW, 'skill-creator': PermissionMode.ASK } },
    mcp: { servers: ['filesystem', 'github'] },
    completion: { enabled: true, confidenceThreshold: 0.8 },
    heuristicFeedback: { enabled: true },
    enabled: true,
  },

  cache: { enabled: false, ttl: 60000, maxSize: 100 },
  performance: { enabled: true },
  adaptation: { enabled: true, failureThreshold: 0.5 },
  maxIterations: 10,
  timeout: 300000,
  contextMode: 'hybrid',
};

export function getAgentConfig(config: OODAConfig, role: 'observe' | 'orient' | 'decide' | 'act') {
  return config[role];
}
