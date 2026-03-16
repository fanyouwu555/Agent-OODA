import type { 
  Message, Skill, Session, SessionListItem, SSEEvent, ApiResponse, 
  ModelsResponse, ModelInfo, SwitchModelRequest,
  AgentConfig, AgentInstance, AgentsResponse,
  UnifiedTool, ToolGroup, ToolsResponse,
  EnhancedPermissionConfig, PermissionResponse, PermissionMode
} from '../types';

const API_BASE = '/api';

// Logger utility for frontend
class FrontendLogger {
  private enabled: boolean;

  constructor() {
    this.enabled = import.meta.env.DEV || localStorage.getItem('DEBUG_API') === 'true';
  }

  private formatMessage(level: string, category: string, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data, null, 2)}` : '';
    return `[${timestamp}] [${level}] [${category}] ${message}${dataStr}`;
  }

  private getColor(level: string): string {
    const colors: Record<string, string> = {
      debug: '#00bcd4',
      info: '#4caf50',
      warn: '#ff9800',
      error: '#f44336',
    };
    return colors[level] || '#999';
  }

  log(level: string, category: string, message: string, data?: unknown): void {
    if (!this.enabled) return;

    const style = `color: ${this.getColor(level)}; font-weight: bold;`;
    const prefix = `%c[${level.toUpperCase()}] [${category}]`;

    if (level === 'error') {
      console.error(prefix, style, message, data || '');
    } else if (level === 'warn') {
      console.warn(prefix, style, message, data || '');
    } else {
      console.log(prefix, style, message, data || '');
    }
  }

  request(method: string, url: string, body?: unknown): void {
    this.log('debug', 'API Request', `${method} ${url}`, {
      body: this.truncateData(body),
      timestamp: Date.now(),
    });
  }

  response(method: string, url: string, status: number, duration: number, data?: unknown): void {
    const level = status >= 400 ? 'error' : status >= 300 ? 'warn' : 'info';
    this.log(level, 'API Response', `${method} ${url} - ${status} (${duration}ms)`, {
      status,
      duration,
      data: this.truncateData(data),
    });
  }

  sse(event: string, data?: unknown): void {
    this.log('debug', 'SSE', `Event: ${event}`, this.truncateData(data));
  }

  websocket(type: 'connect' | 'disconnect' | 'send' | 'receive' | 'error', data?: unknown): void {
    this.log('debug', 'WebSocket', type, this.truncateData(data));
  }

  private truncateData(data: unknown, maxLength: number = 500): unknown {
    if (!data) return data;
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    if (str.length <= maxLength) return data;
    return str.substring(0, maxLength) + `... (${str.length - maxLength} more chars)`;
  }
}

const logger = new FrontendLogger();

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const startTime = Date.now();
    const url = `${this.baseUrl}${path}`;
    const method = options.method || 'GET';

    // Log request
    let requestBody: unknown;
    if (options.body) {
      try {
        requestBody = JSON.parse(options.body as string);
      } catch {
        requestBody = options.body;
      }
    }
    logger.request(method, url, requestBody);

    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const error = await response.text();
        logger.response(method, url, response.status, duration, { error });
        return { success: false, error };
      }

      const data = await response.json();
      logger.response(method, url, response.status, duration, data);
      return { success: true, data };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.response(method, url, 0, duration, { error: errorMessage });
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  }

  async createSession(): Promise<ApiResponse<{ sessionId: string }>> {
    return this.request<{ sessionId: string }>('/session', {
      method: 'POST',
    });
  }

  async getSession(sessionId: string): Promise<ApiResponse<Session>> {
    return this.request<Session>(`/session/${sessionId}`);
  }

  async getSessionHistory(sessionId: string): Promise<ApiResponse<Message[]>> {
    return this.request<Message[]>(`/session/${sessionId}/history`);
  }

  async sendMessage(
    sessionId: string,
    message: string,
    onEvent: (event: SSEEvent) => void
  ): Promise<void> {
    const startTime = Date.now();
    const url = `${this.baseUrl}/session/${sessionId}/message`;

    logger.request('POST', url, { message: message.substring(0, 100) + (message.length > 100 ? '...' : '') });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      const duration = Date.now() - startTime;
      logger.response('POST', url, response.status, duration, { error: response.statusText });
      onEvent({ 
        type: 'error', 
        content: `HTTP ${response.status}: ${response.statusText}` 
      });
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onEvent({ type: 'error', content: 'No response body' });
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;
    let currentEventType = ''; // 跟踪当前事件类型

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        // 提取事件类型 (SSE event: 行)
        if (line.startsWith('event:')) {
          currentEventType = line.substring(6).trim();
          continue;
        }
        
        if (line.startsWith('data:')) {
          const data = line.substring(5).trim();
          if (data) {
            try {
              const parsedData = JSON.parse(data);
              // 优先使用 event: 行的类型，否则使用 data 里的 type
              const eventType = currentEventType || parsedData.type || 'message';
              const event: SSEEvent = { 
                ...parsedData, 
                type: eventType 
              };
              eventCount++;
              
              // Log first few events and errors
              if (eventCount <= 3 || eventType === 'error' || eventType === 'result') {
                logger.sse(eventType, { 
                  content: event.content?.substring(0, 100),
                  sessionId: (event as any).sessionId 
                });
              }
              
              onEvent(event);
              
              // 重置事件类型
              currentEventType = '';
            } catch (e) {
              console.warn('Failed to parse SSE event:', data);
            }
          }
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.log('info', 'SSE', `Stream completed with ${eventCount} events`, { duration });
  }

  async getSkills(): Promise<ApiResponse<Skill[]>> {
    return this.request<Skill[]>('/skills');
  }

  async healthCheck(): Promise<ApiResponse<{ status: string; timestamp: number }>> {
    return this.request<{ status: string; timestamp: number }>('/health');
  }

  async confirmPermission(sessionId: string, confirmationId: string, allowed: boolean): Promise<ApiResponse<void>> {
    return this.request<void>(`/session/${sessionId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ confirmationId, allowed }),
    });
  }

  async getModels(): Promise<ApiResponse<ModelsResponse>> {
    return this.request<ModelsResponse>('/models');
  }

  async switchModel(request: SwitchModelRequest): Promise<ApiResponse<{ success: boolean; activeModel: ModelInfo }>> {
    return this.request<{ success: boolean; activeModel: ModelInfo }>('/models/switch', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getActiveModel(): Promise<ApiResponse<ModelInfo>> {
    return this.request<ModelInfo>('/models/active');
  }

  async getSessions(status?: 'active' | 'archived'): Promise<ApiResponse<SessionListItem[]>> {
    const query = status ? `?status=${status}` : '';
    return this.request<SessionListItem[]>(`/sessions${query}`);
  }

  async searchSessions(query: string): Promise<ApiResponse<SessionListItem[]>> {
    return this.request<SessionListItem[]>(`/sessions/search?q=${encodeURIComponent(query)}`);
  }

  async archiveSession(sessionId: string): Promise<ApiResponse<{ success: boolean; status: string }>> {
    return this.request<{ success: boolean; status: string }>(`/session/${sessionId}/archive`, {
      method: 'PATCH',
    });
  }

  async restoreSession(sessionId: string): Promise<ApiResponse<{ success: boolean; status: string }>> {
    return this.request<{ success: boolean; status: string }>(`/session/${sessionId}/restore`, {
      method: 'PATCH',
    });
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<ApiResponse<{ success: boolean; title: string }>> {
    return this.request<{ success: boolean; title: string }>(`/session/${sessionId}/title`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  }

  async deleteSession(sessionId: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request<{ success: boolean }>(`/session/${sessionId}`, {
      method: 'DELETE',
    });
  }

  async getSessionsCount(): Promise<ApiResponse<{ count: number }>> {
    return this.request<{ count: number }>('/sessions/count');
  }

  async clearAllSessions(): Promise<ApiResponse<{ success: boolean; deleted: { sessions: number; messages: number; toolCalls: number } }>> {
    return this.request<{ success: boolean; deleted: { sessions: number; messages: number; toolCalls: number } }>('/sessions', {
      method: 'DELETE',
    });
  }

  async clearArchivedSessions(): Promise<ApiResponse<{ success: boolean; deleted: { sessions: number; messages: number; toolCalls: number } }>> {
    return this.request<{ success: boolean; deleted: { sessions: number; messages: number; toolCalls: number } }>('/sessions/archived', {
      method: 'DELETE',
    });
  }

  async clearOldSessions(days: number): Promise<ApiResponse<{ success: boolean; deleted: { sessions: number; messages: number; toolCalls: number }; cutoffDate: string }>> {
    return this.request<{ success: boolean; deleted: { sessions: number; messages: number; toolCalls: number }; cutoffDate: string }>(`/sessions/old?days=${days}`, {
      method: 'DELETE',
    });
  }

  async getAgents(): Promise<ApiResponse<AgentsResponse>> {
    return this.request<AgentsResponse>('/agents');
  }

  async getAgent(name: string): Promise<ApiResponse<AgentInstance>> {
    return this.request<AgentInstance>(`/agents/${name}`);
  }

  async createAgent(config: AgentConfig): Promise<ApiResponse<AgentInstance>> {
    return this.request<AgentInstance>('/agents', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async updateAgent(name: string, config: Partial<AgentConfig>): Promise<ApiResponse<AgentInstance>> {
    return this.request<AgentInstance>(`/agents/${name}`, {
      method: 'PATCH',
      body: JSON.stringify(config),
    });
  }

  async deleteAgent(name: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request<{ success: boolean }>(`/agents/${name}`, {
      method: 'DELETE',
    });
  }

  async enableAgent(name: string): Promise<ApiResponse<AgentInstance>> {
    return this.request<AgentInstance>(`/agents/${name}/enable`, {
      method: 'POST',
    });
  }

  async disableAgent(name: string): Promise<ApiResponse<AgentInstance>> {
    return this.request<AgentInstance>(`/agents/${name}/disable`, {
      method: 'POST',
    });
  }

  async setDefaultAgent(name: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request<{ success: boolean }>(`/agents/default`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async getTools(): Promise<ApiResponse<ToolsResponse>> {
    return this.request<ToolsResponse>('/tools');
  }

  async getTool(name: string): Promise<ApiResponse<UnifiedTool>> {
    return this.request<UnifiedTool>(`/tools/${name}`);
  }

  async getToolGroups(): Promise<ApiResponse<ToolGroup[]>> {
    return this.request<ToolGroup[]>('/tools/groups');
  }

  async getPermissions(): Promise<ApiResponse<PermissionResponse>> {
    return this.request<PermissionResponse>('/permissions');
  }

  async updateGlobalPermission(tool: string, mode: PermissionMode): Promise<ApiResponse<{ success: boolean }>> {
    return this.request<{ success: boolean }>('/permissions/global', {
      method: 'PATCH',
      body: JSON.stringify({ tool, mode }),
    });
  }

  async updateAgentPermission(
    agent: string,
    tool: string,
    mode: PermissionMode
  ): Promise<ApiResponse<{ success: boolean }>> {
    return this.request<{ success: boolean }>(`/permissions/agents/${agent}`, {
      method: 'PATCH',
      body: JSON.stringify({ tool, mode }),
    });
  }

  // ============ 日志相关 API ============
  
  async getLoggingStatus(): Promise<ApiResponse<{
    enabled: boolean;
    level: string;
    categories: Record<string, boolean>;
    logDir: string;
    totalEntries: number;
    fileEnabled: boolean;
  }>> {
    return this.request('/logging/status');
  }

  async getLoggingStats(): Promise<ApiResponse<{
    total: number;
    byLevel: Record<string, number>;
    byCategory: Record<string, number>;
    enabled: boolean;
    level: string;
    categories: Record<string, boolean>;
  }>> {
    return this.request('/logging/stats');
  }

  async getLoggingEntries(options?: {
    level?: string;
    category?: string;
    sessionId?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<{ entries: unknown[]; total: number }>> {
    const params = new URLSearchParams();
    if (options?.level) params.set('level', options.level);
    if (options?.category) params.set('category', options.category);
    if (options?.sessionId) params.set('sessionId', options.sessionId);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const query = params.toString();
    return this.request(`/logging/entries${query ? '?' + query : ''}`);
  }

  async toggleLogging(enabled: boolean): Promise<ApiResponse<{ success: boolean; enabled: boolean }>> {
    return this.request('/logging/toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  }

  async setLoggingLevel(level: string): Promise<ApiResponse<{ success: boolean; level: string }>> {
    return this.request('/logging/level', {
      method: 'POST',
      body: JSON.stringify({ level }),
    });
  }

  async setLoggingCategories(categories: Record<string, boolean>): Promise<ApiResponse<{ success: boolean; categories: Record<string, boolean> }>> {
    return this.request('/logging/categories', {
      method: 'POST',
      body: JSON.stringify({ categories }),
    });
  }

  async toggleLoggingCategory(category: string, enabled: boolean): Promise<ApiResponse<{ success: boolean; category: string; enabled: boolean }>> {
    return this.request(`/logging/category/${category}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  }

  async toggleLoggingFile(enabled: boolean): Promise<ApiResponse<{ success: boolean; fileEnabled: boolean }>> {
    return this.request('/logging/file/toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  }

  async clearLoggingMemory(): Promise<ApiResponse<{ success: boolean; cleared: number }>> {
    return this.request('/logging/clear/memory', {
      method: 'POST',
    });
  }

  async clearLoggingFiles(): Promise<ApiResponse<{ success: boolean; deleted: number; files: string[] }>> {
    return this.request('/logging/clear/files', {
      method: 'POST',
    });
  }

  async clearAllLogging(): Promise<ApiResponse<{ success: boolean; memoryCleared: number; filesDeleted: number; files: string[] }>> {
    return this.request('/logging/clear/all', {
      method: 'POST',
    });
  }

  async getLoggingFiles(): Promise<ApiResponse<{ files: string[]; logDir: string }>> {
    return this.request('/logging/files');
  }
}

export const apiClient = new ApiClient();

// Export logger for use in other services
export { logger };
