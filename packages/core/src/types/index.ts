// packages/core/src/types/index.ts
import { z } from 'zod';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  parts?: MessagePart[];
  timestamp: number;
}

export type MessagePart = 
  | TextPart 
  | ToolCallPart 
  | ToolResultPart;

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ToolCallPart {
  type: 'tool_call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResultPart {
  type: 'tool_result';
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}

export interface AgentState {
  originalInput: string;
  history: Message[];
  currentStep: number;
  isComplete: boolean;
  result?: AgentResult;
  metadata: Record<string, unknown>;
}

export interface AgentResult {
  output: string;
  steps: ActionStep[];
  metadata: Record<string, unknown>;
}

export interface ActionStep {
  type: 'thought' | 'action' | 'observation';
  content: string;
  timestamp: number;
}

export interface Tool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  schema: z.ZodSchema;
  permissions: Permission[];
  execute(input: TInput, context: ExecutionContext): Promise<TOutput>;
}

export interface Permission {
  type: 'file_read' | 'file_write' | 'exec' | 'network';
  pattern: string;
}

export interface ExecutionContext {
  workingDirectory: string;
  sessionId: string;
  maxExecutionTime: number;
  resources: {
    memory: number;
    cpu: number;
  };
}

export interface Observation {
  userInput: string;
  toolResults: ToolResult[];
  context: Context;
  environment: EnvironmentState;
  history: Message[];
  anomalies?: Anomaly[];
  patterns?: Pattern[];
}

export interface Orientation {
  primaryIntent: Intent;
  relevantContext: Context;
  constraints: Constraint[];
  knowledgeGaps: KnowledgeGap[];
  patterns: Pattern[];
  relationships: Relationship[];
  assumptions: string[];
  risks: string[];
}

export interface Decision {
  problemStatement: string;
  options: Option[];
  selectedOption: Option;
  plan: ActionPlan;
  nextAction: Action;
  reasoning: string;
  riskAssessment: RiskAssessment;
}

export interface Option {
  id: string;
  description: string;
  approach: string;
  pros: string[];
  cons: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
  estimatedImpact: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
  score: number;
}

export interface RiskAssessment {
  identifiedRisks: IdentifiedRisk[];
  mitigationStrategies: string[];
  overallRiskLevel: 'low' | 'medium' | 'high';
}

export interface IdentifiedRisk {
  description: string;
  probability: number;
  impact: number;
  mitigation: string;
}

export interface Action {
  type: 'tool_call' | 'skill_call' | 'response' | 'clarification';
  toolName?: string;
  args?: Record<string, unknown>;
  content?: string;
  clarificationQuestion?: string;
}

export interface ActionPlan {
  subtasks: Subtask[];
  dependencies: DependencyGraph;
  currentStep: number;
  estimatedSteps: number;
}

export interface Subtask {
  id: string;
  description: string;
  toolName: string;
  args: Record<string, unknown>;
  dependencies: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface DependencyGraph {
  nodes: string[];
  edges: { from: string; to: string }[];
}

export interface Intent {
  type: string;
  parameters: Record<string, unknown>;
  confidence: number;
  rawInput?: string;
}

export interface Context {
  relevantFacts: string[];
  recentEvents: Message[];
  userPreferences: Record<string, unknown>;
}

export interface Constraint {
  type: 'time' | 'resource' | 'permission' | 'logic';
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface KnowledgeGap {
  topic: string;
  description?: string;
  importance: number;
  possibleSources: string[];
}

export interface EnvironmentState {
  currentTime: number;
  availableTools: string[];
  resourceUsage: ResourceUsage;
}

export interface ResourceUsage {
  memory: number;
  cpu: number;
  network: number;
}

export interface ToolResult {
  toolName: string;
  result: unknown;
  isError: boolean;
  executionTime: number;
}

export interface Pattern {
  type: string;
  description: string;
  significance: number;
  occurrences?: number;
}

export interface Relationship {
  from: string;
  to: string;
  type: 'dependency' | 'sequence' | 'causation' | 'correlation';
  strength: number;
}

export interface Anomaly {
  type: 'error' | 'warning' | 'unusual_pattern';
  description: string;
  severity: 'low' | 'medium' | 'high';
  context: string;
}

export interface ActionResult {
  success: boolean;
  result: unknown;
  sideEffects: string[];
  feedback: ActionFeedback;
}

export interface ActionFeedback {
  observations: string[];
  newInformation: string[];
  issues: string[];
  suggestions: string[];
}
