import { PermissionMode, PermissionConfig, PermissionResult } from '../permission';
import { AgentPermissionConfig, PermissionCondition } from '../agent/interface';

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

export interface EnhancedPermissionManager {
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

export interface PermissionCheckResult {
  allowed: boolean;
  mode: PermissionMode;
  source: 'global' | 'agent' | 'group' | 'pattern' | 'default';
  matchedPattern?: string;
  message?: string;
}

export const DEFAULT_GLOBAL_PERMISSION_CONFIG: GlobalPermissionConfig = {
  defaultMode: PermissionMode.ASK,
  tools: {
    read: PermissionMode.ALLOW,
    grep: PermissionMode.ALLOW,
    glob: PermissionMode.ALLOW,
    list: PermissionMode.ALLOW,
    write: PermissionMode.ASK,
    edit: PermissionMode.ASK,
    bash: PermissionMode.ASK,
    webfetch: PermissionMode.ASK,
    question: PermissionMode.ALLOW,
    todowrite: PermissionMode.ALLOW,
    todoread: PermissionMode.ALLOW
  },
  skills: {
    data_analysis: PermissionMode.ASK,
    image_processing: PermissionMode.ASK,
    pdf_processing: PermissionMode.ASK,
    code_analysis: PermissionMode.ALLOW,
    api_test: PermissionMode.ASK,
    database_query: PermissionMode.ASK
  }
};

export const DEFAULT_ENHANCED_PERMISSION_CONFIG: EnhancedPermissionConfig = {
  global: DEFAULT_GLOBAL_PERMISSION_CONFIG,
  agents: {},
  groups: {
    readonly: {
      read: PermissionMode.ALLOW,
      grep: PermissionMode.ALLOW,
      glob: PermissionMode.ALLOW,
      list: PermissionMode.ALLOW
    },
    dangerous: {
      bash: PermissionMode.DENY,
      write: PermissionMode.ASK
    }
  }
};

export function checkCondition(
  condition: PermissionCondition,
  context: PermissionCheckContext
): boolean {
  const { type, operator, value } = condition;
  
  let targetValue: string | undefined;
  
  switch (type) {
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
  
  switch (operator) {
    case 'equals':
      return targetValue === value;
    case 'contains':
      return targetValue.includes(value);
    case 'matches':
      return new RegExp(value, 'i').test(targetValue);
    case 'startsWith':
      return targetValue.startsWith(value);
    default:
      return false;
  }
}

export function checkAllConditions(
  conditions: PermissionCondition[],
  context: PermissionCheckContext
): boolean {
  return conditions.every(condition => checkCondition(condition, context));
}
