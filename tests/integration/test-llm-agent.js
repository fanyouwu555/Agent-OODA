// test-llm-agent.js
// 测试集成本地模型的OODA Agent

import { OODALoop } from './packages/core/src/index.js';
import { setLLMService } from './packages/core/src/llm/service.js';

async function testLLMAgent() {
  console.log('测试集成本地模型的OODA Agent...');
  console.log('================================');
  
  // 配置本地模型
  setLLMService({
    type: 'local',
    model: 'local-model-8b',
    temperature: 0.7,
    maxTokens: 1000,
  });
  
  const oodaLoop = new OODALoop();
  
  // 测试用例
  const testCases = [
    '读取文件：test.txt',
    '搜索：AI Agent 技术',
    '运行命令：ls -la',
    '帮我分析一下当前的天气情况'
  ];
  
  for (const test of testCases) {
    console.log('\n' + '='.repeat(60));
    console.log(`测试输入: ${test}`);
    console.log('='.repeat(60));
    
    try {
      const result = await oodaLoop.execute(test);
      console.log('\n=== 结果 ===');
      console.log(`输出: ${result.output}`);
      console.log('\n=== 执行步骤 ===');
      result.steps.forEach((step, index) => {
        console.log(`${index + 1}. ${step.type}: ${step.content}`);
      });
    } catch (error) {
      console.error('执行出错:', error);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('测试完成！');
}

testLLMAgent().catch(console.error);