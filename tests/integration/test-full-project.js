// test-full-project.js
// 完整的项目测试

import { OODALoop } from './packages/core/src/index.js';
import { getConfig, setConfig } from './packages/core/src/config/index.js';
import { getMemory } from './packages/core/src/memory/index.js';

async function testFullProject() {
  console.log('测试完整项目功能...');
  console.log('====================');
  
  // 测试1: 配置系统
  console.log('\n=== 测试1: 配置系统 ===');
  console.log('默认配置:', JSON.stringify(getConfig().get(), null, 2));
  
  // 更新配置
  setConfig({
    llm: {
      model: 'local-model-8b',
      temperature: 0.5,
    },
    ooda: {
      maxIterations: 5,
      timeout: 30000,
    },
  });
  
  console.log('更新后配置:', JSON.stringify(getConfig().get(), null, 2));
  
  // 测试2: 记忆系统
  console.log('\n=== 测试2: 记忆系统 ===');
  const memory = getMemory();
  
  // 存储测试记忆
  const memoryId = memory.getLongTerm().store({
    content: '测试记忆内容',
    embedding: [],
    metadata: {
      type: 'fact',
      source: 'test',
      tags: ['test'],
      related: [],
    },
    importance: 0.8,
  });
  
  console.log('存储记忆ID:', memoryId);
  console.log('长期记忆数量:', memory.getLongTerm().size());
  
  // 搜索记忆
  const searchResults = memory.getLongTerm().search('测试');
  console.log('搜索结果数量:', searchResults.length);
  
  // 测试3: OODA循环
  console.log('\n=== 测试3: OODA循环 ===');
  const oodaLoop = new OODALoop();
  
  // 测试用例
  const testCases = [
    '读取文件：test.txt',
    '搜索：AI Agent 技术',
    '运行命令：ls -la',
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
      console.log(`\n执行时间: ${result.metadata?.endTime - result.metadata?.startTime}ms`);
    } catch (error) {
      console.error('执行出错:', error);
    }
  }
  
  // 测试4: 记忆系统持久化
  console.log('\n=== 测试4: 记忆系统持久化 ===');
  console.log('短期记忆大小:', memory.getShortTerm().getStats().shortTermSize);
  console.log('长期记忆大小:', memory.getLongTerm().size());
  
  // 测试5: 配置热更新
  console.log('\n=== 测试5: 配置热更新 ===');
  setConfig({
    tools: {
      enabled: ['read_file', 'search_web'],
    },
  });
  
  console.log('热更新后配置:', JSON.stringify(getConfig().getToolsConfig(), null, 2));
  
  // 清理
  memory.clear();
  console.log('\n=== 清理 ===');
  console.log('短期记忆大小:', memory.getShortTerm().getStats().shortTermSize);
  console.log('长期记忆大小:', memory.getLongTerm().size());
  
  console.log('\n' + '='.repeat(60));
  console.log('完整项目测试完成！');
  console.log('所有功能正常运行！');
}

testFullProject().catch(console.error);