// test-llm-service.js
// 直接测试LLM服务

import { createLLMProvider } from './packages/core/src/llm/provider.js';

async function testLLMService() {
  console.log('测试LLM服务...');
  console.log('================');
  
  // 创建本地模型提供者
  const localProvider = createLLMProvider({
    type: 'local',
    model: 'local-model-8b',
    temperature: 0.7,
    maxTokens: 1000,
  });
  
  console.log('\n=== 测试本地模型 ===');
  console.log(`提供者: ${localProvider.name}`);
  console.log(`模型: ${localProvider.model}`);
  
  // 测试生成功能
  const testPrompts = [
    '分析用户输入的意图：读取文件：test.txt',
    '分解任务：意图：file_read，参数：{"path": "test.txt"}',
    '生成推理过程：用户意图：file_read，执行计划：读取文件内容，下一步行动：调用read_file工具'
  ];
  
  for (const prompt of testPrompts) {
    console.log('\n' + '-'.repeat(50));
    console.log(`提示: ${prompt}`);
    console.log('-'.repeat(50));
    
    try {
      const result = await localProvider.generate(prompt);
      console.log(`响应: ${result.text}`);
      console.log(`Tokens: ${result.tokens}`);
      console.log(`时间: ${result.time}ms`);
    } catch (error) {
      console.error('生成出错:', error);
    }
  }
  
  // 测试流式输出
  console.log('\n=== 测试流式输出 ===');
  try {
    const stream = localProvider.stream('分析用户输入的意图：搜索：AI Agent技术');
    let fullResponse = '';
    
    for await (const token of stream) {
      process.stdout.write(token);
      fullResponse += token;
    }
    
    console.log('\n');
  } catch (error) {
    console.error('流式输出出错:', error);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('测试完成！');
}

testLLMService().catch(console.error);