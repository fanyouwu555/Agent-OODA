// packages/core/src/ooda/types.ts
// OODA 四代理架构类型定义

import { Message, Observation, Orientation, Decision, ActionResult } from '../types';
import { PermissionMode } from '../permission';

// OODA 事件类型 - 从 loop.ts 复制以避免循环依赖
export interface OODAEvent {
  phase: 'observe' | 'orient' | 'decide' | 'act' | 'tool_result' | 'complete' | 'feedback' | 'adaptation' | 'streaming_content';
  data?: {
    intent?: string;
    reasoning?: string;
    options?: string[];
    selectedOption?: string;
    chunk?: string;
    output?: string;
    toolCall?: {
      id: string;
      name: string;
      args: Record<string, unknown>;
      result?: unknown;
    };
    feedback?: {
      observations: string[];
      issues: string[];
      suggestions: string[];
    };
    adaptation?: {
      reason: string;
      action: string;
    };
  };
}

export type OODACallback = (event: OODAEvent) => Promise<void> | void;

export interface AgentModelConfig {
  name: string;
  provider?: string;
  temperature: number;
  topP?: number;
  maxTokens?: number;
}

export interface AgentToolConfig {
  allowed: string[];
  denied?: string[];
  groups?: string[];
}

export interface AgentSkillConfig {
  allowed: string[];
  denied?: string[];
  autoInitialize?: string[] | boolean;
}

export interface PermissionCondition {
  type: 'path' | 'command' | 'resource';
  operator: 'equals' | 'contains' | 'matches' | 'startsWith';
  value: string;
}

export interface PermissionPatternConfig {
  pattern: string;
  mode: PermissionMode;
  conditions?: PermissionCondition[];
}

export interface AgentPermissionConfig {
  inherit?: boolean;
  tools?: Record<string, PermissionMode>;
  skills?: Record<string, PermissionMode>;
  patterns?: PermissionPatternConfig[];
}

export interface AgentMCPConfig {
  servers: string[];
}

export interface AgentRuntimeConfig {
  maxSteps?: number;
  timeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoff: 'fixed' | 'exponential';
  };
}

export interface AnomalyDetectionConfig {
  enabled: boolean;
  errorThreshold?: number;
  warningThreshold?: number;
  consecutiveFailureLimit?: number;
}

export interface PatternRecognitionConfig {
  enabled: boolean;
  toolSequenceThreshold?: number;
  toolFrequencyThreshold?: number;
  userBehaviorThreshold?: number;
}

export interface CompressionConfig {
  enabled: boolean;
  threshold?: number;
  keepRecent?: number;
  maxSummaryLength?: number;
}

export interface HeuristicRulesConfig {
  enabled: boolean;
  rules: {
    knowledgeGapAction?: 'clarify' | 'proceed';
    consecutiveFailureThreshold?: number;
    contextSwitchThreshold?: number;
  };
}

export interface CompletionConfig {
  enabled: boolean;
  confidenceThreshold?: number;
}

export interface HeuristicFeedbackConfig {
  enabled: boolean;
}

export interface OODAAgentConfig {
  role: string;
  displayName?: string;
  description?: string;
  systemPrompt: string;
  model: AgentModelConfig;
  tools: AgentToolConfig;
  skills?: AgentSkillConfig;
  permissions?: AgentPermissionConfig;
  mcp?: AgentMCPConfig;
  runtime?: AgentRuntimeConfig;
  anomalyDetection?: AnomalyDetectionConfig;
  patternRecognition?: PatternRecognitionConfig;
  compression?: CompressionConfig;
  heuristicRules?: HeuristicRulesConfig;
  completion?: CompletionConfig;
  heuristicFeedback?: HeuristicFeedbackConfig;
  enabled?: boolean;
}

export interface OODACacheConfig {
  enabled: boolean;
  ttl?: number;
  maxSize?: number;
}

export interface OODAPerformanceConfig {
  enabled: boolean;
}

export interface OODAAdaptationConfig {
  enabled: boolean;
  failureThreshold?: number;
}

export interface OODAConfig {
  observe: OODAAgentConfig;
  orient: OODAAgentConfig;
  decide: OODAAgentConfig;
  act: OODAAgentConfig;
  cache?: OODACacheConfig;
  performance?: OODAPerformanceConfig;
  adaptation?: OODAAdaptationConfig;
  maxIterations?: number;
  timeout?: number;
  contextMode?: 'full' | 'summary' | 'hybrid';
}

export interface AgentContext {
  userInput: string;
  observations?: string;
  intent?: string;
  decision?: string;
  previousResult?: string;
  historySummary?: string;
}

export interface AgentDependencies {
  llmService: any;
  toolRegistry?: any;
  skillRegistry?: any;
  permissionManager?: any;
}

export interface AgentInput {
  userInput: string;
  context?: AgentContext;
  fullHistory?: Message[];
  iteration: number;
  isLoop: boolean;
}

export interface AgentOutput<T = unknown> {
  success: boolean;
  data: T;
  summary: string;
  isComplete?: boolean;
  context?: Record<string, unknown>;
}

export interface ObserveResult {
  environment: string;
  anomalies: Array<{ type: string; description: string; severity: 'low' | 'medium' | 'high' }>;
  patterns: Array<{ type: string; description: string; significance: number }>;
}

export interface OrientResult {
  intent: { type: string; description: string; confidence: number };
  constraints: Array<{ type: string; description: string; severity: 'low' | 'medium' | 'high' }>;
  knowledgeGaps: Array<{ topic: string; description: string; importance: number }>;
  analysis: string;
}

export interface DecideResult {
  options: Array<{
    id: string;
    description: string;
    approach: string;
    pros: string[];
    cons: string[];
    riskLevel: 'low' | 'medium' | 'high';
    score: number;
  }>;
  selectedOption: { id: string; description: string };
  plan: { steps: Array<{ id: string; description: string; toolName?: string; args?: Record<string, unknown> }> };
  risks: string[];
}

export interface ActResult {
  execution: {
    toolName?: string;
    args?: Record<string, unknown>;
    result: unknown;
    success: boolean;
    error?: string;
  };
  evaluation: { targetMet: boolean; confidence: number; reasoning: string };
  feedback: { observations: string[]; suggestions: string[]; issues: string[] };
}

// =========================================
// 统一阶段上下文 - 明确阶段间数据传递
// =========================================

/**
 * LLM 交互记录
 */
export interface LLMInteraction {
  prompt: string;
  response: string;
  tokens: number;
  duration: number;
  timestamp: number;
}

/**
 * 阶段执行结果 - 统一的阶段输出格式
 */
export interface PhaseResult<T> {
  phase: 'observe' | 'orient' | 'decide' | 'act';
  success: boolean;
  data: T;
  llmInteraction?: LLMInteraction;
  error?: string;
  duration: number;
  timestamp: number;
}

/**
 * 智能完成判断接口 - 支持多维度判断任务是否完成
 */
export interface CompletionCriteria {
  /** 意图类型 */
  intentType: string;
  /** Action执行是否成功 */
  actionSuccess: boolean;
  /** Action结果 */
  actionResult?: ActionResult;
}

/**
 * 判断任务是否完成的智能逻辑
 */
export function evaluateCompletion(
  intentType: string,
  actionSuccess: boolean,
  actionResult?: ActionResult
): boolean {
  // 1. 执行失败，绝对不完成
  if (!actionSuccess) {
    return false;
  }

  // 2. 根据意图类型判断
  switch (intentType) {
    // 问答类：回复用户即完成
    case 'question':
    case 'general':
      return actionSuccess;

    // 工具调用类：需要检查是否有实际产出
    case 'file_read':
    case 'file_write':
    case 'execute':
    case 'search':
    case 'code_analysis':
      // 有新信息产出，或者没有遗留问题
      if (!actionResult) return actionSuccess;
      const hasNewInfo = actionResult.feedback?.newInformation?.length > 0;
      const noIssues = actionResult.feedback?.issues?.length === 0;
      return hasNewInfo || noIssues;

    // 澄清请求：不视为完成，需要用户响应
    case 'clarification':
      return false;

    // 默认：执行成功即完成
    default:
      return actionSuccess;
  }
}

/**
 * OODA 循环上下文 - 封装所有阶段数据
 */
export interface OODACycleContext {
  sessionId: string;
  iteration: number;
  originalInput: string;
  
  // 各阶段结果
  observe?: PhaseResult<Observation>;
  orient?: PhaseResult<Orientation>;
  decide?: PhaseResult<Decision>;
  act?: PhaseResult<ActionResult>;
  
  // 便捷方法
  getLatestObservation(): Observation | null;
  getLatestOrientation(): Orientation | null;
  getLatestDecision(): Decision | null;
  getLatestActionResult(): ActionResult | null;
  isComplete(): boolean;
  getSummary(): string;
}

/**
 * 创建 OODA 循环上下文的工厂函数
 */
export function createOODACycleContext(sessionId: string, iteration: number, originalInput: string): OODACycleContext {
  return {
    sessionId,
    iteration,
    originalInput,
    getLatestObservation() {
      return this.observe?.data ?? null;
    },
    getLatestOrientation() {
      return this.orient?.data ?? null;
    },
    getLatestDecision() {
      return this.decide?.data ?? null;
    },
    getLatestActionResult() {
      return this.act?.data ?? null;
    },
    isComplete() {
      // 使用多维完成判断
      const intentType = this.orient?.data?.primaryIntent?.type || 'general';
      const actionSuccess = this.act?.success === true;
      const actionResult = this.act?.data;
      
      return evaluateCompletion(intentType, actionSuccess, actionResult);
    },
    getSummary() {
      const parts: string[] = [];
      if (this.observe) parts.push(`Observe: ${this.observe.success ? '✓' : '✗'}`);
      if (this.orient) parts.push(`Orient: ${this.orient.success ? '✓' : '✗'}`);
      if (this.decide) parts.push(`Decide: ${this.decide.success ? '✓' : '✗'}`);
      if (this.act) parts.push(`Act: ${this.act.success ? '✓' : '✗'}`);
      return parts.join(' → ');
    }
  };
}
