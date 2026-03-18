// packages/core/src/ooda/self-test.ts
// 自测脚本 - 验证渐进式响应机制

import { progressiveResponse } from './progressive-response';
import { getConfigManager } from '../config';
import { createLLMProvider, isOpenAICompatibleProviderConfig, isOllamaProviderConfig, isKimiProviderConfig } from '../llm/provider';

/**
 * 自测：验证配置加载
 */
export function testConfig(): void {
  console.log('=== 测试配置加载 ===');
  const configManager = getConfigManager();
  const config = configManager.getConfig();

  console.log('Active Provider:', config.activeProvider);
  console.log('Active Model:', config.activeModel);
  console.log('Available Providers:', Object.keys(config.provider || {}));

  const llmConfig = configManager.getProviderConfigByName(config.activeProvider || 'longcat');

  if (!llmConfig) {
    console.log('Provider Config: null');
    return;
  }

  // 根据类型显示不同的配置信息
  const configInfo: Record<string, unknown> = {
    type: llmConfig.type,
    model: llmConfig.model,
  };

  if (isOpenAICompatibleProviderConfig(llmConfig) || isKimiProviderConfig(llmConfig)) {
    configInfo.apiKeyPresent = llmConfig.apiKey ? 'Yes' : 'No';
    configInfo.apiKeyLength = llmConfig.apiKey?.length;
    configInfo.baseUrl = llmConfig.baseUrl;
  } else if (isOllamaProviderConfig(llmConfig)) {
    configInfo.baseUrl = llmConfig.baseUrl;
  }

  console.log('Provider Config:', configInfo);
}

/**
 * 自测：验证 LLM Provider 创建
 */
export async function testLLMProvider(): Promise<void> {
  console.log('\n=== 测试 LLM Provider 创建 ===');
  try {
    const configManager = getConfigManager();
    const llmConfig = configManager.getProviderConfigByName('longcat');

    if (!llmConfig) {
      console.error('❌ Provider config not found');
      return;
    }

    const configInfo: Record<string, unknown> = {
      type: llmConfig.type,
      model: llmConfig.model,
    };

    if (isOpenAICompatibleProviderConfig(llmConfig) || isKimiProviderConfig(llmConfig)) {
      configInfo.baseUrl = llmConfig.baseUrl;
    } else if (isOllamaProviderConfig(llmConfig)) {
      configInfo.baseUrl = llmConfig.baseUrl;
    }

    console.log('Creating provider with config:', configInfo);

    const provider = createLLMProvider(llmConfig);
    console.log('✅ Provider created successfully');

    // 测试简单的流式调用
    console.log('Testing stream...');
    const prompt = '你好';
    let chunkCount = 0;

    try {
      for await (const chunk of provider.stream(prompt)) {
        chunkCount++;
        if (chunkCount <= 3) {
          console.log(`Chunk ${chunkCount}:`, chunk.substring(0, 50));
        }
      }
      console.log(`✅ Stream completed, total chunks: ${chunkCount}`);
    } catch (streamError) {
      console.error('❌ Stream error:', streamError);
    }
  } catch (error) {
    console.error('❌ Provider creation error:', error);
  }
}

/**
 * 自测：验证渐进式响应
 */
export async function testProgressiveResponse(): Promise<void> {
  console.log('\n=== 测试渐进式响应 ===');

  const events: Array<{ type: string; data: any }> = [];

  try {
    const result = await progressiveResponse({
      input: '你好',
      history: [],
      sessionId: 'test-session',
      onEvent: async (type, data) => {
        events.push({ type, data });
        console.log(`[Event] ${type}:`, JSON.stringify(data).substring(0, 100));
      },
    });

    console.log('\n=== 结果 ===');
    console.log('Output length:', result.output.length);
    console.log('Output preview:', result.output.substring(0, 200));
    console.log('Used tools:', result.usedTools);
    console.log('Execution time:', result.executionTime, 'ms');
    console.log('Total events:', events.length);

    // 验证事件序列
    const eventTypes = events.map(e => e.type);
    console.log('Event sequence:', eventTypes);

    // 检查是否有 result 事件
    const hasResult = events.some(e => e.type === 'result');
    const hasContent = events.some(e => e.type === 'content');

    console.log('\n=== 验证 ===');
    console.log('✅ Has result event:', hasResult);
    console.log('✅ Has content event:', hasContent);
    console.log('✅ Output not empty:', result.output.length > 0);

  } catch (error) {
    console.error('❌ Progressive response error:', error);
    console.error('Stack:', (error as Error).stack);
  }
}

/**
 * 运行所有测试
 */
export async function runAllTests(): Promise<void> {
  console.log('========================================');
  console.log('OODA 渐进式响应机制自测');
  console.log('========================================\n');

  // 测试配置
  testConfig();

  // 测试 LLM Provider
  await testLLMProvider();

  // 测试渐进式响应
  await testProgressiveResponse();

  console.log('\n========================================');
  console.log('自测完成');
  console.log('========================================');
}
