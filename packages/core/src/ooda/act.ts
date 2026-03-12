// packages/core/src/ooda/act.ts
import { Decision, Action, ActionResult, ActionFeedback } from '../types';
import { ToolRegistry } from '../../../tools/src/registry';
import { SkillContext } from '../skill/interface';
import { getSkillRegistry } from '../skill/registry';
import { getMCPService } from '../mcp/service';
import { getPermissionManager, PermissionMode } from '../permission';

export class Actor {
  private sessionId: string;
  private toolRegistry: ToolRegistry;
  private skillRegistry = getSkillRegistry();
  private mcp = getMCPService();
  private permissionManager = getPermissionManager();
  
  constructor(sessionId: string, toolRegistry?: ToolRegistry) {
    this.sessionId = sessionId;
    this.toolRegistry = toolRegistry || new ToolRegistry();
  }

  async act(decision: Decision): Promise<ActionResult> {
    const action = decision.nextAction;
    const startTime = Date.now();
    
    try {
      let result: unknown;
      let sideEffects: string[] = [];
      
      switch (action.type) {
        case 'tool_call':
          result = await this.executeTool(action);
          sideEffects = this.identifySideEffects(action, result);
          break;
          
        case 'skill_call':
          result = await this.executeSkill(action);
          sideEffects = this.identifySideEffects(action, result);
          break;
          
        case 'response':
          result = await this.generateResponse(action);
          break;
          
        case 'clarification':
          result = await this.requestClarification(action);
          break;
          
        default:
          throw new Error(`Unknown action type: ${(action as Action).type}`);
      }
      
      const feedback = this.generateFeedback(action, result, decision);
      const executionTime = Date.now() - startTime;
      
      await this.publishActionResult(action, result, executionTime, false);
      
      return {
        success: !this.isErrorResult(result),
        result,
        sideEffects,
        feedback,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorResult = {
        error: true,
        message: (error as Error).message,
        stack: (error as Error).stack,
      };
      
      await this.publishActionResult(action, errorResult, executionTime, true);
      
      return {
        success: false,
        result: errorResult,
        sideEffects: [],
        feedback: {
          observations: [`执行失败: ${(error as Error).message}`],
          newInformation: [],
          issues: [(error as Error).message],
          suggestions: ['考虑重试或选择其他方案'],
        },
      };
    }
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
        sessionId: this.sessionId,
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
        sessionId: this.sessionId,
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
    
    return {
      type: 'response',
      content: action.content,
      timestamp: Date.now(),
    };
  }

  private async requestClarification(action: Action): Promise<unknown> {
    if (action.type !== 'clarification') {
      throw new Error('Invalid action type for requestClarification');
    }
    
    await this.mcp.publishEvent('agent.clarification', {
      question: action.clarificationQuestion,
      timestamp: Date.now(),
    });
    
    return {
      type: 'clarification',
      question: action.clarificationQuestion,
      timestamp: Date.now(),
    };
  }

  private identifySideEffects(action: Action, result: unknown): string[] {
    const sideEffects: string[] = [];
    
    if (action.type === 'tool_call') {
      if (action.toolName === 'write_file') {
        sideEffects.push(`文件已修改: ${action.args?.path}`);
      }
      if (action.toolName === 'run_bash') {
        sideEffects.push(`命令已执行: ${action.args?.command}`);
      }
    }
    
    if (action.type === 'skill_call') {
      sideEffects.push(`技能已执行: ${action.toolName}`);
    }
    
    return sideEffects;
  }

  private generateFeedback(action: Action, result: unknown, decision: Decision): ActionFeedback {
    const feedback: ActionFeedback = {
      observations: [],
      newInformation: [],
      issues: [],
      suggestions: [],
    };
    
    if (this.isErrorResult(result)) {
      feedback.issues.push('执行过程中发生错误');
      feedback.suggestions.push('检查错误信息并考虑重试');
      feedback.suggestions.push('如果问题持续，考虑选择其他方案');
      
      const otherOptions = decision.options.filter(o => o.id !== decision.selectedOption.id);
      if (otherOptions.length > 0) {
        feedback.suggestions.push(`备选方案: ${otherOptions.map(o => o.description).join(', ')}`);
      }
    } else {
      feedback.observations.push('操作成功完成');
      
      if (action.type === 'tool_call') {
        feedback.newInformation.push(`工具 ${action.toolName} 执行成功`);
        
        const resultData = result as any;
        if (resultData.result) {
          const resultStr = typeof resultData.result === 'string' 
            ? resultData.result 
            : JSON.stringify(resultData.result).slice(0, 200);
          feedback.newInformation.push(`结果摘要: ${resultStr}...`);
        }
      }
      
      const remainingSteps = decision.plan.subtasks.filter(t => t.status === 'pending').length;
      if (remainingSteps > 1) {
        feedback.observations.push(`还有 ${remainingSteps - 1} 个步骤待执行`);
      } else if (remainingSteps === 0) {
        feedback.observations.push('所有计划步骤已完成');
      }
    }
    
    return feedback;
  }

  private isErrorResult(result: unknown): boolean {
    if (result && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      return r.isError === true || r.error === true;
    }
    return false;
  }

  private async publishActionResult(
    action: Action, 
    result: unknown, 
    executionTime: number, 
    isError: boolean
  ): Promise<void> {
    await this.mcp.publishEvent('ooda.act.complete', {
      actionType: action.type,
      toolName: action.toolName,
      success: !isError,
      executionTime,
      timestamp: Date.now(),
      resultPreview: this.getPreview(result),
    });
  }

  private getPreview(result: unknown): string {
    if (typeof result === 'string') {
      return result.slice(0, 200);
    }
    try {
      const str = JSON.stringify(result);
      return str.slice(0, 200);
    } catch {
      return '[无法序列化结果]';
    }
  }
}
