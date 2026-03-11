// packages/core/src/llm/ollama.ts
import { LLMProvider, GenerateOptions, StreamOptions, GenerateResult } from './provider';

/**
 * Ollama Provider for local models like qianwen3
 */
export class OllamaProvider implements LLMProvider {
  name = 'ollama';
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  
  constructor(config: {
    model: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
  }) {
    this.model = config.model;
    let url = config.baseUrl || 'http://localhost:11434';
    if (url.endsWith('/v1')) {
      url = url.slice(0, -3);
    }
    if (url.endsWith('/api')) {
      url = url.slice(0, -4);
    }
    this.baseUrl = url;
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 1000;
    console.log(`[Ollama] Initialized with baseUrl: ${this.baseUrl}, model: ${this.model}`);
  }
  
  async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();
    
    const url = `${this.baseUrl}/api/generate`;
    const body = JSON.stringify({
      model: this.model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: options?.temperature ?? this.temperature,
        max_tokens: options?.maxTokens ?? this.maxTokens,
        stop: options?.stop,
      },
    });
    
    console.log(`[Ollama] POST ${url}`);
    console.log(`[Ollama] Body: ${body}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });
    
    console.log(`[Ollama] Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[Ollama] Error response: ${errorText}`);
      throw new Error(`Ollama API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    const endTime = Date.now();
    
    return {
      text: data.response || '',
      tokens: data.eval_count || 0,
      time: endTime - startTime,
    };
  }
  
  async *stream(prompt: string, options?: StreamOptions): AsyncGenerator<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        prompt: prompt,
        stream: true,
        options: {
          temperature: options?.temperature ?? this.temperature,
          max_tokens: options?.maxTokens ?? this.maxTokens,
          stop: options?.stop,
        },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }
    
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              if (options?.onToken) {
                options.onToken(data.response);
              }
              yield data.response;
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }
    }
  }
  
  /**
   * Check if Ollama is running
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch (e) {
      return false;
    }
  }
  
  /**
   * List available models
   */
  async listModels(): Promise<Array<{ name: string; size: string; modified_at: string }>> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.models || [];
  }
  
  /**
   * Pull a model
   */
  async pullModel(model: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model }),
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }
    
    // Stream the response to show progress
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }
    
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            if (data.status) {
              console.log(`Ollama: ${data.status}`);
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }
    }
  }
}