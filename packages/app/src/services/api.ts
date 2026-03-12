import type { 
  Message, Skill, Session, SessionListItem, SSEEvent, ApiResponse, 
  ModelsResponse, ModelInfo, SwitchModelRequest,
  AgentConfig, AgentInstance, AgentsResponse,
  UnifiedTool, ToolGroup, ToolsResponse,
  EnhancedPermissionConfig, PermissionResponse, PermissionMode
} from '../types';

const API_BASE = '/api';

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
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
    const response = await fetch(`${this.baseUrl}/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
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

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.substring(5).trim();
          if (data) {
            try {
              const event: SSEEvent = JSON.parse(data);
              onEvent(event);
            } catch (e) {
              console.warn('Failed to parse SSE event:', data);
            }
          }
        }
      }
    }
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
}

export const apiClient = new ApiClient();
