import { PermissionMode } from '../permission';
import { z } from 'zod';

export interface AgentMetadata {
  icon?: string;
  tags?: string[];
  author?: string;
  version?: string;
  homepage?: string;
  examples?: string[];
}

export interface AgentTrigger {
  keywords?: string[];
  patterns?: string[];
  fileTypes?: string[];
  autoStart?: boolean;
}

export interface PermissionCondition {
  type: 'path' | 'command' | 'resource';
  operator: 'equals' | 'contains' | 'matches' | 'startsWith';
  value: string;
}

export interface PermissionPattern {
  pattern: string;
  mode: PermissionMode;
  conditions?: PermissionCondition[];
}

export interface AgentPermissionConfig {
  inherit?: boolean;
  tools?: Record<string, PermissionMode>;
  skills?: Record<string, PermissionMode>;
  patterns?: PermissionPattern[];
}

export interface AgentToolConfig {
  allowed: string[];
  denied?: string[];
  groups?: string[];
}

export interface AgentSkillConfig {
  allowed: string[];
  denied?: string[];
  autoInitialize?: string[] | boolean;
}

export interface AgentModelConfigV2 {
  name: string;
  provider?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export interface AgentRuntimeConfig {
  maxSteps?: number;
  timeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoff: 'fixed' | 'exponential';
  };
}

export interface AgentConfigV2 {
  name: string;
  displayName?: string;
  description: string;
  metadata?: AgentMetadata;
  triggers?: AgentTrigger;
  systemPrompt: string;
  systemPromptFile?: string;
  tools: AgentToolConfig | string[];
  skills?: AgentSkillConfig;
  permissions?: AgentPermissionConfig;
  model: AgentModelConfigV2;
  mcpServers?: string[];
  extends?: string;
  runtime?: AgentRuntimeConfig;
  enabled?: boolean;
}

export interface AgentTemplate {
  name: string;
  description?: string;
  config: Partial<AgentConfigV2>;
}

export interface AgentsConfig {
  default?: string;
  templates?: Record<string, AgentTemplate>;
  definitions: Record<string, AgentConfigV2>;
}

export type AgentStatus = 'idle' | 'running' | 'error' | 'disabled';

export interface AgentInstance {
  config: AgentConfigV2;
  status: AgentStatus;
  lastUsed?: number;
  usageCount: number;
}

export interface AgentRegistry {
  register(config: AgentConfigV2): void;
  unregister(name: string): boolean;
  get(name: string): AgentInstance | undefined;
  getConfig(name: string): AgentConfigV2 | undefined;
  list(): AgentInstance[];
  listEnabled(): AgentInstance[];
  listByTag(tag: string): AgentInstance[];
  search(query: string): AgentInstance[];
  findByKeyword(keyword: string): AgentInstance[];
  selectBest(input: string): AgentInstance | undefined;
  activate(name: string): Promise<void>;
  deactivate(name: string): Promise<void>;
  updateConfig(name: string, config: Partial<AgentConfigV2>): void;
  enable(name: string): void;
  disable(name: string): void;
  getDefault(): AgentInstance;
  setDefault(name: string): void;
  getAvailableTools(agentName: string): string[];
  getAvailableSkills(agentName: string): string[];
}

export function isAgentToolConfigArray(
  tools: AgentToolConfig | string[]
): tools is string[] {
  return Array.isArray(tools);
}

export function normalizeToolConfig(
  tools: AgentToolConfig | string[]
): AgentToolConfig {
  if (isAgentToolConfigArray(tools)) {
    return { allowed: tools };
  }
  return tools;
}

export function normalizeSkillConfig(
  skills?: AgentSkillConfig
): AgentSkillConfig | undefined {
  if (!skills) return undefined;
  
  if (skills.autoInitialize === true) {
    return {
      ...skills,
      autoInitialize: skills.allowed
    };
  }
  
  return skills;
}

export function mergeAgentConfigs(
  parent: AgentConfigV2,
  child: AgentConfigV2
): AgentConfigV2 {
  const merged: AgentConfigV2 = {
    name: child.name,
    displayName: child.displayName ?? parent.displayName,
    description: child.description ?? parent.description,
    systemPrompt: child.systemPrompt ?? parent.systemPrompt,
    systemPromptFile: child.systemPromptFile ?? parent.systemPromptFile,
    model: { ...parent.model, ...child.model },
    tools: mergeToolConfigs(parent.tools, child.tools),
    enabled: child.enabled ?? parent.enabled ?? true
  };

  if (parent.metadata || child.metadata) {
    merged.metadata = {
      ...parent.metadata,
      ...child.metadata,
      tags: [...(parent.metadata?.tags || []), ...(child.metadata?.tags || [])]
    };
  }

  if (parent.triggers || child.triggers) {
    merged.triggers = mergeTriggers(parent.triggers, child.triggers);
  }

  if (parent.skills || child.skills) {
    merged.skills = mergeSkillConfigs(parent.skills, child.skills);
  }

  if (parent.permissions || child.permissions) {
    merged.permissions = mergePermissionConfigs(
      parent.permissions,
      child.permissions
    );
  }

  if (parent.runtime || child.runtime) {
    merged.runtime = { ...parent.runtime, ...child.runtime };
  }

  if (child.mcpServers || parent.mcpServers) {
    merged.mcpServers = [...(parent.mcpServers || []), ...(child.mcpServers || [])];
  }

  return merged;
}

function mergeToolConfigs(
  parent: AgentToolConfig | string[],
  child: AgentToolConfig | string[]
): AgentToolConfig {
  const parentConfig = normalizeToolConfig(parent);
  const childConfig = normalizeToolConfig(child);

  const allowedSet = new Set([
    ...(parentConfig.allowed || []),
    ...(childConfig.allowed || [])
  ]);
  const deniedSet = new Set([
    ...(parentConfig.denied || []),
    ...(childConfig.denied || [])
  ]);
  const groupsSet = new Set([
    ...(parentConfig.groups || []),
    ...(childConfig.groups || [])
  ]);

  return {
    allowed: Array.from(allowedSet),
    denied: Array.from(deniedSet).length > 0 ? Array.from(deniedSet) : undefined,
    groups: Array.from(groupsSet).length > 0 ? Array.from(groupsSet) : undefined
  };
}

function mergeSkillConfigs(
  parent?: AgentSkillConfig,
  child?: AgentSkillConfig
): AgentSkillConfig | undefined {
  if (!parent && !child) return undefined;
  if (!parent) return child;
  if (!child) return parent;

  const allowedSet = new Set([...parent.allowed, ...child.allowed]);
  const deniedSet = new Set([
    ...(parent.denied || []),
    ...(child.denied || [])
  ]);

  let autoInitialize: string[] | undefined;
  if (parent.autoInitialize || child.autoInitialize) {
    const parentAuto = Array.isArray(parent.autoInitialize)
      ? parent.autoInitialize
      : parent.autoInitialize
      ? parent.allowed
      : [];
    const childAuto = Array.isArray(child.autoInitialize)
      ? child.autoInitialize
      : child.autoInitialize
      ? child.allowed
      : [];
    autoInitialize = [...parentAuto, ...childAuto];
  }

  return {
    allowed: Array.from(allowedSet),
    denied: Array.from(deniedSet).length > 0 ? Array.from(deniedSet) : undefined,
    autoInitialize
  };
}

function mergeTriggers(
  parent?: AgentTrigger,
  child?: AgentTrigger
): AgentTrigger | undefined {
  if (!parent && !child) return undefined;
  if (!parent) return child;
  if (!child) return parent;

  return {
    keywords: [...(parent.keywords || []), ...(child.keywords || [])],
    patterns: [...(parent.patterns || []), ...(child.patterns || [])],
    fileTypes: [...(parent.fileTypes || []), ...(child.fileTypes || [])],
    autoStart: child.autoStart ?? parent.autoStart
  };
}

function mergePermissionConfigs(
  parent?: AgentPermissionConfig,
  child?: AgentPermissionConfig
): AgentPermissionConfig | undefined {
  if (!parent && !child) return undefined;
  if (!parent) return child;
  if (!child) return parent;

  return {
    inherit: child.inherit ?? parent.inherit ?? true,
    tools: { ...parent.tools, ...child.tools },
    skills: { ...parent.skills, ...child.skills },
    patterns: [...(parent.patterns || []), ...(child.patterns || [])]
  };
}

export const DEFAULT_AGENT_CONFIG: Partial<AgentConfigV2> = {
  enabled: true,
  runtime: {
    maxSteps: 50,
    timeout: 300000
  }
};
