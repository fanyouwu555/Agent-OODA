import { LLMProvider, GenerateOptions, StreamOptions, GenerateResult, ChatMessage } from './provider';

const MAX_RETRIES = 3;
const BASE_DELAY = 2000;
const DEFAULT_TIMEOUT = 120000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const DEFAULT_SYSTEM_PROMPT = `你是一个智能助手，能够理解用户的问题并提供有帮助的回答。
请根据对话上下文，给出准确、相关、有帮助的回答。
如果用户的问题不明确，可以请求澄清。
回答应该简洁明了，直接回应用户的问题。`;

function getCurrentTimeInfo(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekday = weekdays[now.getDay()];
  
  return `当前时间信息:
- 日期: ${year}年${month}月${day}日
- 时间: ${hours}:${minutes}:${seconds}
- 星期: 星期${weekday}
- 时区: 本地时间`;
}

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
  
  private buildMessages(prompt: string, options?: GenerateOptions): ChatMessage[] {
    const messages: ChatMessage[] = [];
    
    let systemPrompt = options?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const timeInfo = getCurrentTimeInfo();
    systemPrompt = `${systemPrompt}\n\n${timeInfo}`;
    
    messages.push({ role: 'system', content: systemPrompt });
    
    if (options?.history && options.history.length > 0) {
      messages.push(...options.history);
    }
    
    messages.push({ role: 'user', content: prompt });
    
    return messages;
  }
  
  async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    const messages = this.buildMessages(prompt, options);
    
    if (messages.length <= 2 && !options?.history?.length) {
      return this.generateSimple(prompt, options);
    }
    
    return this.chat(messages, options);
  }
  
  private async generateSimple(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const url = `${this.baseUrl}/api/generate`;
        const body = JSON.stringify({
          model: this.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: options?.temperature ?? this.temperature,
            num_predict: options?.maxTokens ?? this.maxTokens,
            stop: options?.stop,
          },
        });
        
        console.log(`[Ollama] POST ${url} (attempt ${attempt}/${MAX_RETRIES})`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        console.log(`[Ollama] Response status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.log(`[Ollama] Error response: ${errorText}`);
          
          if (response.status === 429 && attempt < MAX_RETRIES) {
            const delay = BASE_DELAY * attempt;
            console.log(`[Ollama] Rate limited, retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }
          
          throw new Error(`Ollama API error: ${response.statusText}`);
        }
        
        const data = await response.json();
        const endTime = Date.now();
        
        return {
          text: data.response || '',
          tokens: data.eval_count || 0,
          time: endTime - startTime,
        };
      } catch (error: any) {
        if (error.name === 'AbortError') {
          throw new Error(`Ollama request timed out after ${timeout}ms`);
        }
        
        if (attempt === MAX_RETRIES) {
          throw error;
        }
        
        const delay = BASE_DELAY * attempt;
        console.log(`[Ollama] Request failed, retrying in ${delay}ms... Error: ${error.message}`);
        await sleep(delay);
      }
    }
    
    throw new Error('Ollama generate failed after all retries');
  }
  
  async chat(messages: ChatMessage[], options?: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const url = `${this.baseUrl}/api/chat`;
        const body = JSON.stringify({
          model: this.model,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          stream: false,
          options: {
            temperature: options?.temperature ?? this.temperature,
            num_predict: options?.maxTokens ?? this.maxTokens,
            stop: options?.stop,
          },
        });
        
        console.log(`[Ollama] POST ${url} (attempt ${attempt}/${MAX_RETRIES})`);
        console.log(`[Ollama] Messages: ${messages.length}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        console.log(`[Ollama] Response status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.log(`[Ollama] Error response: ${errorText}`);
          
          if (response.status === 429 && attempt < MAX_RETRIES) {
            const delay = BASE_DELAY * attempt;
            console.log(`[Ollama] Rate limited, retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }
          
          throw new Error(`Ollama API error: ${response.statusText}`);
        }
        
        const data = await response.json();
        const endTime = Date.now();
        
        return {
          text: data.message?.content || '',
          tokens: data.eval_count || 0,
          time: endTime - startTime,
        };
      } catch (error: any) {
        if (error.name === 'AbortError') {
          throw new Error(`Ollama request timed out after ${timeout}ms`);
        }
        
        if (attempt === MAX_RETRIES) {
          throw error;
        }
        
        const delay = BASE_DELAY * attempt;
        console.log(`[Ollama] Request failed, retrying in ${delay}ms... Error: ${error.message}`);
        await sleep(delay);
      }
    }
    
    throw new Error('Ollama chat failed after all retries');
  }
  
  async *stream(prompt: string, options?: StreamOptions): AsyncGenerator<string> {
    const messages = this.buildMessages(prompt, options);
    
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
        options: {
          temperature: options?.temperature ?? this.temperature,
          num_predict: options?.maxTokens ?? this.maxTokens,
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
            const content = data.message?.content || data.response;
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
  
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch (e) {
      return false;
    }
  }
  
  async listModels(): Promise<Array<{ name: string; size: string; modified_at: string }>> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.models || [];
  }
  
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
