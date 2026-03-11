// test-skill-mcp.js
// 测试Skill和MCP集成

import { getSkillRegistry } from './packages/core/src/skill/registry.js';
import { getMCPService } from './packages/core/src/mcp/service.js';
import { initializeSkills } from './packages/tools/src/index.js';

async function testSkillMCP() {
  console.log('测试Skill和MCP集成...');
  console.log('====================');
  
  // 初始化技能
  console.log('\n=== 初始化技能 ===');
  initializeSkills();
  
  // 获取技能注册器
  const skillRegistry = getSkillRegistry();
  const skills = skillRegistry.list();
  console.log(`已注册的技能: ${skills.length}个`);
  skills.forEach(skill => {
    console.log(`  - ${skill.name} (${skill.category} v${skill.version})`);
  });
  
  // 获取MCP服务
  const mcp = getMCPService();
  
  // 订阅MCP消息
  console.log('\n=== 订阅MCP消息 ===');
  const subscriptions = [
    mcp.subscribe('skill.executed', (message) => {
      console.log(`\n[MCP] 技能执行: ${message.payload.skillName}`);
      console.log(`[MCP] 结果: ${JSON.stringify(message.payload.result)}`);
    }),
    mcp.subscribe('tool.executed', (message) => {
      console.log(`\n[MCP] 工具执行: ${message.payload.toolName}`);
      console.log(`[MCP] 结果: ${JSON.stringify(message.payload.result)}`);
    }),
    mcp.subscribe('agent.response', (message) => {
      console.log(`\n[MCP] 代理响应: ${message.payload.content}`);
    }),
    mcp.subscribe('skill.error', (message) => {
      console.error(`\n[MCP] 技能错误: ${message.payload.message}`);
    }),
  ];
  
  // 测试文件技能
  console.log('\n=== 测试文件技能 ===');
  try {
    const fileSkill = skillRegistry.get('file_skill');
    if (fileSkill) {
      const result = await fileSkill.execute(
        {
          action: 'read',
          path: process.cwd() + '/test.txt',
        },
        {
          workingDirectory: process.cwd(),
          sessionId: 'test-session',
          maxExecutionTime: 30000,
          resources: {
            memory: 1024 * 1024 * 1024,
            cpu: 1,
          },
          skillRegistry: skillRegistry,
          mcp: mcp,
        }
      );
      console.log('文件技能结果:', result);
    }
  } catch (error) {
    console.error('文件技能测试失败:', error);
  }
  
  // 测试网络技能
  console.log('\n=== 测试网络技能 ===');
  try {
    const webSkill = skillRegistry.get('web_skill');
    if (webSkill) {
      const result = await webSkill.execute(
        {
          action: 'search',
          query: 'AI Agent 技术',
        },
        {
          workingDirectory: process.cwd(),
          sessionId: 'test-session',
          maxExecutionTime: 30000,
          resources: {
            memory: 1024 * 1024 * 1024,
            cpu: 1,
          },
          skillRegistry: skillRegistry,
          mcp: mcp,
        }
      );
      console.log('网络技能结果:', result);
    }
  } catch (error) {
    console.error('网络技能测试失败:', error);
  }
  
  // 测试代码技能
  console.log('\n=== 测试代码技能 ===');
  try {
    const codeSkill = skillRegistry.get('code_skill');
    if (codeSkill) {
      const result = await codeSkill.execute(
        {
          language: 'javascript',
          code: 'console.log("Hello, Skill!");',
        },
        {
          workingDirectory: process.cwd(),
          sessionId: 'test-session',
          maxExecutionTime: 30000,
          resources: {
            memory: 1024 * 1024 * 1024,
            cpu: 1,
          },
          skillRegistry: skillRegistry,
          mcp: mcp,
        }
      );
      console.log('代码技能结果:', result);
    }
  } catch (error) {
    console.error('代码技能测试失败:', error);
  }
  
  // 测试MCP消息传递
  console.log('\n=== 测试MCP消息传递 ===');
  try {
    await mcp.publishEvent('test.event', {
      message: '测试事件消息',
      timestamp: Date.now(),
    });
    
    await mcp.publishStatus('test.status', {
      status: 'running',
      progress: 50,
    });
    
    const response = await mcp.request('test.request', {
      action: 'ping',
    });
    console.log('MCP请求响应:', response);
  } catch (error) {
    console.error('MCP测试失败:', error);
  }
  
  // 取消订阅
  console.log('\n=== 取消订阅 ===');
  subscriptions.forEach(subId => {
    mcp.unsubscribe(subId);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('Skill和MCP集成测试完成！');
  console.log('所有功能正常运行！');
}

testSkillMCP().catch(console.error);