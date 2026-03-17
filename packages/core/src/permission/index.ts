// packages/core/src/permission/index.ts
// 统一的权限管理系统 - 包含全局、Agent级别、权限组和条件规则支持

import { AgentPermissionConfig } from '../agent/interface';

// ============================================================================
// 类型定义
// ============================================================================

export enum PermissionMode {
  ALLOW = 'allow',
  DENY = 'deny',
  ASK = 'ask'
}

export interface PermissionConfig {
  [toolName: string]: PermissionMode;
}

export interface PermissionResult {
  allowed: boolean;
  mode: PermissionMode;
  message?: string;
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

export interface GlobalPermissionConfig {
  defaultMode: PermissionMode;
  tools: Record<string, PermissionMode>;
  skills: Record<string, PermissionMode>;
}

export interface EnhancedPermissionConfig {
  global: GlobalPermissionConfig;
  agents: Record<string, AgentPermissionConfig>;
  groups: Record<string, Record<string, PermissionMode>>;
}

export interface PermissionCheckContext {
  input?: unknown;
  path?: string;
  command?: string;
  resourceUsage?: {
    memory?: number;
    cpu?: number;
    network?: number;
  };
}

// ============================================================================
// 统一权限管理器接口
// ============================================================================

export interface PermissionManager {
  loadConfig(config: EnhancedPermissionConfig): void;
  getGlobalConfig(): GlobalPermissionConfig;
  getAgentConfig(agentName: string): AgentPermissionConfig | undefined;
  
  checkPermission(
    toolOrSkill: string,
    agentName: string,
    context?: PermissionCheckContext
  ): Promise<PermissionResult>;
  
  checkPermissionSync(
    toolOrSkill: string,
    agentName: string
  ): PermissionResult;
  
  mergePermissions(
    global: GlobalPermissionConfig,
    agent?: AgentPermissionConfig
  ): PermissionConfig;
  
  updateGlobalPermission(tool: string, mode: PermissionMode): void;
  updateAgentPermission(
    agent: string,
    tool: string,
    mode: PermissionMode
  ): void;
  
  // 获取和更新完整配置
  getConfig(): EnhancedPermissionConfig;
  updateConfig(config: PermissionConfig): void;
  
  setUserConfirmationCallback(
    callback: (
      toolName: string,
      args: unknown,
      agentName: string
    ) => Promise<boolean>
  ): void;
  
  addGroupPermissions(
    groupName: string,
    permissions: Record<string, PermissionMode>
  ): void;
  
  getEffectivePermissions(agentName: string): PermissionConfig;
  
  reset(): void;
}

// ============================================================================
// 默认配置
// ============================================================================

export const DEFAULT_GLOBAL_PERMISSION_CONFIG: GlobalPermissionConfig = {
  defaultMode: PermissionMode.ASK,
  tools: {
    // 读取类操作 - 默认允许
    'read': PermissionMode.ALLOW,
    'grep': PermissionMode.ALLOW,
    'glob': PermissionMode.ALLOW,
    'list': PermissionMode.ALLOW,
    'file:read': PermissionMode.ALLOW,
    
    // 写入类操作 - 需要确认
    'write': PermissionMode.ASK,
    'edit': PermissionMode.ASK,
    'file:write': PermissionMode.ASK,
    
    // 危险操作 - 需要确认或拒绝
    'bash': PermissionMode.ASK,
    'bash:run': PermissionMode.ASK,
    'delete': PermissionMode.DENY,
    'file:delete': PermissionMode.DENY,
    
    // 网络操作 - 默认允许
    'web_search': PermissionMode.ALLOW,
    'web_fetch': PermissionMode.ALLOW,
    'webfetch': PermissionMode.ALLOW,
    'web:search': PermissionMode.ALLOW,
    'web:fetch': PermissionMode.ALLOW,
    
    // 内部操作 - 默认允许
    'question': PermissionMode.ALLOW,
    'todowrite': PermissionMode.ALLOW,
    'todoread': PermissionMode.ALLOW,
  },
  skills: {
    'data_analysis': PermissionMode.ASK,
    'image_processing': PermissionMode.ASK,
    'pdf_processing': PermissionMode.ASK,
    'code_analysis': PermissionMode.ALLOW,
    'api_test': PermissionMode.ASK,
    'database_query': PermissionMode.ASK,
    'skill-read': PermissionMode.ALLOW,
    'skill-write': PermissionMode.ASK,
  }
};

export const DEFAULT_PERMISSION_CONFIG: EnhancedPermissionConfig = {
  global: DEFAULT_GLOBAL_PERMISSION_CONFIG,
  agents: {
    'default': {
      inherit: true,
      tools: {},
      skills: {},
    }
  },
  groups: {
    'readonly': {
      'read': PermissionMode.ALLOW,
      'grep': PermissionMode.ALLOW,
      'glob': PermissionMode.ALLOW,
      'list': PermissionMode.ALLOW,
      'file:read': PermissionMode.ALLOW,
    },
    'safe-tools': {
      'read': PermissionMode.ALLOW,
      'grep': PermissionMode.ALLOW,
      'glob': PermissionMode.ALLOW,
      'list': PermissionMode.ALLOW,
      'web_search': PermissionMode.ALLOW,
      'web_fetch': PermissionMode.ALLOW,
      'web:search': PermissionMode.ALLOW,
      'web:fetch': PermissionMode.ALLOW,
    },
    'dangerous': {
      'bash': PermissionMode.DENY,
      'write': PermissionMode.ASK,
      'delete': PermissionMode.DENY,
    }
  }
};

// ============================================================================
// 权限管理器实现
// ============================================================================

export class PermissionManagerImpl implements PermissionManager {
  private config: EnhancedPermissionConfig;
  private userConfirmationCallback?: (
    toolName: string,
    args: unknown,
    agentName: string
  ) => Promise<boolean>;

  constructor(config: EnhancedPermissionConfig = DEFAULT_PERMISSION_CONFIG) {
    this.config = this.deepClone(config);
  }

  loadConfig(config: EnhancedPermissionConfig): void {
    this.config = this.deepClone(config);
  }

  getGlobalConfig(): GlobalPermissionConfig {
    return { ...this.config.global };
  }

  getConfig(): EnhancedPermissionConfig {
    return this.deepClone(this.config);
  }

  updateConfig(config: PermissionConfig): void {
    // 将简单的工具配置合并到全局工具配置中
    for (const [tool, mode] of Object.entries(config)) {
      this.config.global.tools[tool] = mode;
    }
  }

  getAgentConfig(agentName: string): AgentPermissionConfig | undefined {
    const agentConfig = this.config.agents[agentName];
    if (!agentConfig) return undefined;
    return { ...agentConfig };
  }

  async checkPermission(
    toolOrSkill: string,
    agentName: string,
    context?: PermissionCheckContext
  ): Promise<PermissionResult> {
    const mergedPerms = this.getMergedPermissions(agentName);
    const mode = this.findPermissionMode(toolOrSkill, mergedPerms, agentName);

    if (context) {
      const conditionsMet = this.checkConditions(toolOrSkill, context, agentName);
      if (!conditionsMet) {
        return {
          allowed: false,
          mode: PermissionMode.DENY,
          message: `Conditions not met for tool '${toolOrSkill}'`
        };
      }
    }

    switch (mode) {
      case PermissionMode.ALLOW:
        return {
          allowed: true,
          mode: PermissionMode.ALLOW,
          message: `Tool '${toolOrSkill}' is allowed`
        };

      case PermissionMode.DENY:
        return {
          allowed: false,
          mode: PermissionMode.DENY,
          message: `Tool '${toolOrSkill}' is denied`
        };

      case PermissionMode.ASK:
        return this.handleAskMode(toolOrSkill, agentName, context?.input);

      default:
        return {
          allowed: false,
          mode: this.config.global.defaultMode,
          message: `Unknown permission mode for tool '${toolOrSkill}'`
        };
    }
  }

  checkPermissionSync(toolOrSkill: string, agentName: string): PermissionResult {
    const mergedPerms = this.getMergedPermissions(agentName);
    const mode = this.findPermissionMode(toolOrSkill, mergedPerms, agentName);

    switch (mode) {
      case PermissionMode.ALLOW:
        return {
          allowed: true,
          mode: PermissionMode.ALLOW,
          message: `Tool '${toolOrSkill}' is allowed`
        };

      case PermissionMode.DENY:
        return {
          allowed: false,
          mode: PermissionMode.DENY,
          message: `Tool '${toolOrSkill}' is denied`
        };

      case PermissionMode.ASK:
      default:
        return {
          allowed: false,
          mode: PermissionMode.ASK,
          message: `Tool '${toolOrSkill}' requires confirmation`
        };
    }
  }

  mergePermissions(
    global: GlobalPermissionConfig,
    agent?: AgentPermissionConfig
  ): PermissionConfig {
    const merged: PermissionConfig = {
      ...global.tools,
      ...global.skills
    };

    if (!agent) {
      return merged;
    }

    if (agent.tools) {
      Object.assign(merged, agent.tools);
    }

    if (agent.skills) {
      Object.assign(merged, agent.skills);
    }

    return merged;
  }

  updateGlobalPermission(tool: string, mode: PermissionMode): void {
    this.config.global.tools[tool] = mode;
  }

  updateAgentPermission(
    agent: string,
    tool: string,
    mode: PermissionMode
  ): void {
    if (!this.config.agents[agent]) {
      this.config.agents[agent] = { inherit: true, tools: {}, skills: {} };
    }

    if (!this.config.agents[agent].tools) {
      this.config.agents[agent].tools = {};
    }

    this.config.agents[agent].tools![tool] = mode;
  }

  setUserConfirmationCallback(
    callback: (
      toolName: string,
      args: unknown,
      agentName: string
    ) => Promise<boolean>
  ): void {
    this.userConfirmationCallback = callback;
  }

  addGroupPermissions(
    groupName: string,
    permissions: Record<string, PermissionMode>
  ): void {
    this.config.groups[groupName] = permissions;
  }

  getEffectivePermissions(agentName: string): PermissionConfig {
    return this.getMergedPermissions(agentName);
  }

  reset(): void {
    this.config = this.deepClone(DEFAULT_PERMISSION_CONFIG);
  }

  // ==========================================================================
  // 私有方法
  // ==========================================================================

  private getMergedPermissions(agentName: string): PermissionConfig {
    const agentConfig = this.config.agents[agentName];

    if (!agentConfig) {
      return {
        ...this.config.global.tools,
        ...this.config.global.skills
      };
    }

    if (agentConfig.inherit === false) {
      return this.flattenAgentPermissions(agentConfig);
    }

    return this.mergePermissions(this.config.global, agentConfig);
  }

  private flattenAgentPermissions(agentConfig?: AgentPermissionConfig): PermissionConfig {
    if (!agentConfig) {
      return {};
    }

    const result: PermissionConfig = {};

    if (agentConfig.tools) {
      Object.assign(result, agentConfig.tools);
    }

    if (agentConfig.skills) {
      Object.assign(result, agentConfig.skills);
    }

    return result;
  }

  private findPermissionMode(
    toolOrSkill: string,
    permissions: PermissionConfig,
    agentName: string
  ): PermissionMode {
    const agentConfig = this.config.agents[agentName];

    if (agentConfig?.patterns) {
      for (const patternConfig of agentConfig.patterns) {
        if (this.matchPattern(toolOrSkill, patternConfig.pattern)) {
          return patternConfig.mode;
        }
      }
    }

    if (permissions[toolOrSkill]) {
      return permissions[toolOrSkill];
    }

    for (const [pattern, mode] of Object.entries(permissions)) {
      if (pattern.includes('*') && this.matchPattern(toolOrSkill, pattern)) {
        return mode;
      }
    }

    return this.config.global.defaultMode;
  }

  private matchPattern(toolName: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern === toolName) return true;

    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(toolName);
  }

  private checkConditions(
    toolOrSkill: string,
    context: PermissionCheckContext,
    agentName: string
  ): boolean {
    const agentConfig = this.config.agents[agentName];
    if (!agentConfig?.patterns) return true;

    for (const patternConfig of agentConfig.patterns) {
      if (
        this.matchPattern(toolOrSkill, patternConfig.pattern) &&
        patternConfig.conditions &&
        patternConfig.conditions.length > 0
      ) {
        return patternConfig.conditions.every(condition => {
          return this.evaluateCondition(condition, context);
        });
      }
    }

    return true;
  }

  private evaluateCondition(
    condition: { type: string; operator: string; value: string },
    context: PermissionCheckContext
  ): boolean {
    let targetValue: string | undefined;

    switch (condition.type) {
      case 'path':
        targetValue = context.path;
        break;
      case 'command':
        targetValue = context.command;
        break;
      case 'resource':
        targetValue = context.resourceUsage
          ? JSON.stringify(context.resourceUsage)
          : undefined;
        break;
    }

    if (!targetValue) return false;

    switch (condition.operator) {
      case 'equals':
        return targetValue === condition.value;
      case 'contains':
        return targetValue.includes(condition.value);
      case 'matches':
        try {
          return new RegExp(condition.value, 'i').test(targetValue);
        } catch {
          return false;
        }
      case 'startsWith':
        return targetValue.startsWith(condition.value);
      default:
        return false;
    }
  }

  private async handleAskMode(
    toolOrSkill: string,
    agentName: string,
    input?: unknown
  ): Promise<PermissionResult> {
    if (this.userConfirmationCallback) {
      try {
        const confirmed = await this.userConfirmationCallback(
          toolOrSkill,
          input,
          agentName
        );
        return {
          allowed: confirmed,
          mode: PermissionMode.ASK,
          message: confirmed
            ? `User confirmed tool '${toolOrSkill}'`
            : `User denied tool '${toolOrSkill}'`
        };
      } catch (error) {
        return {
          allowed: false,
          mode: PermissionMode.ASK,
          message: `Error during confirmation: ${error}`
        };
      }
    }

    return {
      allowed: false,
      mode: PermissionMode.ASK,
      message: `Tool '${toolOrSkill}' requires confirmation but no callback set`
    };
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}

// ============================================================================
// 导出函数
// ============================================================================

let permissionManagerInstance: PermissionManagerImpl | null = null;

export function getPermissionManager(): PermissionManager {
  if (!permissionManagerInstance) {
    permissionManagerInstance = new PermissionManagerImpl();
  }
  return permissionManagerInstance;
}

export function initializePermissionManager(
  config: EnhancedPermissionConfig
): PermissionManager {
  permissionManagerInstance = new PermissionManagerImpl(config);
  return permissionManagerInstance;
}

export function createPermissionManager(
  config?: EnhancedPermissionConfig
): PermissionManagerImpl {
  return new PermissionManagerImpl(config);
}
