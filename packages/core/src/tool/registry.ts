import {
  UnifiedTool,
  UnifiedToolRegistry,
  ToolGroup,
  ToolType,
  toolNameMatches
} from './interface';
import { ExecutionContext } from '../types';
import { PermissionMode } from '../permission';
import { EnhancedPermissionManager } from '../permission/enhanced';

export class UnifiedToolRegistryImpl implements UnifiedToolRegistry {
  private tools: Map<string, UnifiedTool> = new Map();
  private groups: Map<string, ToolGroup> = new Map();
  private permissionManager: EnhancedPermissionManager | null = null;

  setPermissionManager(manager: EnhancedPermissionManager): void {
    this.permissionManager = manager;
  }

  registerTool(tool: UnifiedTool): void {
    this.validateTool(tool);
    this.tools.set(tool.name, { ...tool, type: tool.type || 'tool' });
  }

  registerSkill(skill: UnifiedTool): void {
    this.validateTool(skill);
    this.tools.set(skill.name, { ...skill, type: 'skill' });
  }

  registerMCPTool(tool: UnifiedTool, serverName: string): void {
    this.validateTool(tool);
    const mcpToolName = `${serverName}:${tool.name}`;
    this.tools.set(mcpToolName, { ...tool, type: 'mcp-tool', name: mcpToolName });
  }

  registerGroup(group: ToolGroup): void {
    this.groups.set(group.name, group);
  }

  get(name: string): UnifiedTool | undefined {
    return this.tools.get(name);
  }

  getByType(type: ToolType): UnifiedTool[] {
    return Array.from(this.tools.values()).filter(tool => tool.type === type);
  }

  getByCategory(category: string): UnifiedTool[] {
    return Array.from(this.tools.values()).filter(
      tool => tool.category === category
    );
  }

  getByGroup(groupName: string): UnifiedTool[] {
    const group = this.groups.get(groupName);
    if (!group) return [];

    return group.tools
      .map(name => this.tools.get(name))
      .filter((t): t is UnifiedTool => t !== undefined);
  }

  getByTag(tag: string): UnifiedTool[] {
    return Array.from(this.tools.values()).filter(
      tool => tool.tags?.includes(tag)
    );
  }

  list(): UnifiedTool[] {
    return Array.from(this.tools.values());
  }

  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  listGroups(): ToolGroup[] {
    return Array.from(this.groups.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  isAllowed(name: string, agentTools: string[]): boolean {
    const tool = this.get(name);
    if (!tool) return false;

    for (const pattern of agentTools) {
      if (toolNameMatches(name, pattern)) {
        return true;
      }
    }

    return false;
  }

  checkPermission(name: string, agentName: string): PermissionMode {
    if (!this.permissionManager) {
      return PermissionMode.ASK;
    }

    const result = this.permissionManager.checkPermissionSync(name, agentName);
    return result.mode;
  }

  async execute(
    name: string,
    input: unknown,
    context: ExecutionContext & { agentName?: string }
  ): Promise<unknown> {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Tool/Skill '${name}' not found`);
    }

    const validatedInput = tool.schema.parse(input);

    if (this.permissionManager && context.agentName) {
      const permResult = await this.permissionManager.checkPermission(
        name,
        context.agentName,
        { input: validatedInput }
      );

      if (!permResult.allowed) {
        throw new PermissionDeniedError(
          `Permission denied for tool '${name}': ${permResult.message}`
        );
      }
    }

    return tool.execute(validatedInput, context);
  }

  async initializeAll(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (const tool of this.tools.values()) {
      if (tool.initialize) {
        initPromises.push(
          tool.initialize().catch(err => {
            console.error(`Failed to initialize tool '${tool.name}':`, err);
            throw err;
          })
        );
      }
    }

    await Promise.all(initPromises);
  }

  async shutdownAll(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];

    for (const tool of this.tools.values()) {
      if (tool.shutdown) {
        shutdownPromises.push(
          tool.shutdown().catch(err => {
            console.error(`Failed to shutdown tool '${tool.name}':`, err);
          })
        );
      }
    }

    await Promise.all(shutdownPromises);
  }

  private validateTool(tool: UnifiedTool): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool must have a valid name');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      throw new Error(`Tool '${tool.name}' must have a valid description`);
    }

    if (!tool.schema) {
      throw new Error(`Tool '${tool.name}' must have a schema`);
    }

    if (typeof tool.execute !== 'function') {
      throw new Error(`Tool '${tool.name}' must have an execute function`);
    }

    if (this.tools.has(tool.name)) {
      console.warn(`Tool '${tool.name}' is being re-registered`);
    }
  }

  getToolsByNames(names: string[]): UnifiedTool[] {
    return names
      .map(name => this.get(name))
      .filter((t): t is UnifiedTool => t !== undefined);
  }

  resolveToolReferences(references: string[]): string[] {
    const resolved: string[] = [];

    for (const ref of references) {
      if (ref.startsWith('@')) {
        const groupName = ref.slice(1);
        const group = this.groups.get(groupName);
        if (group) {
          resolved.push(...group.tools);
        } else {
          console.warn(`Tool group '${groupName}' not found`);
        }
      } else {
        resolved.push(ref);
      }
    }

    return [...new Set(resolved)];
  }
}

export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}

let toolRegistry: UnifiedToolRegistryImpl | null = null;

export function getUnifiedToolRegistry(): UnifiedToolRegistry {
  if (!toolRegistry) {
    toolRegistry = new UnifiedToolRegistryImpl();
  }
  return toolRegistry;
}

export function setUnifiedToolRegistry(
  registry: UnifiedToolRegistryImpl
): void {
  toolRegistry = registry;
}

export function createUnifiedToolRegistry(): UnifiedToolRegistryImpl {
  return new UnifiedToolRegistryImpl();
}
