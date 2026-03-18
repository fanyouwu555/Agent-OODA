import { LLMProvider, createLLMProvider, LLMProviderConfig, GenerateOptions, GenerateResult, ChatMessage } from './provider';
import { getConfigManager } from '../config';

export class LLMService {
  private provider: LLMProvider;
  
  constructor(config?: LLMProviderConfig) {
    if (config) {
      this.provider = createLLMProvider(config);
    } else {
      const configManager = getConfigManager();
      const providerConfig = configManager.getActiveProviderConfig();
      
      if (!providerConfig) {
        throw new Error('No active provider configured');
      }
      
      this.provider = createLLMProvider(providerConfig);
    }
  }
  
  async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    return this.provider.generate(prompt, options);
  }

  async chat(messages: ChatMessage[], options?: GenerateOptions): Promise<GenerateResult> {
    return this.provider.chat(messages, options);
  }

  async *stream(prompt: string, options?: GenerateOptions): AsyncGenerator<string> {
    for await (const token of this.provider.stream(prompt, options)) {
      yield token;
    }
  }
  
  getProvider(): LLMProvider {
    return this.provider;
  }
}

let llmService: LLMService | null = null;

export function getLLMService(): LLMService {
  if (!llmService) {
    llmService = new LLMService();
  }
  return llmService;
}

export function setLLMService(config?: LLMProviderConfig): void {
  llmService = new LLMService(config);
}

export function resetLLMService(): void {
  llmService = null;
}

export function reinitializeLLMService(): LLMService {
  llmService = null;
  return getLLMService();
}

/**
 * 根据配置创建 LLM 服务实例
 * 用于 OODA 各阶段选择不同模型
 */
export function createLLMServiceWithConfig(config: LLMProviderConfig): LLMService {
  return new LLMService(config);
}

/**
 * 获取指定 provider 和 model 的 LLM 服务
 */
export function getLLMServiceWithModel(providerName: string, modelName: string): LLMService {
  const configManager = getConfigManager();

  // 获取指定 provider 和 model 的配置
  const config = configManager.getProviderConfigByName(providerName, modelName);
  if (!config) {
    throw new Error(`Provider config not found: ${providerName}`);
  }

  return new LLMService(config);
}
