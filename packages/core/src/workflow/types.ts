export type NodeStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface FlowNode {
  id: string;
  name: string;
  dependencies: string[];
  status: NodeStatus;
  result?: unknown;
  error?: string;
  executionTime?: number;
  startTime?: number;
  endTime?: number;
}

export interface FlowContext {
  data: Map<string, unknown>;
  errors: Error[];
  metadata: Record<string, unknown>;
}

export type NodeExecutor = (context: FlowContext) => Promise<unknown>;

export interface FlowResult {
  success: boolean;
  context: FlowContext;
  nodes: Map<string, FlowNode>;
  executionOrder: string[];
  totalTime: number;
  errors: Error[];
}

export interface NodeDefinition {
  id: string;
  name: string;
  dependencies: string[];
}

export interface FlowDefinition {
  name: string;
  nodes: NodeDefinition[];
}

export type FlowType = 'simple' | 'complex' | 'code' | 'analysis';
