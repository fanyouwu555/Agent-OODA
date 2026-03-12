// packages/core/src/collaboration/types.ts
import type { AgentConfigV2 } from '../agent/interface';
import type { Message } from '../types';

// Use AgentConfigV2 as AgentConfig for compatibility
export type AgentConfig = AgentConfigV2;

export interface AgentRole {
  id: string;
  name: string;
  description: string;
  responsibilities: string[];
  skills: string[];
  priority: number;
  config?: Partial<AgentConfig>;
}

export interface CollaborationTask {
  id: string;
  title: string;
  description: string;
  type: 'analysis' | 'synthesis' | 'execution' | 'review' | 'custom';
  assignedRole?: string;
  assignedAgent?: string;
  dependencies: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  input: unknown;
  output?: unknown;
  result?: TaskResult;
  metadata: Record<string, unknown>;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface TaskResult {
  success: boolean;
  data: unknown;
  summary: string;
  confidence: number;
  issues?: string[];
  suggestions?: string[];
}

export interface CollaborationSession {
  id: string;
  title: string;
  description: string;
  status: 'planning' | 'active' | 'paused' | 'completed' | 'failed';
  roles: AgentRole[];
  tasks: CollaborationTask[];
  agents: Map<string, CollaboratingAgent>;
  messages: CollaborationMessage[];
  context: Record<string, unknown>;
  strategy: CollaborationStrategy;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface CollaboratingAgent {
  id: string;
  name: string;
  roleId: string;
  config: AgentConfig;
  status: 'idle' | 'working' | 'waiting' | 'error';
  currentTask?: string;
  completedTasks: string[];
  capabilities: string[];
  performance: AgentPerformance;
}

export interface AgentPerformance {
  tasksCompleted: number;
  tasksFailed: number;
  averageResponseTime: number;
  qualityScore: number;
  lastActiveAt: number;
}

export interface CollaborationMessage {
  id: string;
  type: 'task_assignment' | 'task_result' | 'coordination' | 'broadcast' | 'direct';
  from: string;
  to?: string;
  content: string;
  data?: unknown;
  timestamp: number;
  taskId?: string;
}

export type CollaborationStrategy = 
  | 'sequential'
  | 'parallel'
  | 'hierarchical'
  | 'consensus'
  | 'competitive';

export interface CollaborationConfig {
  strategy: CollaborationStrategy;
  maxAgents: number;
  maxConcurrentTasks: number;
  timeout: number;
  autoAssign: boolean;
  requireConsensus: boolean;
  consensusThreshold: number;
  enableConflictResolution: boolean;
}

export interface TaskDecompositionResult {
  tasks: CollaborationTask[];
  dependencies: Map<string, string[]>;
  estimatedComplexity: 'low' | 'medium' | 'high';
  estimatedDuration: number;
  roles: AgentRole[];
}

export interface CollaborationResult {
  sessionId: string;
  success: boolean;
  output: unknown;
  summary: string;
  taskResults: Map<string, TaskResult>;
  agentContributions: Map<string, AgentContribution>;
  metrics: CollaborationMetrics;
  completedAt: number;
}

export interface AgentContribution {
  agentId: string;
  agentName: string;
  roleId: string;
  tasksCompleted: number;
  contributionScore: number;
  keyInsights: string[];
}

export interface CollaborationMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalDuration: number;
  averageTaskDuration: number;
  messageCount: number;
  conflictCount: number;
  consensusReached: boolean;
}

export interface ConflictResolution {
  type: 'resource' | 'opinion' | 'dependency' | 'priority';
  description: string;
  involvedAgents: string[];
  resolution?: string;
  resolvedAt?: number;
}

export interface ConsensusResult {
  reached: boolean;
  threshold: number;
  votes: Map<string, unknown>;
  winner?: unknown;
  confidence: number;
  dissenters?: string[];
}

export interface CollaborationOrchestrator {
  createSession(config: Partial<CollaborationSession>): Promise<CollaborationSession>;
  addAgent(sessionId: string, agent: CollaboratingAgent): Promise<void>;
  assignRole(sessionId: string, agentId: string, roleId: string): Promise<void>;
  submitTask(sessionId: string, task: Partial<CollaborationTask>): Promise<CollaborationTask>;
  executeSession(sessionId: string): Promise<CollaborationResult>;
  pauseSession(sessionId: string): Promise<void>;
  resumeSession(sessionId: string): Promise<void>;
  terminateSession(sessionId: string): Promise<CollaborationResult>;
  getSessionStatus(sessionId: string): CollaborationSession;
}
