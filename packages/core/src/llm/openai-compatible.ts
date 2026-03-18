import { LLMProvider, GenerateOptions, StreamOptions, GenerateResult, ChatMessage } from './provider';

export interface OpenAICompatibleConfig {
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature?: number;
  maxTokens?: number;
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
    return this.chat(messages, options);
  }
  
  async chat(messages: ChatMessage[], options?: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();
    const maxRetries = 3;
    const baseDelay = 2000;
    
    const url = `${this.baseUrl}/chat/completions`;
    const body = JSON.stringify({
      model: this.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.name && { name: m.name }),
        ...(m.toolCallId && { tool_call_id: m.toolCallId }),
      })),
      temperature: options?.temperature ?? this.temperature,
      max_tokens: options?.maxTokens ?? this.maxTokens,
      stream: false,
    });
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[OpenAI-Compatible] POST ${url} (attempt ${attempt}/${maxRetries})`);
        console.log(`[OpenAI-Compatible] Model: ${this.model}, Messages: ${messages.length}`);
        
        // 添加超时控制 - 60秒超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
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
        
        // 详细日志：记录完整的 API 响应
        console.log(`[OpenAI-Compatible] Response data:`, JSON.stringify(data, null, 2).substring(0, 2000));
        
        const text = data.choices?.[0]?.message?.content || '';
        
        // 详细日志：检查响应内容
        console.log(`[OpenAI-Compatible] Extracted text length: ${text.length}`);
        console.log(`[OpenAI-Compatible] Extracted text preview: ${text.substring(0, 200)}`);
        
        if (!text || text.trim().length === 0) {
          console.warn(`[OpenAI-Compatible] ⚠️  Warning: Empty content received from API`);
          console.warn(`[OpenAI-Compatible] ⚠️  choices:`, JSON.stringify(data.choices));
          console.warn(`[OpenAI-Compatible] ⚠️  finish_reason:`, data.choices?.[0]?.finish_reason);
          console.warn(`[OpenAI-Compatible] ⚠️  usage:`, JSON.stringify(data.usage));
        }
        
        return {
          text,
          tokens: data.usage?.total_tokens || 0,
          time: endTime - startTime,
        };
      } catch (error) {
        // 处理超时错误
        if (error instanceof Error && error.name === 'AbortError') {
          console.log(`[OpenAI-Compatible] Request timed out after 60s`);
          throw new Error('Request timed out after 60 seconds');
        }
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
    const messages = this.buildMessages(prompt, options);
    const url = `${this.baseUrl}/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
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
