export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  thinking?: string;
  intent?: string;
  reasoning?: string;
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
  messages: Message[];
}

export interface SSEEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'result' | 'error' | 'confirmation' | 'intent' | 'reasoning' | 'end';
  content?: string;
  toolCall?: ToolCall;
  confirmation?: ConfirmationRequest;
  status?: string;
}

export interface WebSocketMessage {
  type: 'confirmation' | 'tool_update' | 'session_update' | 'error';
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
