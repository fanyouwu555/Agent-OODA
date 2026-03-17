// packages/core/src/ooda/act.ts
import { Decision, Action, ActionResult, ActionFeedback, FallbackStrategy } from '../types';
import { UnifiedToolRegistryImpl } from '../tool/registry';
import { SkillContext } from '../skill/interface';
import { getSkillRegistry } from '../skill/registry';
import { getMCPService } from '../mcp/service';
import { getPermissionManager, PermissionMode } from '../permission';

/**
 * 重试配置
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;      // 基础延迟（毫秒）
  maxDelay: number;       // 最大延迟（毫秒）
  backoffMultiplier: number;  // 退避倍数
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};

export class Actor {
  private sessionId: string;
  private toolRegistry: UnifiedToolRegistryImpl;
  private skillRegistry = getSkillRegistry();
  private mcp = getMCPService();
  private permissionManager = getPermissionManager();
  private retryConfig: RetryConfig;
  
  constructor(
    sessionId: string, 
    toolRegistry?: UnifiedToolRegistryImpl,
    retryConfig?: Partial<RetryConfig>
  ) {
    this.sessionId = sessionId;
    this.toolRegistry = toolRegistry || new UnifiedToolRegistryImpl();
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  async act(decision: Decision): Promise<ActionResult> {
    const action = decision.nextAction;
    const startTime = Date.now();
    
    // 检查是否有备用策略
    const fallbackStrategy = action.fallbackStrategy;
    
    try {
      // 尝试执行，带重试
      const result = await this.executeWithRetry(action, fallbackStrategy);
      
      const sideEffects = this.identifySideEffects(action, result);
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
  
  /**
   * 带重试的执行
   */
  private async executeWithRetry(
    action: Action,
    fallbackStrategy?: FallbackStrategy
  ): Promise<unknown> {
    let lastError: Error | null = null;
    let currentAction = action;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        // 尝试执行当前动作
        return await this.executeAction(currentAction);
      } catch (error) {
        lastError = error as Error;
        
        // 检查是否可以重试
        if (!this.isRetryable(error as Error)) {
          throw error;
        }
        
        // 如果是最后一次尝试，抛出错误
        if (attempt >= this.retryConfig.maxRetries) {
          break;
        }
        
        // 计算延迟（指数退避）
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt),
          this.retryConfig.maxDelay
        );
        
        console.log(`[Actor] Retry attempt ${attempt + 1} after ${delay}ms delay`);
        await this.sleep(delay);
        
        // 尝试降级策略
        if (fallbackStrategy && attempt > 0) {
          currentAction = this.applyFallbackStrategy(currentAction, fallbackStrategy, error as Error);
          console.log(`[Actor] Applied fallback strategy: ${fallbackStrategy.condition}`);
        }
      }
    }
    
    throw lastError || new Error('Unknown error after retries');
  }
  
  /**
   * 判断错误是否可重试
   */
  private isRetryable(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    
    // 可重试的错误类型
    const retryablePatterns = [
      'timeout',
      'network',
      'econnrefused',
      'econnreset',
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'rate limit',
    ];
    
    return retryablePatterns.some(pattern => errorMessage.includes(pattern));
  }
  
  /**
   * 应用降级策略
   */
  private applyFallbackStrategy(
    action: Action,
    strategy: FallbackStrategy,
    error: Error
  ): Action {
    const newAction = { ...action };
    
    // 如果有替代工具
    if (strategy.alternativeTool && strategy.alternativeTool !== action.toolName) {
      newAction.toolName = strategy.alternativeTool;
      newAction.args = { ...strategy.alternativeArgs };
      console.log(`[Actor] Falling back to tool: ${strategy.alternativeTool}`);
    }
    
    // 如果是简化任务
    if (strategy.simplifiedTask) {
      // 简化参数
      if (newAction.args) {
        newAction.args = this.simplifyArgs(newAction.toolName || '', newAction.args);
      }
      console.log(`[Actor] Simplified task arguments`);
    }
    
    return newAction;
  }
  
  /**
   * 简化参数
   */
  private simplifyArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
    const simplified: Record<string, unknown> = { ...args };
    
    switch (toolName) {
      case 'read_file':
        // 限制读取行数
        if (!simplified.limit) {
          simplified.limit = 50;
        }
        break;
        
      case 'search_web':
        // 简化搜索查询
        if (simplified.query && typeof simplified.query === 'string') {
          simplified.query = simplified.query.split(' ').slice(0, 3).join(' ');
        }
        break;
        
      case 'run_bash':
        // 不做简化，保持原样
        break;
    }
    
    return simplified;
  }
  
  /**
   * 执行单个动作
   */
  private async executeAction(action: Action): Promise<unknown> {
    switch (action.type) {
      case 'tool_call':
        return await this.executeTool(action);
        
      case 'skill_call':
        return await this.executeSkill(action);
        
      case 'response':
        return await this.generateResponse(action);
        
      case 'clarification':
        return await this.requestClarification(action);
        
      default:
        throw new Error(`Unknown action type: ${(action as Action).type}`);
    }
  }
  
  /**
   * 睡眠辅助函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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

  async *streamGenerateResponse(
    action: Action, 
    onChunk?: (chunk: string) => void
  ): AsyncGenerator<string> {
    if (action.type !== 'response') {
      throw new Error('Invalid action type for streamGenerateResponse');
    }
    
    const content = action.content || '';
    
    if (onChunk) {
      onChunk(content);
    }
    
    await this.mcp.publishEvent('agent.response_stream', {
      content: content,
      timestamp: Date.now(),
      isComplete: true,
    });
    
    yield content;
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
      if (action.type === 'response') {
        const responseContent = (result as any)?.content || action.content || '';
        if (responseContent) {
          feedback.observations.push(responseContent);
        }
      } else {
        if (action.type === 'tool_call') {
          feedback.newInformation.push(`工具 ${action.toolName} 执行成功`);
          
          const resultData = result as any;
          if (resultData.result) {
            const resultStr = typeof resultData.result === 'string' 
              ? resultData.result 
              : JSON.stringify(resultData.result).slice(0, 200);
            feedback.newInformation.push(`结果摘要: ${resultStr}...`);
          }
          
          const heuristicFeedback = this.generateHeuristicSuccessFeedback(action, result);
          feedback.observations.push(...heuristicFeedback.observations);
          feedback.newInformation.push(...heuristicFeedback.newInformation);
        }
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
