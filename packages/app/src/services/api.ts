import type { Message, Skill, Session, SSEEvent, ApiResponse, ModelsResponse, ModelInfo, SwitchModelRequest } from '../types';

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
}

export const apiClient = new ApiClient();
