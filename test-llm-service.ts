import { initializeConfigManager, getConfigManager, setLLMService, getLLMService } from '@ooda-agent/core';

async function testLLMService() {
  console.log('Testing LLM Service...');
  
  const config = {
    activeProvider: 'local-ollama',
    activeModel: 'qwen3:4b',
    provider: {
      'local-ollama': {
        type: 'ollama',
        options: {
          baseURL: 'http://localhost:11434'
        },
        models: {
          'qwen3:4b': {
            name: 'qwen3:4b',
            temperature: 0.7,
            maxTokens: 100
          }
        }
      }
    }
  };
  
  console.log('Initializing config...');
  initializeConfigManager(config);
  
  const configManager = getConfigManager();
  const activeModel = configManager.getActiveModelInfo();
  console.log('Active model:', activeModel);
  
  const providerConfig = configManager.getActiveProviderConfig();
  console.log('Provider config:', providerConfig);
  
  console.log('\nCreating LLM service...');
  setLLMService(providerConfig || undefined);
  
  const llmService = getLLMService();
  console.log('LLM service created');
  
  console.log('\nGenerating response...');
  const startTime = Date.now();
  
  try {
    const response = await llmService.generate('Hi');
    const endTime = Date.now();
    
    console.log('Response time:', (endTime - startTime) / 1000, 'seconds');
    console.log('Response:', response);
  } catch (error) {
    console.error('Error:', error);
  }
}

testLLMService().catch(console.error);
