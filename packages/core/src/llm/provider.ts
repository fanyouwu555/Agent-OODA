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
  stream(prompt: string, options?: StreamOptions): AsyncGenerator<string>;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
}

export interface StreamOptions extends GenerateOptions {
  onToken?: (token: string) => void;
}

export interface GenerateResult {
  text: string;
  tokens: number;
  time: number;
}

export class LocalModelProvider implements LLMProvider {
  name = 'local';
  model: string;
  temperature: number;
  maxTokens: number;
  
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
    const responses: Record<string, string> = {
      '读取文件': '我需要使用read_file工具来读取文件内容',
      '搜索': '我需要使用search_web工具来搜索相关信息',
      '运行命令': '我需要使用run_bash工具来执行命令',
    };
    
    for (const [key, value] of Object.entries(responses)) {
      if (prompt.includes(key)) {
        return value;
      }
    }
    
    return '我需要思考如何处理这个请求...';
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
