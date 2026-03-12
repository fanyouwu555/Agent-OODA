import { z } from 'zod';
import { Permission, ExecutionContext } from '../types';
import { PermissionMode } from '../permission';

export type ToolType = 'tool' | 'skill' | 'mcp-tool';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface UnifiedTool {
  name: string;
  displayName?: string;
  description: string;
  type: ToolType;
  category: string;
  tags?: string[];
  version?: string;
  dependencies?: string[];
  schema: z.ZodSchema;
  requiredPermissions: Permission[];
  defaultPermissionMode?: PermissionMode;
  riskLevel?: RiskLevel;
  execute(input: unknown, context: ExecutionContext): Promise<unknown>;
  initialize?: () => Promise<void>;
  shutdown?: () => Promise<void>;
}

export interface ToolGroup {
  name: string;
  displayName: string;
  description?: string;
  tools: string[];
  permissions?: Record<string, PermissionMode>;
}

export interface ToolRegistryConfig {
  groups?: Record<string, ToolGroup>;
}

export interface UnifiedToolRegistry {
  registerTool(tool: UnifiedTool): void;
  registerSkill(skill: UnifiedTool): void;
  registerMCPTool(tool: UnifiedTool, serverName: string): void;
  registerGroup(group: ToolGroup): void;
  
  get(name: string): UnifiedTool | undefined;
  getByType(type: ToolType): UnifiedTool[];
  getByCategory(category: string): UnifiedTool[];
  getByGroup(groupName: string): UnifiedTool[];
  getByTag(tag: string): UnifiedTool[];
  
  list(): UnifiedTool[];
  listNames(): string[];
  listGroups(): ToolGroup[];
  
  execute(
    name: string,
    input: unknown,
    context: ExecutionContext & { agentName?: string }
  ): Promise<unknown>;
  
  checkPermission(name: string, agentName: string): PermissionMode;
  
  initializeAll(): Promise<void>;
  shutdownAll(): Promise<void>;
  
  has(name: string): boolean;
  isAllowed(name: string, agentTools: string[]): boolean;
}

export interface ToolRegistryEvents {
  onToolRegistered: (tool: UnifiedTool) => void;
  onToolExecuted: (name: string, result: unknown) => void;
  onToolError: (name: string, error: Error) => void;
}

export function createToolFromConfig(config: {
  name: string;
  description: string;
  category: string;
  schema: z.ZodSchema;
  handler: (input: unknown, context: ExecutionContext) => Promise<unknown>;
  permissions?: Permission[];
  type?: ToolType;
}): UnifiedTool {
  return {
    name: config.name,
    description: config.description,
    category: config.category,
    schema: config.schema,
    requiredPermissions: config.permissions || [],
    type: config.type || 'tool',
    execute: config.handler
  };
}

export function toolNameMatches(name: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === name) return true;
  
  const regexPattern = pattern
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(name);
}

export function getToolRiskLevel(tool: UnifiedTool): RiskLevel {
  if (tool.riskLevel) return tool.riskLevel;
  
  const highRiskCategories = ['system', 'network', 'execution'];
  const criticalPermissions = ['exec', 'file_write'];
  
  if (highRiskCategories.includes(tool.category)) {
    return 'high';
  }
  
  if (tool.requiredPermissions.some(p => criticalPermissions.includes(p.type))) {
    return 'high';
  }
  
  if (tool.requiredPermissions.length > 0) {
    return 'medium';
  }
  
  return 'low';
}
