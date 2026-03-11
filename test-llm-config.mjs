import { getLLMService, setLLMService } from './packages/core/dist/llm/service.js';
import { getConfigManager } from './packages/core/dist/config/index.js';

const configManager = getConfigManager();
const providerConfig = configManager.getProviderConfig('local-ollama');

console.log('Provider config:', JSON.stringify(providerConfig, null, 2));

const modelConfig = providerConfig?.models ? Object.values(providerConfig.models)[0] : undefined;
console.log('Model config:', JSON.stringify(modelConfig, null, 2));

const llmService = getLLMService();
const provider = llmService.getProvider();

console.log('Provider name:', provider.name);
console.log('Provider model:', provider.model);
console.log('Provider baseUrl:', provider.baseUrl);
console.log('Provider temperature:', provider.temperature);
console.log('Provider maxTokens:', provider.maxTokens);
