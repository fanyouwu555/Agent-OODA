export type FlowType = 'simple' | 'complex' | 'code' | 'analysis';

export interface Pattern {
  id: string;
  requestType: FlowType;
  inputPattern: string;
  inputFeatures: Record<string, unknown>;
  successfulActions: PatternAction[];
  modelUsed: string;
  successRate: number;
  usageCount: number;
  createdAt: number;
  lastUsedAt: number;
  metadata: Record<string, unknown>;
}

export interface PatternAction {
  type: 'tool_call' | 'skill_call' | 'response';
  toolName?: string;
  args?: Record<string, unknown>;
  content?: string;
  order: number;
}

export interface PatternInput {
  requestType: FlowType;
  inputPattern: string;
  inputFeatures: Record<string, unknown>;
  successfulActions: PatternAction[];
  modelUsed: string;
  metadata?: Record<string, unknown>;
}

export interface PatternMatch {
  pattern: Pattern;
  similarity: number;
}

export interface PatternStats {
  totalPatterns: number;
  averageSuccessRate: number;
  totalUsage: number;
  uniqueRequestTypes: number;
  topRequestTypes: Array<{ type: string; count: number }>;
  topModels: Array<{ model: string; count: number }>;
}

export interface IPatternRepository {
  store(input: PatternInput): string;
  findById(id: string): Pattern | null;
  findByRequestType(type: FlowType, limit?: number): Pattern[];
  findSimilar(inputPattern: string, requestType?: FlowType, limit?: number): Pattern[];
  updateUsage(id: string, success: boolean): boolean;
  delete(id: string): boolean;
  cleanup(maxAge: number, maxPatterns: number): number;
  getStats(): PatternStats;
}
