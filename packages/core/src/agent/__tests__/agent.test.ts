import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentConfigV2,
  AgentToolConfig,
  mergeAgentConfigs,
  normalizeToolConfig,
  normalizeSkillConfig
} from '../interface';
import { AgentRegistryImpl, createAgentRegistry } from '../registry';
import { PermissionMode } from '../../permission';

describe('Agent Interface', () => {
  describe('normalizeToolConfig', () => {
    it('should convert string array to AgentToolConfig', () => {
      const tools = ['read', 'write', 'edit'];
      const result = normalizeToolConfig(tools);
      
      expect(result).toEqual({
        allowed: ['read', 'write', 'edit']
      });
    });

    it('should return AgentToolConfig as-is', () => {
      const config: AgentToolConfig = {
        allowed: ['read', 'write'],
        denied: ['bash'],
        groups: ['filesystem']
      };
      
      const result = normalizeToolConfig(config);
      
      expect(result).toEqual(config);
    });
  });

  describe('normalizeSkillConfig', () => {
    it('should convert autoInitialize true to allowed array', () => {
      const skills = {
        allowed: ['code_analysis', 'data_analysis'],
        autoInitialize: true
      };
      
      const result = normalizeSkillConfig(skills);
      
      expect(result?.autoInitialize).toEqual(['code_analysis', 'data_analysis']);
    });

    it('should keep autoInitialize array as-is', () => {
      const skills = {
        allowed: ['code_analysis'],
        autoInitialize: ['code_analysis']
      };
      
      const result = normalizeSkillConfig(skills);
      
      expect(result?.autoInitialize).toEqual(['code_analysis']);
    });
  });

  describe('mergeAgentConfigs', () => {
    const parent: AgentConfigV2 = {
      name: 'parent',
      description: 'Parent agent',
      systemPrompt: 'Parent prompt',
      tools: { allowed: ['read', 'write'], groups: ['filesystem'] },
      model: { name: 'gpt-4', temperature: 0.7 }
    };

    const child: AgentConfigV2 = {
      name: 'child',
      description: 'Child agent',
      systemPrompt: 'Child prompt',
      tools: { allowed: ['bash'], denied: ['write'] },
      model: { name: 'gpt-3.5', temperature: 0.5 }
    };

    it('should merge parent and child configs', () => {
      const result = mergeAgentConfigs(parent, child);
      
      expect(result.name).toBe('child');
      expect(result.description).toBe('Child agent');
      expect(result.systemPrompt).toBe('Child prompt');
      expect(result.model.name).toBe('gpt-3.5');
      expect(result.model.temperature).toBe(0.5);
    });

    it('should merge tool configs correctly', () => {
      const result = mergeAgentConfigs(parent, child);
      const tools = normalizeToolConfig(result.tools);
      
      expect(tools.allowed).toContain('read');
      expect(tools.allowed).toContain('write');
      expect(tools.allowed).toContain('bash');
      expect(tools.denied).toContain('write');
      expect(tools.groups).toContain('filesystem');
    });

    it('should merge metadata', () => {
      const parentWithMeta: AgentConfigV2 = {
        ...parent,
        metadata: {
          icon: '🔧',
          tags: ['code'],
          version: '1.0.0'
        }
      };
      
      const childWithMeta: AgentConfigV2 = {
        ...child,
        metadata: {
          icon: '🔨',
          tags: ['build']
        }
      };
      
      const result = mergeAgentConfigs(parentWithMeta, childWithMeta);
      
      expect(result.metadata?.icon).toBe('🔨');
      expect(result.metadata?.tags).toContain('code');
      expect(result.metadata?.tags).toContain('build');
      expect(result.metadata?.version).toBe('1.0.0');
    });

    it('should merge permissions', () => {
      const parentWithPerms: AgentConfigV2 = {
        ...parent,
        permissions: {
          inherit: true,
          tools: { read: PermissionMode.ALLOW, write: PermissionMode.ASK }
        }
      };
      
      const childWithPerms: AgentConfigV2 = {
        ...child,
        permissions: {
          inherit: true,
          tools: { bash: PermissionMode.DENY }
        }
      };
      
      const result = mergeAgentConfigs(parentWithPerms, childWithPerms);
      
      expect(result.permissions?.tools?.read).toBe(PermissionMode.ALLOW);
      expect(result.permissions?.tools?.write).toBe(PermissionMode.ASK);
      expect(result.permissions?.tools?.bash).toBe(PermissionMode.DENY);
    });
  });
});

describe('AgentRegistry', () => {
  let registry: AgentRegistryImpl;

  const mockAgentConfig: AgentConfigV2 = {
    name: 'test-agent',
    displayName: 'Test Agent',
    description: 'A test agent for unit tests',
    systemPrompt: 'You are a test agent.',
    tools: { allowed: ['read', 'write'] },
    model: { name: 'gpt-4', temperature: 0.7 },
    metadata: {
      icon: '🧪',
      tags: ['test', 'unit']
    },
    triggers: {
      keywords: ['test', 'unit']
    }
  };

  beforeEach(() => {
    registry = createAgentRegistry();
  });

  describe('register', () => {
    it('should register an agent successfully', () => {
      registry.register(mockAgentConfig);
      
      const agent = registry.get('test-agent');
      
      expect(agent).toBeDefined();
      expect(agent?.config.name).toBe('test-agent');
      expect(agent?.config.displayName).toBe('Test Agent');
      expect(agent?.status).toBe('idle');
    });

    it('should throw error for invalid config', () => {
      const invalidConfig = {
        name: '',
        description: '',
        systemPrompt: '',
        tools: { allowed: [] },
        model: { name: '' }
      } as AgentConfigV2;
      
      expect(() => registry.register(invalidConfig)).toThrow();
    });

    it('should apply defaults to config', () => {
      registry.register(mockAgentConfig);
      
      const config = registry.getConfig('test-agent');
      
      expect(config?.enabled).toBe(true);
      expect(config?.runtime?.maxSteps).toBe(50);
      expect(config?.runtime?.timeout).toBe(300000);
    });
  });

  describe('unregister', () => {
    it('should unregister an agent', () => {
      registry.register(mockAgentConfig);
      
      const result = registry.unregister('test-agent');
      
      expect(result).toBe(true);
      expect(registry.get('test-agent')).toBeUndefined();
    });

    it('should return false for non-existent agent', () => {
      const result = registry.unregister('non-existent');
      
      expect(result).toBe(false);
    });
  });

  describe('list and search', () => {
    beforeEach(() => {
      registry.register({
        ...mockAgentConfig,
        name: 'agent-1',
        metadata: { tags: ['code', 'build'] }
      });
      registry.register({
        ...mockAgentConfig,
        name: 'agent-2',
        metadata: { tags: ['test', 'unit'] }
      });
      registry.register({
        ...mockAgentConfig,
        name: 'agent-3',
        enabled: false
      });
    });

    it('should list all agents', () => {
      const agents = registry.list();
      
      expect(agents).toHaveLength(3);
    });

    it('should list only enabled agents', () => {
      const agents = registry.listEnabled();
      
      expect(agents).toHaveLength(2);
      expect(agents.find(a => a.config.name === 'agent-3')).toBeUndefined();
    });

    it('should list agents by tag', () => {
      const agents = registry.listByTag('code');
      
      expect(agents).toHaveLength(1);
      expect(agents[0].config.name).toBe('agent-1');
    });

    it('should search agents', () => {
      const agents = registry.search('test');
      
      expect(agents.length).toBeGreaterThan(0);
    });
  });

  describe('selectBest', () => {
    beforeEach(() => {
      registry.register({
        ...mockAgentConfig,
        name: 'build-agent',
        triggers: {
          keywords: ['build', 'create', 'implement']
        }
      });
      registry.register({
        ...mockAgentConfig,
        name: 'test-agent',
        triggers: {
          keywords: ['test', 'verify']
        }
      });
    });

    it('should select agent based on keywords', () => {
      const agent = registry.selectBest('please build a new feature');
      
      expect(agent?.config.name).toBe('build-agent');
    });

    it('should return default agent when no match', () => {
      const agent = registry.selectBest('random input');
      
      expect(agent).toBeDefined();
    });
  });

  describe('enable/disable', () => {
    beforeEach(() => {
      registry.register(mockAgentConfig);
    });

    it('should disable an agent', () => {
      registry.disable('test-agent');
      
      const agent = registry.get('test-agent');
      expect(agent?.status).toBe('disabled');
      expect(agent?.config.enabled).toBe(false);
    });

    it('should enable a disabled agent', () => {
      registry.disable('test-agent');
      registry.enable('test-agent');
      
      const agent = registry.get('test-agent');
      expect(agent?.status).toBe('idle');
      expect(agent?.config.enabled).toBe(true);
    });
  });

  describe('inheritance', () => {
    it('should resolve template inheritance', () => {
      const registryWithTemplates = createAgentRegistry({
        templates: {
          base: {
            name: 'base',
            config: {
              systemPrompt: 'Base prompt',
              model: { name: 'gpt-4', temperature: 0.7 },
              tools: { allowed: ['read'] }
            }
          }
        },
        definitions: {
          child: {
            name: 'child',
            description: 'Child agent',
            extends: 'base',
            systemPrompt: 'Child prompt',
            tools: { allowed: ['read'] },
            model: { name: 'gpt-3.5' }
          }
        }
      });
      
      const config = registryWithTemplates.getConfig('child');
      
      expect(config?.systemPrompt).toBe('Child prompt');
      expect(config?.model.name).toBe('gpt-3.5');
      expect(config?.model.temperature).toBe(0.7);
    });
  });

  describe('getAvailableTools', () => {
    it('should return available tools for agent', () => {
      registry.register({
        ...mockAgentConfig,
        tools: {
          allowed: ['read', 'write', 'edit'],
          denied: ['edit']
        }
      });
      
      const tools = registry.getAvailableTools('test-agent');
      
      expect(tools).toContain('read');
      expect(tools).toContain('write');
      expect(tools).not.toContain('edit');
    });
  });
});
