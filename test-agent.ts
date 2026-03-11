// test-agent.ts
import { OODALoop } from './packages/core/src/index.js';

async function testAgent() {
  console.log('测试 OODA Agent...');
  
  const oodaLoop = new OODALoop();
  
  // 测试文件读取意图
  const result1 = await oodaLoop.execute('读取文件：test.txt');
  console.log('测试1结果:', result1.output);
  
  // 测试搜索意图
  const result2 = await oodaLoop.execute('搜索：AI Agent 技术');
  console.log('测试2结果:', result2.output);
  
  // 测试执行意图
  const result3 = await oodaLoop.execute('运行命令：ls -la');
  console.log('测试3结果:', result3.output);
  
  console.log('测试完成！');
}

testAgent().catch(console.error);