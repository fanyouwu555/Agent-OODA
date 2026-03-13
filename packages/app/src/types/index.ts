export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  thinking?: string;
  intent?: string;
  reasoning?: string;
  // 扩展属性（参考 OpenCode）
  status?: 'pending' | 'running' | 'completed' | 'error';
  isQueued?: boolean;  // 是否排队中
  error?: string;      // 错误信息
  updatedAt?: number;  // 更新时间
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: unknown;
  error?: string;
  startTime: number;
  endTime?: number;
}

export interface Skill {
  name: string;
  description: string;
  category: string;
  version: string;
}

export interface ConfirmationRequest {
  id: string;
  toolName: string;
  args: unknown;
  timestamp: number;
}

export interface Session {
  id: string;
  createdAt: number;
  updatedAt?: number;
  messages: Message[];
  title?: string;
  summary?: string;
  status?: 'active' | 'archived';
  archivedAt?: number;
  messageCount?: number;
  lastMessage?: Message | null;
}

export interface SessionListItem {
  id: string;
  createdAt: number;
  updatedAt?: number;
  title?: string;
  summary?: string;
  status?: 'active' | 'archived';
  archivedAt?: number;
  messageCount: number;
  lastMessage: Message | null;
  firstMessageContent?: string;
}

export interface SSEEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'result' | 'error' | 'confirmation' | 'intent' | 'reasoning' | 'end' | 'content';
  content?: string;
  toolCall?: ToolCall;
  confirmation?: ConfirmationRequest;
  status?: string;
  fullContent?: string;  // 用于流式内容的累积
}

export interface WebSocketMessage {
  type: 'confirmation' | 'tool_update' | 'session_update' | 'error' | 'subscribe' | 'subscribed' | 'unsubscribe' | 'unsubscribed' | 'ping' | 'pong' | 'connected';
  payload: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ModelInfo {
  name: string;
  provider: string;
  temperature: number;
  maxTokens: number;
}

export interface ProviderModel {
  name: string;
  temperature?: number;
  maxTokens?: number;
}

export interface Provider {
  name: string;
  type: string;
  models: ProviderModel[];
}

export interface ModelsResponse {
  providers: Provider[];
  activeModel: ModelInfo;
}

export interface SwitchModelRequest {
  providerName: string;
  modelName: string;
}

export type PermissionMode = 'allow' | 'deny' | 'ask';

export interface AgentMetadata {
  icon?: string;
  tags?: string[];
  author?: string;
  version?: string;
  homepage?: string;
  examples?: string[];
}

export interface AgentTrigger {
  keywords?: string[];
  patterns?: string[];
  fileTypes?: string[];
  autoStart?: boolean;
}

export interface AgentPermissionConfig {
  inherit?: boolean;
  tools?: Record<string, PermissionMode>;
  skills?: Record<string, PermissionMode>;
  patterns?: PermissionPattern[];
}

export interface PermissionPattern {
  pattern: string;
  mode: PermissionMode;
  conditions?: PermissionCondition[];
}

export interface PermissionCondition {
  type: 'path' | 'command' | 'resource';
  operator: 'equals' | 'contains' | 'matches' | 'startsWith';
  value: string;
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

export interface AgentModelConfig {
  name: string;
  provider?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export interface AgentRuntimeConfig {
  maxSteps?: number;
  timeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoff: 'fixed' | 'exponential';
  };
}

export interface AgentConfig {
  name: string;
  displayName?: string;
  description: string;
  metadata?: AgentMetadata;
  triggers?: AgentTrigger;
  systemPrompt: string;
  systemPromptFile?: string;
  tools: AgentToolConfig | string[];
  skills?: AgentSkillConfig;
  permissions?: AgentPermissionConfig;
  model: AgentModelConfig;
  mcpServers?: string[];
  extends?: string;
  runtime?: AgentRuntimeConfig;
  enabled?: boolean;
}

export type AgentStatus = 'idle' | 'running' | 'error' | 'disabled';

export interface AgentInstance {
  config: AgentConfig;
  status: AgentStatus;
  lastUsed?: number;
  usageCount: number;
}

export type ToolType = 'tool' | 'skill' | 'mcp-tool';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Permission {
  type: 'file_read' | 'file_write' | 'exec' | 'network';
  pattern: string;
}

export interface UnifiedTool {
  name: string;
  displayName?: string;
  description: string;
  type: ToolType;
  category: string;
  tags?: string[];
  version?: string;
  dependencies?: string[];
  requiredPermissions: Permission[];
  defaultPermissionMode?: PermissionMode;
  riskLevel?: RiskLevel;
}

export interface ToolGroup {
  name: string;
  displayName: string;
  description?: string;
  tools: string[];
  permissions?: Record<string, PermissionMode>;
}

export interface GlobalPermissionConfig {
  defaultMode: PermissionMode;
  tools: Record<string, PermissionMode>;
  skills: Record<string, PermissionMode>;
}

export interface EnhancedPermissionConfig {
  global: GlobalPermissionConfig;
  agents: Record<string, AgentPermissionConfig>;
  groups: Record<string, Record<string, PermissionMode>>;
}

export interface AgentsResponse {
  agents: AgentInstance[];
  default: string;
}

export interface ToolsResponse {
  tools: UnifiedTool[];
  groups: ToolGroup[];
}

export interface PermissionResponse {
  config: EnhancedPermissionConfig;
}

export interface SessionsResponse {
  sessions: SessionListItem[];
}
