import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ToolRegistryImpl,
  createToolRegistry,
  PermissionDeniedError
} from '../registry';
import { UnifiedTool, toolNameMatches, getToolRiskLevel } from '../interface';
import { PermissionMode, PermissionManagerImpl } from '../../permission';
import { z } from 'zod';

const createMockTool = (name: string, category: string = 'test'): UnifiedTool => ({
  name,
  description: `Mock tool: ${name}`,
  type: 'tool',
  category,
  schema: z.object({ input: z.string() }),
  requiredPermissions: [],
  execute: vi.fn().mockResolvedValue({ result: 'success' })
});

const createMockSkill = (name: string): UnifiedTool => ({
  name,
  description: `Mock skill: ${name}`,
  type: 'skill',
  category: 'skill',
  schema: z.object({ input: z.string() }),
  requiredPermissions: [],
  execute: vi.fn().mockResolvedValue({ result: 'skill success' }),
  initialize: vi.fn().mockResolvedValue(undefined),
  shutdown: vi.fn().mockResolvedValue(undefined)
});

describe('ToolRegistry', () => {
  let registry: ToolRegistryImpl;

  beforeEach(() => {
    registry = createToolRegistry();
  });

  describe('registerTool', () => {
    it('should register a tool successfully', () => {
      const tool = createMockTool('test-tool');
      registry.registerTool(tool);
      
      expect(registry.has('test-tool')).toBe(true);
      expect(registry.get('test-tool')).toEqual(tool);
    });

    it('should throw error for invalid tool', () => {
      const invalidTool = {
        name: '',
        description: '',
        type: 'tool' as const,
        category: 'test',
        schema: z.object({}),
        requiredPermissions: [],
        execute: vi.fn()
      } as UnifiedTool;
      
      expect(() => registry.registerTool(invalidTool)).toThrow();
    });

    it('should warn when re-registering a tool', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      registry.registerTool(createMockTool('duplicate'));
      registry.registerTool(createMockTool('duplicate'));
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('duplicate')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('registerSkill', () => {
    it('should register a skill with type skill', () => {
      const skill = createMockSkill('test-skill');
      registry.registerSkill(skill);
      
      const registered = registry.get('test-skill');
      expect(registered?.type).toBe('skill');
    });
  });

  describe('registerMCPTool', () => {
    it('should register MCP tool with server prefix', () => {
      const tool = createMockTool('mcp-tool');
      registry.registerMCPTool(tool, 'filesystem');
      
      expect(registry.has('filesystem:mcp-tool')).toBe(true);
    });
  });

  describe('registerGroup', () => {
    it('should register a tool group', () => {
      registry.registerTool(createMockTool('read'));
      registry.registerTool(createMockTool('write'));
      
      registry.registerGroup({
        name: 'filesystem',
        displayName: 'Filesystem',
        tools: ['read', 'write']
      });
      
      const groups = registry.listGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('filesystem');
    });
  });

  describe('getByType', () => {
    it('should return tools by type', () => {
      registry.registerTool(createMockTool('tool1'));
      registry.registerSkill(createMockSkill('skill1'));
      
      const tools = registry.getByType('tool');
      const skills = registry.getByType('skill');
      
      expect(tools).toHaveLength(1);
      expect(skills).toHaveLength(1);
    });
  });

  describe('getByCategory', () => {
    it('should return tools by category', () => {
      registry.registerTool(createMockTool('tool1', 'filesystem'));
      registry.registerTool(createMockTool('tool2', 'filesystem'));
      registry.registerTool(createMockTool('tool3', 'network'));
      
      const fsTools = registry.getByCategory('filesystem');
      
      expect(fsTools).toHaveLength(2);
    });
  });

  describe('getByGroup', () => {
    it('should return tools in a group', () => {
      registry.registerTool(createMockTool('read'));
      registry.registerTool(createMockTool('write'));
      registry.registerTool(createMockTool('bash'));
      
      registry.registerGroup({
        name: 'filesystem',
        displayName: 'Filesystem',
        tools: ['read', 'write']
      });
      
      const groupTools = registry.getByGroup('filesystem');
      
      expect(groupTools).toHaveLength(2);
      expect(groupTools.map(t => t.name)).toContain('read');
      expect(groupTools.map(t => t.name)).toContain('write');
    });

    it('should return empty array for non-existent group', () => {
      const tools = registry.getByGroup('non-existent');
      expect(tools).toHaveLength(0);
    });
  });

  describe('list and listNames', () => {
    it('should list all tools', () => {
      registry.registerTool(createMockTool('tool1'));
      registry.registerTool(createMockTool('tool2'));
      
      expect(registry.list()).toHaveLength(2);
      expect(registry.listNames()).toEqual(['tool1', 'tool2']);
    });
  });

  describe('isAllowed', () => {
    beforeEach(() => {
      registry.registerTool(createMockTool('read'));
      registry.registerTool(createMockTool('write'));
    });

    it('should return true for allowed tool', () => {
      expect(registry.isAllowed('read', ['read', 'write'])).toBe(true);
    });

    it('should return false for non-allowed tool', () => {
      expect(registry.isAllowed('bash', ['read', 'write'])).toBe(false);
    });

    it('should match wildcard patterns', () => {
      expect(registry.isAllowed('read', ['*'])).toBe(true);
      expect(registry.isAllowed('write', ['read*'])).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute tool successfully', async () => {
      const tool = createMockTool('test-tool');
      registry.registerTool(tool);
      
      const context = {
        workingDirectory: '/test',
        sessionId: 'test-session',
        maxExecutionTime: 30000,
        resources: { memory: 1024, cpu: 50 }
      };
      
      const result = await registry.execute('test-tool', { input: 'test' }, context);
      
      expect(result).toEqual({ result: 'success' });
      expect(tool.execute).toHaveBeenCalled();
    });

    it('should throw error for non-existent tool', async () => {
      await expect(
        registry.execute('non-existent', {}, {} as any)
      ).rejects.toThrow('not found');
    });

    it('should validate input with schema', async () => {
      const tool: UnifiedTool = {
        name: 'strict-tool',
        description: 'Strict tool',
        type: 'tool',
        category: 'test',
        schema: z.object({ value: z.number() }),
        requiredPermissions: [],
        execute: vi.fn().mockResolvedValue({ ok: true })
      };
      
      registry.registerTool(tool);
      
      await expect(
        registry.execute('strict-tool', { value: 'not a number' }, {} as any)
      ).rejects.toThrow();
    });

    it('should check permission when permission manager is set', async () => {
      const tool = createMockTool('protected-tool');
      tool.requiredPermissions = [{ type: 'file_write', pattern: '*' }];
      
      registry.registerTool(tool);
      
      const permManager = new PermissionManagerImpl({
        global: {
          defaultMode: PermissionMode.DENY,
          tools: { 'protected-tool': PermissionMode.DENY },
          skills: {}
        },
        agents: {},
        groups: {}
      });
      
      registry.setPermissionManager(permManager);
      
      await expect(
        registry.execute('protected-tool', { input: 'test' }, {
          agentName: 'test-agent'
        } as any)
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('initializeAll and shutdownAll', () => {
    it('should initialize all tools with initialize method', async () => {
      const skill1 = createMockSkill('skill1');
      const skill2 = createMockSkill('skill2');
      
      registry.registerSkill(skill1);
      registry.registerSkill(skill2);
      
      await registry.initializeAll();
      
      expect(skill1.initialize).toHaveBeenCalled();
      expect(skill2.initialize).toHaveBeenCalled();
    });

    it('should shutdown all tools with shutdown method', async () => {
      const skill1 = createMockSkill('skill1');
      
      registry.registerSkill(skill1);
      
      await registry.shutdownAll();
      
      expect(skill1.shutdown).toHaveBeenCalled();
    });
  });

  describe('resolveToolReferences', () => {
    it('should resolve group references', () => {
      registry.registerTool(createMockTool('read'));
      registry.registerTool(createMockTool('write'));
      
      registry.registerGroup({
        name: 'filesystem',
        displayName: 'Filesystem',
        tools: ['read', 'write']
      });
      
      const resolved = registry.resolveToolReferences(['@filesystem', 'bash']);
      
      expect(resolved).toContain('read');
      expect(resolved).toContain('write');
      expect(resolved).toContain('bash');
    });
  });
});

describe('toolNameMatches', () => {
  it('should match exact name', () => {
    expect(toolNameMatches('read', 'read')).toBe(true);
    expect(toolNameMatches('read', 'write')).toBe(false);
  });

  it('should match wildcard', () => {
    expect(toolNameMatches('read', '*')).toBe(true);
    expect(toolNameMatches('anything', '*')).toBe(true);
  });

  it('should match prefix wildcard', () => {
    expect(toolNameMatches('read_file', 'read*')).toBe(true);
    expect(toolNameMatches('write_file', 'read*')).toBe(false);
  });

  it('should match suffix wildcard', () => {
    expect(toolNameMatches('file_read', '*_read')).toBe(true);
    expect(toolNameMatches('file_write', '*_read')).toBe(false);
  });

  it('should match middle wildcard', () => {
    expect(toolNameMatches('bash:rm', 'bash:*')).toBe(true);
    expect(toolNameMatches('npm:install', 'bash:*')).toBe(false);
  });
});

describe('getToolRiskLevel', () => {
  it('should return explicit risk level', () => {
    const tool: UnifiedTool = {
      name: 'test',
      description: 'Test',
      type: 'tool',
      category: 'test',
      schema: z.object({}),
      requiredPermissions: [],
      riskLevel: 'critical',
      execute: vi.fn()
    };
    
    expect(getToolRiskLevel(tool)).toBe('critical');
  });

  it('should return high for high-risk categories', () => {
    const tool: UnifiedTool = {
      name: 'test',
      description: 'Test',
      type: 'tool',
      category: 'execution',
      schema: z.object({}),
      requiredPermissions: [],
      execute: vi.fn()
    };
    
    expect(getToolRiskLevel(tool)).toBe('high');
  });

  it('should return high for critical permissions', () => {
    const tool: UnifiedTool = {
      name: 'test',
      description: 'Test',
      type: 'tool',
      category: 'test',
      schema: z.object({}),
      requiredPermissions: [{ type: 'exec', pattern: '*' }],
      execute: vi.fn()
    };
    
    expect(getToolRiskLevel(tool)).toBe('high');
  });

  it('should return medium for tools with permissions', () => {
    const tool: UnifiedTool = {
      name: 'test',
      description: 'Test',
      type: 'tool',
      category: 'test',
      schema: z.object({}),
      requiredPermissions: [{ type: 'file_read', pattern: '*' }],
      execute: vi.fn()
    };
    
    expect(getToolRiskLevel(tool)).toBe('medium');
  });

  it('should return low for tools without permissions', () => {
    const tool: UnifiedTool = {
      name: 'test',
      description: 'Test',
      type: 'tool',
      category: 'safe',
      schema: z.object({}),
      requiredPermissions: [],
      execute: vi.fn()
    };
    
    expect(getToolRiskLevel(tool)).toBe('low');
  });
});
