import {
  AgentConfigV2,
  AgentsConfig,
  AgentInstance,
  AgentRegistry,
  mergeAgentConfigs,
  normalizeToolConfig,
  normalizeSkillConfig,
  DEFAULT_AGENT_CONFIG
} from './interface';
import { ToolRegistry } from '../tool/interface';
import { PermissionManager } from '../permission';

export class AgentRegistryImpl implements AgentRegistry {
  private agents: Map<string, AgentInstance> = new Map();
  private templates: Map<string, Partial<AgentConfigV2>> = new Map();
  private defaultAgentName: string;
  private toolRegistry: ToolRegistry | null = null;
  private permissionManager: PermissionManager | null = null;

  constructor(
    config?: AgentsConfig,
    toolRegistry?: ToolRegistry,
    permissionManager?: PermissionManager
  ) {
    this.defaultAgentName = config?.default || 'build';
    this.toolRegistry = toolRegistry || null;
    this.permissionManager = permissionManager || null;

    if (config?.templates) {
      for (const [name, template] of Object.entries(config.templates)) {
        this.templates.set(name, template.config);
      }
    }

    if (config?.definitions) {
      for (const [name, agentConfig] of Object.entries(config.definitions)) {
        this.register(agentConfig);
      }
    }
  }

  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  setPermissionManager(manager: PermissionManager): void {
    this.permissionManager = manager;
  }

  register(config: AgentConfigV2): void {
    const resolvedConfig = this.resolveInheritance(config);
    const validatedConfig = this.applyDefaults(resolvedConfig);
    this.validateConfig(validatedConfig);

    const instance: AgentInstance = {
      config: validatedConfig,
      status: validatedConfig.enabled !== false ? 'idle' : 'disabled',
      usageCount: 0
    };

    this.agents.set(config.name, instance);
  }

  unregister(name: string): boolean {
    return this.agents.delete(name);
  }

  get(name: string): AgentInstance | undefined {
    return this.agents.get(name);
  }

  getConfig(name: string): AgentConfigV2 | undefined {
    return this.agents.get(name)?.config;
  }

  list(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  listEnabled(): AgentInstance[] {
    return this.list().filter(
      instance => instance.status !== 'disabled' && instance.config.enabled !== false
    );
  }

  listByTag(tag: string): AgentInstance[] {
    return this.list().filter(
      instance => instance.config.metadata?.tags?.includes(tag)
    );
  }

  search(query: string): AgentInstance[] {
    const lowerQuery = query.toLowerCase();
    return this.listEnabled().filter(instance => {
      const config = instance.config;
      return (
        config.name.toLowerCase().includes(lowerQuery) ||
        config.displayName?.toLowerCase().includes(lowerQuery) ||
        config.description.toLowerCase().includes(lowerQuery) ||
        config.metadata?.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
      );
    });
  }

  findByKeyword(keyword: string): AgentInstance[] {
    const lowerKeyword = keyword.toLowerCase();
    return this.listEnabled().filter(instance => {
      const triggers = instance.config.triggers;
      if (!triggers) return false;

      return triggers.keywords?.some(k => k.toLowerCase() === lowerKeyword);
    });
  }

  selectBest(input: string): AgentInstance | undefined {
    const enabledAgents = this.listEnabled();
    if (enabledAgents.length === 0) {
      return undefined;
    }

    const scores = enabledAgents.map(instance => ({
      instance,
      score: this.calculateMatchScore(instance.config, input)
    }));

    scores.sort((a, b) => b.score - a.score);

    if (scores[0].score > 0) {
      return scores[0].instance;
    }

    return this.getDefault();
  }

  async activate(name: string): Promise<void> {
    const instance = this.get(name);
    if (!instance) {
      throw new Error(`Agent '${name}' not found`);
    }

    if (instance.status === 'disabled') {
      throw new Error(`Agent '${name}' is disabled`);
    }

    if (instance.config.skills?.autoInitialize && this.toolRegistry) {
      const skillsToInit = Array.isArray(instance.config.skills.autoInitialize)
        ? instance.config.skills.autoInitialize
        : instance.config.skills.allowed;

      for (const skillName of skillsToInit) {
        const skill = this.toolRegistry.get(skillName);
        if (skill?.initialize) {
          await skill.initialize();
        }
      }
    }

    instance.status = 'running';
    instance.lastUsed = Date.now();
    instance.usageCount++;
  }

  async deactivate(name: string): Promise<void> {
    const instance = this.get(name);
    if (!instance) return;

    instance.status = 'idle';
  }

  updateConfig(name: string, config: Partial<AgentConfigV2>): void {
    const instance = this.get(name);
    if (!instance) {
      throw new Error(`Agent '${name}' not found`);
    }

    instance.config = {
      ...instance.config,
      ...config
    };

    if (config.enabled === false) {
      instance.status = 'disabled';
    } else if (config.enabled === true && instance.status === 'disabled') {
      instance.status = 'idle';
    }
  }

  enable(name: string): void {
    this.updateConfig(name, { enabled: true });
  }

  disable(name: string): void {
    this.updateConfig(name, { enabled: false });
  }

  getDefault(): AgentInstance {
    const defaultInstance = this.agents.get(this.defaultAgentName);
    if (defaultInstance) {
      return defaultInstance;
    }

    const firstEnabled = this.listEnabled()[0];
    if (firstEnabled) {
      return firstEnabled;
    }

    throw new Error('No enabled agents available');
  }

  setDefault(name: string): void {
    if (!this.agents.has(name)) {
      throw new Error(`Agent '${name}' not found`);
    }
    this.defaultAgentName = name;
  }

  getAvailableTools(agentName: string): string[] {
    const config = this.getConfig(agentName);
    if (!config) return [];

    const toolConfig = normalizeToolConfig(config.tools);
    const allowedTools = [...toolConfig.allowed];

    if (toolConfig.groups && this.toolRegistry) {
      for (const groupName of toolConfig.groups) {
        const groupTools = this.toolRegistry.getByGroup(groupName);
        allowedTools.push(...groupTools.map(t => t.name));
      }
    }

    if (toolConfig.denied) {
      return allowedTools.filter(t => !toolConfig.denied!.includes(t));
    }

    return [...new Set(allowedTools)];
  }

  getAvailableSkills(agentName: string): string[] {
    const config = this.getConfig(agentName);
    if (!config?.skills) return [];

    const skillConfig = normalizeSkillConfig(config.skills);
    if (!skillConfig) return [];

    const allowedSkills = [...skillConfig.allowed];

    if (skillConfig.denied) {
      return allowedSkills.filter(s => !skillConfig.denied!.includes(s));
    }

    return [...new Set(allowedSkills)];
  }

  private resolveInheritance(config: AgentConfigV2): AgentConfigV2 {
    if (!config.extends) {
      return config;
    }

    let parentConfig: Partial<AgentConfigV2> | undefined;

    const templateParent = this.templates.get(config.extends);
    if (templateParent) {
      parentConfig = templateParent;
    } else {
      const agentParent = this.agents.get(config.extends);
      if (agentParent) {
        parentConfig = agentParent.config;
      }
    }

    if (!parentConfig) {
      console.warn(
        `Parent '${config.extends}' not found for agent '${config.name}'`
      );
      return config;
    }

    const resolvedParent = this.resolveInheritance(parentConfig as AgentConfigV2);
    return mergeAgentConfigs(resolvedParent, config);
  }

  private applyDefaults(config: AgentConfigV2): AgentConfigV2 {
    return {
      ...DEFAULT_AGENT_CONFIG,
      ...config,
      metadata: {
        ...DEFAULT_AGENT_CONFIG.metadata,
        ...config.metadata
      },
      runtime: {
        ...DEFAULT_AGENT_CONFIG.runtime,
        ...config.runtime
      }
    } as AgentConfigV2;
  }

  private validateConfig(config: AgentConfigV2): void {
    if (!config.name || typeof config.name !== 'string') {
      throw new Error('Agent must have a valid name');
    }

    if (!config.description || typeof config.description !== 'string') {
      throw new Error(`Agent '${config.name}' must have a valid description`);
    }

    if (!config.systemPrompt && !config.systemPromptFile) {
      throw new Error(
        `Agent '${config.name}' must have a systemPrompt or systemPromptFile`
      );
    }

    if (!config.model || !config.model.name) {
      throw new Error(`Agent '${config.name}' must have a valid model config`);
    }

    const toolConfig = normalizeToolConfig(config.tools);
    if (!toolConfig.allowed || toolConfig.allowed.length === 0) {
      console.warn(`Agent '${config.name}' has no tools configured`);
    }
  }

  private calculateMatchScore(config: AgentConfigV2, input: string): number {
    let score = 0;
    const lowerInput = input.toLowerCase();

    if (config.triggers?.keywords) {
      for (const keyword of config.triggers.keywords) {
        if (lowerInput.includes(keyword.toLowerCase())) {
          score += 10;
        }
      }
    }

    if (config.triggers?.patterns) {
      for (const pattern of config.triggers.patterns) {
        try {
          if (new RegExp(pattern, 'i').test(input)) {
            score += 15;
          }
        } catch {
          console.warn(`Invalid pattern '${pattern}' for agent '${config.name}'`);
        }
      }
    }

    if (config.metadata?.tags) {
      for (const tag of config.metadata.tags) {
        if (lowerInput.includes(tag.toLowerCase())) {
          score += 5;
        }
      }
    }

    if (config.displayName && lowerInput.includes(config.displayName.toLowerCase())) {
      score += 8;
    }

    if (config.description && lowerInput.includes(config.description.toLowerCase().split(' ')[0])) {
      score += 3;
    }

    return score;
  }
}

let agentRegistry: AgentRegistryImpl | null = null;

export function getAgentRegistry(): AgentRegistry {
  if (!agentRegistry) {
    agentRegistry = new AgentRegistryImpl();
  }
  return agentRegistry;
}

export function initializeAgentRegistry(config: AgentsConfig): AgentRegistry {
  agentRegistry = new AgentRegistryImpl(config);
  return agentRegistry;
}

export function createAgentRegistry(config?: AgentsConfig): AgentRegistryImpl {
  return new AgentRegistryImpl(config);
}
