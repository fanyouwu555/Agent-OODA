// test-ollama.js
// 测试Ollama集成

import { createLLMProvider } from './packages/core/src/llm/provider.js';

async function testOllama() {
  console.log('测试Ollama集成...');
  console.log('================');
  
  // 创建Ollama提供者
  const ollamaProvider = createLLMProvider({
    type: 'ollama',
    model: 'qwen3:8b', // qianwen3 8B模型
    baseUrl: 'http://localhost:11434',
    temperature: 0.7,
    maxTokens: 1000,
  });
  
  // 检查Ollama是否运行
  console.log('\n=== 检查Ollama状态 ===');
  try {
    // @ts-ignore - TypeScript类型定义需要更新
    const isRunning = await ollamaProvider.healthCheck();
    console.log('Ollama运行状态:', isRunning ? '✅ 运行中' : '❌ 未运行');
    
    if (!isRunning) {
      console.log('请先安装并启动Ollama:');
      console.log('1. 下载Ollama: https://ollama.com/download');
      console.log('2. 启动Ollama服务');
      console.log('3. 拉取qianwen3模型: ollama pull qwen3:8b');
      return;
    }
  } catch (error) {
    console.error('检查Ollama状态失败:', error);
    console.log('请先安装并启动Ollama');
    return;
  }
  
  // 列出可用模型
  console.log('\n=== 列出可用模型 ===');
  try {
    // @ts-ignore - TypeScript类型定义需要更新
    const models = await ollamaProvider.listModels();
    console.log('可用模型:');
    models.forEach(model => {
      console.log(`  - ${model.name} (${model.size})`);
    });
    
    // 检查qianwen3模型是否存在
    const hasQwen3 = models.some(model => model.name.includes('qwen3'));
    if (!hasQwen3) {
      console.log('\n⚠️ qianwen3模型未找到，正在拉取...');
      try {
        // @ts-ignore - TypeScript类型定义需要更新
        await ollamaProvider.pullModel('qwen3:8b');
        console.log('✅ qianwen3模型拉取成功');
      } catch (error) {
        console.error('拉取模型失败:', error);
        return;
      }
    } else {
      console.log('✅ qianwen3模型已就绪');
    }
  } catch (error) {
    console.error('列出模型失败:', error);
  }
  
  // 测试生成功能
  console.log('\n=== 测试生成功能 ===');
  const testPrompts = [
    '分析用户输入的意图：读取文件：test.txt',
    '分解任务：意图：file_read，参数：{"path": "test.txt"}',
    '生成推理过程：用户意图：file_read，执行计划：读取文件内容，下一步行动：调用read_file工具'
  ];
  
  for (const prompt of testPrompts) {
    console.log('\n' + '-'.repeat(60));
    console.log(`提示: ${prompt}`);
    console.log('-'.repeat(60));
    
    try {
      const result = await ollamaProvider.generate(prompt);
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
    console.log('流式响应:');
    const stream = ollamaProvider.stream('分析用户输入的意图：搜索：AI Agent技术');
    let fullResponse = '';
    
    for await (const token of stream) {
      process.stdout.write(token);
      fullResponse += token;
    }
    
    console.log('\n');
  } catch (error) {
    console.error('流式输出出错:', error);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Ollama集成测试完成！');
  console.log('qianwen3模型已成功集成！');
}

testOllama().catch(console.error);