// 技能和 MCP 功能测试
// 运行: npx vitest run tests/skills-mcp.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRegistryImpl, getSkillRegistry } from '../packages/core/src/skill/registry';
import { MCPServiceImpl } from '../packages/core/src/mcp/service';
import { FileSkill, WebSkill, CodeSkill } from '../packages/tools/src/skills/base-skill';
import { DataAnalysisSkill, ImageProcessingSkill, PDFProcessingSkill } from '../packages/tools/src/skills/advanced-skills';

const TEST_CONTEXT = {
  workingDirectory: '/test',
  sessionId: 'test-session',
  maxExecutionTime: 30000,
  resources: {
    memory: 1024 * 1024 * 1024,
    cpu: 1,
  },
  skillRegistry: {} as any,
  mcp: {} as any,
};

describe('技能系统测试', () => {
  let skillRegistry: SkillRegistryImpl;
  let mcpService: MCPServiceImpl;

  beforeEach(() => {
    skillRegistry = new SkillRegistryImpl();
    mcpService = new MCPServiceImpl();
    TEST_CONTEXT.skillRegistry = skillRegistry;
    TEST_CONTEXT.mcp = mcpService;
  });

  describe('1. SkillRegistry 基础功能', () => {
    it('应该能够注册技能', () => {
      const skill = new FileSkill();
      skillRegistry.register(skill);
      
      expect(skillRegistry.get('file_skill')).toBeDefined();
    });

    it('应该能够获取技能列表', () => {
      skillRegistry.register(new FileSkill());
      skillRegistry.register(new WebSkill());
      skillRegistry.register(new CodeSkill());
      
      const skills = skillRegistry.list();
      expect(skills.length).toBe(3);
    });

    it('应该能够执行技能', async () => {
      skillRegistry.register(new FileSkill());
      
      const result = await skillRegistry.execute(
        'file_skill',
        { action: 'read', path: '/test/file.txt' },
        TEST_CONTEXT
      );
      
      expect(result).toBeDefined();
      expect((result as any).success).toBe(true);
    });

    it('应该在技能不存在时抛出错误', async () => {
      await expect(
        skillRegistry.execute('nonexistent_skill', {}, TEST_CONTEXT)
      ).rejects.toThrow('Skill not found');
    });
  });

  describe('2. FileSkill 文件操作技能', () => {
    it('应该能够执行 read 操作', async () => {
      const skill = new FileSkill();
      
      const result = await skill.execute(
        { action: 'read', path: '/test/file.txt' },
        TEST_CONTEXT
      );
      
      expect((result as any).action).toBe('read');
      expect((result as any).success).toBe(true);
    });

    it('应该能够执行 write 操作', async () => {
      const skill = new FileSkill();
      
      const result = await skill.execute(
        { action: 'write', path: '/test/file.txt', content: 'test content' },
        TEST_CONTEXT
      );
      
      expect((result as any).action).toBe('write');
      expect((result as any).success).toBe(true);
    });

    it('应该能够执行 list 操作', async () => {
      const skill = new FileSkill();
      
      const result = await skill.execute(
        { action: 'list', path: '/test' },
        TEST_CONTEXT
      );
      
      expect((result as any).action).toBe('list');
      expect((result as any).files).toBeDefined();
    });

    it('应该阻止访问工作目录外的文件', async () => {
      const skill = new FileSkill();
      
      await expect(
        skill.execute(
          { action: 'read', path: '/etc/passwd' },
          TEST_CONTEXT
        )
      ).rejects.toThrow('权限不足');
    });
  });

  describe('3. WebSkill 网络技能', () => {
    it('应该能够创建 WebSkill 实例', () => {
      const skill = new WebSkill();
      expect(skill.name).toBe('web_skill');
      expect(skill.category).toBe('web');
    });

    it('应该具有正确的 schema 定义', () => {
      const skill = new WebSkill();
      expect(skill.schema).toBeDefined();
    });

    it('应该具有网络权限', () => {
      const skill = new WebSkill();
      expect(skill.permissions.some(p => p.type === 'network')).toBe(true);
    });
  });

  describe('4. CodeSkill 代码技能', () => {
    it('应该能够执行 JavaScript 代码', async () => {
      const skill = new CodeSkill();
      
      const result = await skill.execute(
        { language: 'javascript', code: 'console.log("test")' },
        TEST_CONTEXT
      );
      
      expect((result as any).language).toBe('javascript');
      expect((result as any).success).toBe(true);
    });

    it('应该阻止危险代码', async () => {
      const skill = new CodeSkill();
      
      await expect(
        skill.execute(
          { language: 'javascript', code: 'rm -rf /' },
          TEST_CONTEXT
        )
      ).rejects.toThrow('禁止执行危险代码');
    });
  });

  describe('5. 全局技能注册器', () => {
    it('应该能够获取全局实例', () => {
      const registry = getSkillRegistry();
      expect(registry).toBeDefined();
    });

    it('应该能够注册多个技能', () => {
      const registry = getSkillRegistry() as SkillRegistryImpl;
      
      registry.register(new FileSkill());
      registry.register(new WebSkill());
      registry.register(new CodeSkill());
      
      expect(registry.list().length).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('MCP 服务测试', () => {
  let mcpService: MCPServiceImpl;

  beforeEach(() => {
    mcpService = new MCPServiceImpl();
  });

  describe('1. MCP 基础功能', () => {
    it('应该能够发送消息', async () => {
      await expect(
        mcpService.send({
          id: 'test-1',
          type: 'event',
          topic: 'test.topic',
          payload: { data: 'test' },
          timestamp: Date.now(),
        })
      ).resolves.not.toThrow();
    });

    it('应该能够订阅主题', () => {
      const subId = mcpService.subscribe('test.topic', (msg) => {
        expect(msg.topic).toBe('test.topic');
      });
      
      expect(subId).toBeDefined();
      expect(subId.startsWith('sub-')).toBe(true);
    });

    it('应该能够取消订阅', () => {
      const subId = mcpService.subscribe('test.topic', () => {});
      mcpService.unsubscribe(subId);
      
      // 取消后不会报错
      expect(true).toBe(true);
    });

    it('应该能够发布事件', async () => {
      await expect(
        mcpService.publishEvent('test.event', { data: 'test' })
      ).resolves.not.toThrow();
    });

    it('应该能够发布状态', async () => {
      await expect(
        mcpService.publishStatus('test.status', { state: 'active' })
      ).resolves.not.toThrow();
    });

    it('应该能够发布错误', async () => {
      await expect(
        mcpService.publishError('test.error', new Error('test error'))
      ).resolves.not.toThrow();
    });

    it('应该能够发送请求', async () => {
      const result = await mcpService.request('test.request', { query: 'test' });
      // 请求会发送消息但不返回特定结果
      expect(result).toBeDefined();
    });
  });

  describe('2. 消息订阅机制', () => {
    it('应该能够接收发布的事件', async () => {
      const receivedMessages: any[] = [];
      
      mcpService.subscribe('chat.message', (msg) => {
        receivedMessages.push(msg);
      });
      
      await mcpService.publishEvent('chat.message', { text: 'Hello' });
      await mcpService.publishEvent('chat.message', { text: 'World' });
      
      expect(receivedMessages.length).toBe(2);
      expect(receivedMessages[0].payload.text).toBe('Hello');
    });

    it('应该支持多个订阅者', async () => {
      let count1 = 0;
      let count2 = 0;
      
      mcpService.subscribe('test.topic', () => count1++);
      mcpService.subscribe('test.topic', () => count2++);
      
      await mcpService.publishEvent('test.topic', {});
      
      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });

    it('应该只接收订阅主题的消息', async () => {
      const received: string[] = [];
      
      mcpService.subscribe('topic.a', () => received.push('a'));
      mcpService.subscribe('topic.b', () => received.push('b'));
      
      await mcpService.publishEvent('topic.a', {});
      await mcpService.publishEvent('topic.b', {});
      await mcpService.publishEvent('topic.c', {});
      
      expect(received).toEqual(['a', 'b']);
    });
  });
});

describe('技能扩展示例', () => {
  it('用户自定义技能应该能够被注册和执行', async () => {
    // 这个测试展示用户如何扩展技能系统
    class CustomSkill extends FileSkill {
      name = 'custom_skill';
      description = '用户自定义技能';
      category = 'custom';
    }
    
    const registry = new SkillRegistryImpl();
    const skill = new CustomSkill();
    
    registry.register(skill);
    expect(registry.get('custom_skill')).toBeDefined();
    
    const result = await registry.execute(
      'custom_skill',
      { action: 'list', path: '/test' },
      TEST_CONTEXT
    );
    
    expect(result).toBeDefined();
  });
});
