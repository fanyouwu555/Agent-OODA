import { LLMProvider, createLLMProvider, LLMProviderConfig } from './provider';
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
  
  async generate(prompt: string, options?: any): Promise<string> {
    const result = await this.provider.generate(prompt, options);
    return result.text;
  }
  
  async *stream(prompt: string, options?: any): AsyncGenerator<string> {
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
