// packages/core/src/llm/openai-compatible.ts
import { LLMProvider, GenerateOptions, StreamOptions, GenerateResult } from './provider';

export interface OpenAICompatibleConfig {
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature?: number;
  maxTokens?: number;
}

export class OpenAICompatibleProvider implements LLMProvider {
  name = 'openai-compatible';
  model: string;
  baseUrl: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  
  constructor(config: OpenAICompatibleConfig) {
    this.model = config.model;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 2000;
  }
  
  async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();
    const maxRetries = 3;
    const baseDelay = 2000; // 2 seconds
    
    const url = `${this.baseUrl}/chat/completions`;
    const body = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: options?.temperature ?? this.temperature,
      max_tokens: options?.maxTokens ?? this.maxTokens,
      stream: false,
    });
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[OpenAI-Compatible] POST ${url} (attempt ${attempt}/${maxRetries})`);
        console.log(`[OpenAI-Compatible] Model: ${this.model}`);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body,
        });
        
        console.log(`[OpenAI-Compatible] Response status: ${response.status}`);
        
        if (response.status === 429) {
          const errorText = await response.text();
          console.log(`[OpenAI-Compatible] Rate limited: ${errorText}`);
          
          if (attempt < maxRetries) {
            const delay = baseDelay * attempt;
            console.log(`[OpenAI-Compatible] Retrying in ${delay}ms...`);
            await this.sleep(delay);
            continue;
          }
        }
        
        if (!response.ok) {
          const errorText = await response.text();
          console.log(`[OpenAI-Compatible] Error response: ${errorText}`);
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        const endTime = Date.now();
        
        const text = data.choices?.[0]?.message?.content || '';
        
        return {
          text,
          tokens: data.usage?.total_tokens || 0,
          time: endTime - startTime,
        };
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        console.log(`[OpenAI-Compatible] Attempt ${attempt} failed, retrying...`);
        await this.sleep(baseDelay * attempt);
      }
    }
    
    throw new Error('Max retries exceeded');
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async *stream(prompt: string, options?: StreamOptions): AsyncGenerator<string> {
    const url = `${this.baseUrl}/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: options?.temperature ?? this.temperature,
        max_tokens: options?.maxTokens ?? this.maxTokens,
        stream: true,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
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
        if (line.startsWith('data: ')) {
          const data = line.substring(6).trim();
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              if (options?.onToken) {
                options.onToken(content);
              }
              yield content;
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }
    }
  }
}
