// packages/core/src/ooda/act.ts
import { Decision, Action, ActionResult, ActionFeedback } from '../types';
import { UnifiedToolRegistryImpl } from '../tool/registry';
import { SkillContext } from '../skill/interface';
import { getSkillRegistry } from '../skill/registry';
import { getMCPService } from '../mcp/service';
import { getPermissionManager, PermissionMode } from '../permission';

export class Actor {
  private sessionId: string;
  private toolRegistry: UnifiedToolRegistryImpl;
  private skillRegistry = getSkillRegistry();
  private mcp = getMCPService();
  private permissionManager = getPermissionManager();

  constructor(sessionId: string, toolRegistry?: UnifiedToolRegistryImpl) {
    this.sessionId = sessionId;
    this.toolRegistry = toolRegistry || new UnifiedToolRegistryImpl();
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
      
      // 启发式反馈：基于错误类型提供具体建议
      const errorFeedback = this.generateHeuristicErrorFeedback(action, result);
      feedback.suggestions.push(...errorFeedback.suggestions);
      feedback.issues.push(...errorFeedback.issues);
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
        
        // 启发式反馈：基于工具类型提供额外信息
        const heuristicFeedback = this.generateHeuristicSuccessFeedback(action, result);
        feedback.observations.push(...heuristicFeedback.observations);
        feedback.newInformation.push(...heuristicFeedback.newInformation);
      }
      
      const remainingSteps = decision.plan.subtasks.filter(t => t.status === 'pending').length;
      if (remainingSteps > 1) {
        feedback.observations.push(`还有 ${remainingSteps - 1} 个步骤待执行`);
      } else if (remainingSteps === 0) {
        feedback.observations.push('所有计划步骤已完成');
      }
      
      // 启发式反馈：任务进度评估
      const progressFeedback = this.generateProgressFeedback(decision);
      if (progressFeedback) {
        feedback.observations.push(progressFeedback);
      }
    }
    
    return feedback;
  }

  /**
   * 启发式错误反馈 - 基于错误类型提供具体建议
   */
  private generateHeuristicErrorFeedback(action: Action, result: unknown): { suggestions: string[]; issues: string[] } {
    const suggestions: string[] = [];
    const issues: string[] = [];
    
    const resultData = result as any;
    const errorMessage = resultData?.result || resultData?.message || '';
    const errorStr = String(errorMessage).toLowerCase();
    
    if (action.type === 'tool_call') {
      // 文件相关错误
      if (action.toolName === 'read_file' || action.toolName === 'write_file') {
        if (errorStr.includes('not found') || errorStr.includes('不存在') || errorStr.includes('no such file')) {
          issues.push('目标文件不存在');
          suggestions.push('检查文件路径是否正确');
          suggestions.push('使用 glob 工具查找正确的文件路径');
        } else if (errorStr.includes('permission') || errorStr.includes('权限')) {
          issues.push('文件权限不足');
          suggestions.push('检查文件权限设置');
          suggestions.push('尝试使用其他位置或请求权限');
        } else if (errorStr.includes('too large') || errorStr.includes('过大')) {
          issues.push('文件过大');
          suggestions.push('尝试分块读取或使用 limit 参数');
        }
      }
      
      // 命令执行错误
      if (action.toolName === 'run_bash') {
        if (errorStr.includes('not found') || errorStr.includes('不是内部或外部命令')) {
          issues.push('命令不存在');
          suggestions.push('检查命令名称是否正确');
          suggestions.push('确认相关工具已安装');
        } else if (errorStr.includes('permission denied') || errorStr.includes('拒绝访问')) {
          issues.push('命令执行权限不足');
          suggestions.push('检查是否需要管理员权限');
        } else if (errorStr.includes('timeout') || errorStr.includes('超时')) {
          issues.push('命令执行超时');
          suggestions.push('尝试简化命令或增加超时时间');
        }
      }
      
      // 搜索错误
      if (action.toolName === 'search_web') {
        if (errorStr.includes('network') || errorStr.includes('网络')) {
          issues.push('网络连接问题');
          suggestions.push('检查网络连接');
          suggestions.push('稍后重试');
        } else if (errorStr.includes('rate limit') || errorStr.includes('限制')) {
          issues.push('请求频率限制');
          suggestions.push('稍后重试');
          suggestions.push('减少查询频率');
        }
      }
    }
    
    return { suggestions, issues };
  }

  /**
   * 启发式成功反馈 - 基于工具类型提供额外信息
   */
  private generateHeuristicSuccessFeedback(action: Action, result: unknown): { observations: string[]; newInformation: string[] } {
    const observations: string[] = [];
    const newInformation: string[] = [];
    
    const resultData = result as any;
    
    if (action.type === 'tool_call') {
      // 文件读取成功
      if (action.toolName === 'read_file') {
        const content = resultData?.result;
        if (typeof content === 'string') {
          const lineCount = content.split('\n').length;
          const charCount = content.length;
          observations.push(`成功读取文件，共 ${lineCount} 行，${charCount} 字符`);
          
          // 检测文件类型
          const path = action.args?.path as string;
          if (path) {
            if (path.endsWith('.json')) {
              try {
                JSON.parse(content);
                newInformation.push('文件是有效的 JSON 格式');
              } catch {
                newInformation.push('文件不是有效的 JSON 格式');
              }
            } else if (path.endsWith('.ts') || path.endsWith('.js')) {
              const importCount = (content.match(/import/g) || []).length;
              const exportCount = (content.match(/export/g) || []).length;
              newInformation.push(`代码文件包含 ${importCount} 个导入，${exportCount} 个导出`);
            }
          }
        }
      }
      
      // 文件写入成功
      if (action.toolName === 'write_file') {
        const path = action.args?.path as string;
        const content = action.args?.content as string;
        if (path && content) {
          const size = new Blob([content]).size;
          observations.push(`成功写入文件 ${path}，大小 ${size} 字节`);
        }
      }
      
      // 命令执行成功
      if (action.toolName === 'run_bash') {
        const output = resultData?.result;
        if (typeof output === 'string') {
          const lineCount = output.split('\n').length;
          observations.push(`命令执行成功，输出 ${lineCount} 行`);
        }
      }
      
      // 搜索成功
      if (action.toolName === 'search_web') {
        const results = resultData?.result;
        if (Array.isArray(results)) {
          observations.push(`搜索完成，找到 ${results.length} 个结果`);
        }
      }
    }
    
    return { observations, newInformation };
  }

  /**
   * 启发式进度反馈 - 评估任务整体进度
   */
  private generateProgressFeedback(decision: Decision): string | null {
    const totalTasks = decision.plan.subtasks.length;
    const completedTasks = decision.plan.subtasks.filter(t => t.status === 'completed').length;
    const failedTasks = decision.plan.subtasks.filter(t => t.status === 'failed').length;
    
    if (totalTasks === 0) return null;
    
    const progressPercent = Math.round((completedTasks / totalTasks) * 100);
    
    if (failedTasks > 0) {
      return `任务进度: ${progressPercent}% (${completedTasks}/${totalTasks} 完成, ${failedTasks} 失败)`;
    }
    
    if (progressPercent === 100) {
      return '所有任务已完成';
    }
    
    if (progressPercent >= 75) {
      return `任务即将完成: ${progressPercent}%`;
    }
    
    if (progressPercent >= 50) {
      return `任务进度过半: ${progressPercent}%`;
    }
    
    return `任务进行中: ${progressPercent}%`;
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
