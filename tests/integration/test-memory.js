// test-memory.js
// 测试记忆系统

import { getMemory } from './packages/core/src/memory/index.js';

async function testMemory() {
  console.log('测试记忆系统...');
  console.log('================');
  
  const memory = getMemory();
  
  // 测试短期记忆
  console.log('\n=== 测试短期记忆 ===');
  
  // 模拟消息
  const testMessages = [
    {
      id: '1',
      role: 'user',
      content: '你好，我是用户',
      timestamp: Date.now() - 3600000,
    },
    {
      id: '2',
      role: 'assistant',
      content: '你好，我是助手',
      timestamp: Date.now() - 3500000,
    },
    {
      id: '3',
      role: 'user',
      content: '帮我读取文件：test.txt',
      timestamp: Date.now() - 3400000,
    },
  ];
  
  // 存储消息
  for (const message of testMessages) {
    memory.getShortTerm().storeMessage(message);
  }
  
  // 获取最近消息
  const recentMessages = memory.getShortTerm().getRecentMessages(2);
  console.log('最近2条消息:', recentMessages.length);
  recentMessages.forEach(msg => {
    console.log(`  ${msg.role}: ${msg.content}`);
  });
  
  // 测试工作记忆
  console.log('\n=== 测试工作记忆 ===');
  
  memory.getShortTerm().setContext('user_name', '张三');
  memory.getShortTerm().setContext('preference', '喜欢简洁的回答');
  
  console.log('用户名称:', memory.getShortTerm().getContext('user_name'));
  console.log('用户偏好:', memory.getShortTerm().getContext('preference'));
  console.log('是否存在:', memory.getShortTerm().has('user_name'));
  
  // 测试长期记忆
  console.log('\n=== 测试长期记忆 ===');
  
  // 存储长期记忆
  const memoryId1 = memory.getLongTerm().store({
    content: '文件test.txt的内容是：Hello World!',
    embedding: [],
    metadata: {
      type: 'fact',
      source: 'tool_result',
      tags: ['file', 'read'],
      related: [],
    },
    importance: 0.8,
  });
  
  const memoryId2 = memory.getLongTerm().store({
    content: '用户喜欢使用中文交流',
    embedding: [],
    metadata: {
      type: 'preference',
      source: 'observation',
      tags: ['user', 'preference'],
      related: [],
    },
    importance: 0.9,
  });
  
  console.log('存储的记忆ID:', memoryId1, memoryId2);
  console.log('长期记忆数量:', memory.getLongTerm().size());
  
  // 搜索记忆
  const searchResults = memory.getLongTerm().search('文件');
  console.log('\n搜索结果:');
  searchResults.forEach(result => {
    console.log(`  内容: ${result.content}`);
    console.log(`  重要性: ${result.importance}`);
  });
  
  // 测试记忆更新
  console.log('\n=== 测试记忆更新 ===');
  const updated = memory.getLongTerm().update(memoryId1, {
    importance: 0.95,
  });
  console.log('更新成功:', updated);
  
  const retrieved = memory.getLongTerm().retrieve(memoryId1);
  console.log('更新后的重要性:', retrieved?.importance);
  
  // 测试记忆删除
  console.log('\n=== 测试记忆删除 ===');
  const deleted = memory.getLongTerm().delete(memoryId2);
  console.log('删除成功:', deleted);
  console.log('删除后数量:', memory.getLongTerm().size());
  
  // 测试记忆清除
  console.log('\n=== 测试记忆清除 ===');
  memory.clear();
  console.log('短期记忆大小:', memory.getShortTerm().getStats().shortTermSize);
  console.log('长期记忆大小:', memory.getLongTerm().size());
  
  console.log('\n' + '='.repeat(50));
  console.log('记忆系统测试完成！');
}

testMemory().catch(console.error);