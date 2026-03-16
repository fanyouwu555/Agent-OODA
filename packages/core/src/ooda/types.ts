// packages/core/src/ooda/types.ts
// OODA 四代理架构类型定义

import { Message } from '../types';
import { PermissionMode } from '../permission';

export * from './loop';

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
