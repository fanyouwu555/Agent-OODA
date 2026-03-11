// packages/core/src/ooda/act.ts
import { Decision, Action } from '../types';
import { ToolRegistry } from '../../../tools/src/registry';
import { SkillContext } from '../skill/interface';
import { getSkillRegistry } from '../skill/registry';
import { getMCPService } from '../mcp/service';
import { getPermissionManager, PermissionMode } from '../permission';

export class Actor {
  private toolRegistry: ToolRegistry;
  private skillRegistry = getSkillRegistry();
  private mcp = getMCPService();
  private permissionManager = getPermissionManager();
  
  constructor(toolRegistry?: ToolRegistry) {
    this.toolRegistry = toolRegistry || new ToolRegistry();
  }

  async act(decision: Decision): Promise<unknown> {
    const action = decision.nextAction;
    
    if (action.type === 'tool_call') {
      return this.executeTool(action);
    } else if (action.type === 'skill_call') {
      return this.executeSkill(action);
    } else if (action.type === 'response') {
      return this.generateResponse(action);
    }
    
    throw new Error(`Unknown action type: ${(action as Action).type}`);
  }

  private async executeTool(action: Action): Promise<unknown> {
    if (action.type !== 'tool_call') {
      throw new Error('Invalid action type for executeTool');
    }
    
    const toolName = action.toolName!;
    const args = action.args!;
    
    const permissionResult = await this.permissionManager.requestPermission(toolName, args);
    
    if (!permissionResult.allowed) {
      await this.mcp.publishError('tool.permission_denied', new Error(permissionResult.message));
      
      return {
        toolName: toolName,
        result: permissionResult.message,
        isError: true,
        executionTime: Date.now(),
        permissionDenied: true,
      };
    }
    
    try {
      const tool = this.toolRegistry.get(toolName);
      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }
      
      const result = await tool.execute(args, {
        workingDirectory: process.cwd(),
        sessionId: 'temp-session',
        maxExecutionTime: 30000,
        resources: {
          memory: 1024 * 1024 * 1024,
          cpu: 1,
        },
      });
      
      await this.mcp.publishEvent('tool.executed', {
        toolName: toolName,
        result: result,
        timestamp: Date.now(),
        permissionMode: permissionResult.mode,
      });
      
      return {
        toolName: toolName,
        result: result,
        isError: false,
        executionTime: Date.now(),
        permissionMode: permissionResult.mode,
      };
    } catch (error) {
      await this.mcp.publishError('tool.error', error as Error);
      
      return {
        toolName: toolName,
        result: (error as Error).message,
        isError: true,
        executionTime: Date.now(),
      };
    }
  }

  private async executeSkill(action: Action): Promise<unknown> {
    if (action.type !== 'skill_call') {
      throw new Error('Invalid action type for executeSkill');
    }
    
    const skillName = action.toolName!;
    const args = action.args!;
    
    const permissionResult = await this.permissionManager.requestPermission(skillName, args);
    
    if (!permissionResult.allowed) {
      await this.mcp.publishError('skill.permission_denied', new Error(permissionResult.message));
      
      return {
        skillName: skillName,
        result: permissionResult.message,
        isError: true,
        executionTime: Date.now(),
        permissionDenied: true,
      };
    }
    
    try {
      const skillContext: SkillContext = {
        workingDirectory: process.cwd(),
        sessionId: 'temp-session',
        maxExecutionTime: 60000,
        resources: {
          memory: 2048 * 1024 * 1024,
          cpu: 2,
        },
        skillRegistry: this.skillRegistry,
        mcp: this.mcp,
      };
      
      const result = await this.skillRegistry.execute(
        skillName,
        args,
        skillContext
      );
      
      await this.mcp.publishEvent('skill.executed', {
        skillName: skillName,
        result: result,
        timestamp: Date.now(),
        permissionMode: permissionResult.mode,
      });
      
      return {
        skillName: skillName,
        result: result,
        isError: false,
        executionTime: Date.now(),
        permissionMode: permissionResult.mode,
      };
    } catch (error) {
      await this.mcp.publishError('skill.error', error as Error);
      
      return {
        skillName: skillName,
        result: (error as Error).message,
        isError: true,
        executionTime: Date.now(),
      };
    }
  }

  private async generateResponse(action: Action): Promise<unknown> {
    if (action.type !== 'response') {
      throw new Error('Invalid action type for generateResponse');
    }
    
    await this.mcp.publishEvent('agent.response', {
      content: action.content,
      timestamp: Date.now(),
    });
    
    return action.content;
  }
}
