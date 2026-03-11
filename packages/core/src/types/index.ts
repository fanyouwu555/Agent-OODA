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
}

export interface Orientation {
  primaryIntent: Intent;
  relevantContext: Context;
  constraints: Constraint[];
  knowledgeGaps: KnowledgeGap[];
}

export interface Decision {
  plan: ActionPlan;
  nextAction: Action;
  reasoning: string;
}

export interface Action {
  type: 'tool_call' | 'skill_call' | 'response';
  toolName?: string;
  args?: Record<string, unknown>;
  content?: string;
}

export interface ActionPlan {
  subtasks: Subtask[];
  dependencies: DependencyGraph;
  currentStep: number;
}

export interface Subtask {
  id: string;
  description: string;
  toolName: string;
  args: Record<string, unknown>;
  dependencies: string[];
}

export interface DependencyGraph {
  nodes: string[];
  edges: { from: string; to: string }[];
}

export interface Intent {
  type: string;
  parameters: Record<string, unknown>;
  confidence: number;
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
