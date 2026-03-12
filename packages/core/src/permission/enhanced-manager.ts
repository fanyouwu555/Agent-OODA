import { PermissionMode, PermissionConfig, PermissionResult } from '../permission';
import {
  EnhancedPermissionManager,
  EnhancedPermissionConfig,
  GlobalPermissionConfig,
  PermissionCheckContext,
  DEFAULT_ENHANCED_PERMISSION_CONFIG
} from './enhanced';
import { AgentPermissionConfig, PermissionPattern } from '../agent/interface';

export class EnhancedPermissionManagerImpl implements EnhancedPermissionManager {
  private config: EnhancedPermissionConfig;
  private userConfirmationCallback?: (
    toolName: string,
    args: unknown,
    agentName: string
  ) => Promise<boolean>;

  constructor(config: EnhancedPermissionConfig = DEFAULT_ENHANCED_PERMISSION_CONFIG) {
    this.config = this.deepClone(config);
  }

  loadConfig(config: EnhancedPermissionConfig): void {
    this.config = this.deepClone(config);
  }

  getGlobalConfig(): GlobalPermissionConfig {
    return { ...this.config.global };
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
    this.config = this.deepClone(DEFAULT_ENHANCED_PERMISSION_CONFIG);
  }

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

let enhancedPermissionManager: EnhancedPermissionManagerImpl | null = null;

export function getEnhancedPermissionManager(): EnhancedPermissionManager {
  if (!enhancedPermissionManager) {
    enhancedPermissionManager = new EnhancedPermissionManagerImpl();
  }
  return enhancedPermissionManager;
}

export function initializeEnhancedPermissionManager(
  config: EnhancedPermissionConfig
): EnhancedPermissionManager {
  enhancedPermissionManager = new EnhancedPermissionManagerImpl(config);
  return enhancedPermissionManager;
}

export function createEnhancedPermissionManager(
  config?: EnhancedPermissionConfig
): EnhancedPermissionManagerImpl {
  return new EnhancedPermissionManagerImpl(config);
}
