// packages/core/src/llm/provider.ts
import { z } from 'zod';
import { OllamaProvider } from './ollama';
import { OpenAICompatibleProvider, OpenAICompatibleConfig } from './openai-compatible';

export interface LLMProvider {
  name: string;
  model: string;
  temperature: number;
  maxTokens: number;
  
  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;
  chat(messages: ChatMessage[], options?: GenerateOptions): Promise<GenerateResult>;
  stream(prompt: string, options?: StreamOptions): AsyncGenerator<string>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  timeout?: number;
  systemPrompt?: string;
  history?: ChatMessage[];
}

export interface StreamOptions extends GenerateOptions {
  onToken?: (token: string) => void;
}

export interface GenerateResult {
  text: string;
  tokens: number;
  time: number;
  error?: string;
}

export class LocalModelProvider implements LLMProvider {
  name = 'local';
  model: string;
  temperature: number;
  maxTokens: number;
  private callCount = 0;
  
  constructor(config: {
    model: string;
    temperature?: number;
    maxTokens?: number;
  }) {
    this.model = config.model;
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 1000;
  }
  
  async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();
    
    const response = await this.simulateLocalModel(prompt, options);
    
    const endTime = Date.now();
    
    return {
      text: response,
      tokens: response.length / 4,
      time: endTime - startTime,
    };
  }
  
  async chat(messages: ChatMessage[], options?: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();
    
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const prompt = lastUserMessage?.content || '';
    const response = await this.simulateLocalModel(prompt, options);
    
    const endTime = Date.now();
    
    return {
      text: response,
      tokens: response.length / 4,
      time: endTime - startTime,
    };
  }
  
  async *stream(prompt: string, options?: StreamOptions): AsyncGenerator<string> {
    const response = await this.generate(prompt, options);
    
    for (const char of response.text) {
      if (options?.onToken) {
        options.onToken(char);
      }
      yield char;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  private async simulateLocalModel(prompt: string, options?: GenerateOptions): Promise<string> {
    this.callCount++;
    
    const timestamp = Date.now();
    const randomFactor = Math.random().toString(36).substring(7);
    
    if (prompt.includes('意图') || prompt.includes('intent')) {
      return JSON.stringify({
        intentType: 'question',
        parameters: { query: prompt.substring(0, 100) },
        confidence: 0.7 + Math.random() * 0.3,
        patterns: [],
        relationships: [],
        assumptions: ['使用本地模拟模型'],
        risks: [],
        _meta: { callId: this.callCount, timestamp, randomFactor }
      });
    }
    
    if (prompt.includes('决策') || prompt.includes('decision') || prompt.includes('方案')) {
      return JSON.stringify({
        problemStatement: `处理用户请求 (调用 #${this.callCount})`,
        options: [
          {
            id: 'option_1',
            description: '直接回答用户问题',
            approach: '基于已有知识提供回答',
            pros: ['快速响应', '无需外部工具'],
            cons: ['可能信息有限'],
            estimatedComplexity: 'low',
            estimatedImpact: 'medium',
            riskLevel: 'low',
            score: 0.75 + Math.random() * 0.2
          }
        ],
        recommendedOption: 'option_1',
        reasoning: `基于当前上下文分析，建议直接回答用户问题。时间戳: ${timestamp}`,
        risks: [],
        mitigationStrategies: [],
        _meta: { callId: this.callCount, timestamp, randomFactor }
      });
    }
    
    if (prompt.includes('分解') || prompt.includes('subtask')) {
      return JSON.stringify({
        subtasks: [],
        _meta: { callId: this.callCount, timestamp, randomFactor }
      });
    }
    
    return JSON.stringify({
      response: `本地模型响应 #${this.callCount} (时间: ${new Date(timestamp).toISOString()})`,
      prompt: prompt.substring(0, 200),
      _meta: { callId: this.callCount, timestamp, randomFactor }
    });
  }
}

export const LLMProviderConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('local'),
    model: z.string(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
  }),
  z.object({
    type: z.literal('ollama'),
    model: z.string(),
    baseUrl: z.string().optional(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
  }),
  z.object({
    type: z.literal('kimi'),
    model: z.string(),
    apiKey: z.string(),
    baseUrl: z.string().optional(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
  }),
  z.object({
    type: z.literal('openai-compatible'),
    model: z.string(),
    apiKey: z.string(),
    baseUrl: z.string(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
  }),
]);

export type LLMProviderConfig = z.infer<typeof LLMProviderConfigSchema>;

export type LocalProviderConfig = {
  type: 'local';
  model: string;
  temperature?: number;
  maxTokens?: number;
};

export type OllamaProviderConfig = {
  type: 'ollama';
  model: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
};

export type KimiProviderConfig = {
  type: 'kimi';
  model: string;
  apiKey: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
};

export type OpenAICompatibleProviderConfig = {
  type: 'openai-compatible';
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature?: number;
  maxTokens?: number;
};

export function isLocalProviderConfig(config: LLMProviderConfig): config is LocalProviderConfig {
  return config.type === 'local';
}

export function isOllamaProviderConfig(config: LLMProviderConfig): config is OllamaProviderConfig {
  return config.type === 'ollama';
}

export function isKimiProviderConfig(config: LLMProviderConfig): config is KimiProviderConfig {
  return config.type === 'kimi';
}

export function isOpenAICompatibleProviderConfig(config: LLMProviderConfig): config is OpenAICompatibleProviderConfig {
  return config.type === 'openai-compatible';
}

export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  if (isLocalProviderConfig(config)) {
    return new LocalModelProvider({
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  }
  
  if (isOllamaProviderConfig(config)) {
    return new OllamaProvider({
      model: config.model,
      baseUrl: config.baseUrl,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  }
  
  if (isKimiProviderConfig(config)) {
    return new OpenAICompatibleProvider({
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://api.moonshot.cn/v1',
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  }
  
  if (isOpenAICompatibleProviderConfig(config)) {
    return new OpenAICompatibleProvider({
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  }
  
  throw new Error(`Unknown LLM provider type`);
}
