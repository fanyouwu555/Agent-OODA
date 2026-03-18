// packages/core/src/ooda/strategies/action-selector.ts
// 动作选择策略 - 负责决定下一个执行的动作

import { Action, Subtask, ActionPlan } from '../../types';
import { OrientOutput } from '../types';

export interface ActionSelectorConfig {
  knowledgeGapConfidenceThreshold: number;
  intentConfidenceThreshold: number;
  consecutiveFailureThreshold: number;
}

const DEFAULT_CONFIG: ActionSelectorConfig = {
  knowledgeGapConfidenceThreshold: 0.6,
  intentConfidenceThreshold: 0.6,
  consecutiveFailureThreshold: 3,
};

export interface SelectionResult {
  action: Action;
  reason: string;
  strategy: 'knowledge_gap' | 'heuristic' | 'task_based' | 'response';
}

interface StrategyContext {
  orientation: OrientOutput;
  plan: ActionPlan;
  previousActionResult?: {
    success: boolean;
    toolName?: string;
    error?: string;
  };
  availableTools: string[];
}

/**
 * 动作选择器 - 统一的策略协调器
 */
export class ActionSelector {
  private config: ActionSelectorConfig;
  private responseGenerator?: (orientation: OrientOutput) => Promise<string>;

  constructor(
    config: Partial<ActionSelectorConfig> = {},
    responseGenerator?: (orientation: OrientOutput) => Promise<string>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.responseGenerator = responseGenerator;
  }

  async select(
    orientation: OrientOutput,
    plan: ActionPlan,
    previousActionResult?: StrategyContext['previousActionResult'],
    availableTools: string[] = []
  ): Promise<SelectionResult> {
    const context: StrategyContext = {
      orientation,
      plan,
      previousActionResult,
      availableTools,
    };

    // 策略1: 知识缺口驱动
    const knowledgeGapResult = this.selectByKnowledgeGap(context);
    if (knowledgeGapResult) {
      return knowledgeGapResult;
    }

    // 策略2: 启发式规则
    const heuristicResult = this.selectByHeuristic(context);
    if (heuristicResult) {
      return heuristicResult;
    }

    // 策略3: 基于任务
    const taskResult = this.selectByTask(context);
    if (taskResult) {
      return taskResult;
    }

    // 策略4: 生成响应
    const responseResult = await this.selectByResponse(context);
    if (responseResult) {
      return responseResult;
    }

    // 兜底
    return {
      action: {
        type: 'response',
        content: '我理解您的请求，但暂时无法完成。',
      },
      reason: '默认兜底',
      strategy: 'response',
    };
  }

  /**
   * 知识缺口驱动选择
   */
  private selectByKnowledgeGap(context: StrategyContext): SelectionResult | null {
    const { orientation } = context;
    const gaps = orientation.detectedKnowledgeGaps;
    
    if (!gaps || gaps.length === 0) {
      return null;
    }
    
    const primaryGap = gaps[0];
    if (!primaryGap || primaryGap.confidence < this.config.knowledgeGapConfidenceThreshold) {
      return null;
    }
    
    if (!primaryGap.suggestedTool) {
      return null;
    }

    // 特殊处理新闻和实时信息
    if (['news_summary', 'realtime_info', 'web_search'].includes(primaryGap.type)) {
      const searchArgs = primaryGap.suggestedArgs || { 
        query: orientation.primaryIntent.rawInput, 
        limit: 10,
        fetchContent: true,
      };
      
      return {
        action: {
          type: 'tool_call',
          toolName: primaryGap.suggestedTool,
          args: {
            ...searchArgs,
            fetchContent: true,
            summarize: true,
            summaryStyle: 'bullet',
            maxItems: 5,
          },
          reasoningChain: [
            { step: 1, thought: `检测到${primaryGap.type}需求` },
            { step: 2, thought: `使用 ${primaryGap.suggestedTool} 获取内容` },
          ],
        },
        reason: `知识缺口驱动: ${primaryGap.description}`,
        strategy: 'knowledge_gap',
      };
    }

    return {
      action: {
        type: 'tool_call',
        toolName: primaryGap.suggestedTool,
        args: primaryGap.suggestedArgs || {},
        reasoningChain: [
          { step: 1, thought: `检测到知识缺口: ${primaryGap.description}` },
          { step: 2, thought: `选择工具: ${primaryGap.suggestedTool}` },
        ],
      },
      reason: `知识缺口驱动: ${primaryGap.description}`,
      strategy: 'knowledge_gap',
    };
  }

  /**
   * 启发式规则选择
   */
  private selectByHeuristic(context: StrategyContext): SelectionResult | null {
    const { orientation, previousActionResult, plan } = context;
    
    // 重要知识缺口需要澄清
    const importantGaps = orientation.knowledgeGaps.filter(g => g.importance > 0.8);
    if (importantGaps.length > 0) {
      return {
        action: {
          type: 'clarification',
          clarificationQuestion: `请提供更多信息: ${importantGaps[0].topic}`,
        },
        reason: `需要澄清: ${importantGaps[0].topic}`,
        strategy: 'heuristic',
      };
    }
    
    // 高权限风险
    const highRiskPermission = orientation.constraints.find(c => 
      c.type === 'permission' && c.severity === 'high'
    );
    if (highRiskPermission && orientation.primaryIntent.type === 'execute') {
      return {
        action: {
          type: 'clarification',
          clarificationQuestion: `即将执行命令，${highRiskPermission.description}，是否继续？`,
        },
        reason: `高风险权限: ${highRiskPermission.description}`,
        strategy: 'heuristic',
      };
    }
    
    // 连续失败，尝试简化任务
    if (!previousActionResult?.success && plan.subtasks.length > 0) {
      const simplified = this.simplifyTask(plan.subtasks[0]);
      if (simplified) {
        return {
          action: {
            type: 'tool_call',
            toolName: simplified.toolName,
            args: simplified.args,
          },
          reason: '连续失败，尝试简化任务',
          strategy: 'heuristic',
        };
      }
    }
    
    return null;
  }

  private simplifyTask(task: Subtask): Subtask | null {
    if (task.toolName === 'read_file') {
      return { ...task, args: { ...task.args, limit: 50 } };
    }
    if (task.toolName === 'search_web') {
      const query = task.args.query as string;
      if (query) {
        return { ...task, args: { ...task.args, query: query.split(' ').slice(0, 3).join(' ') } };
      }
    }
    return null;
  }

  /**
   * 基于任务选择
   */
  private selectByTask(context: StrategyContext): SelectionResult | null {
    const { plan } = context;
    
    if (plan.subtasks.length === 0) {
      return null;
    }
    
    const pendingTasks = plan.subtasks.filter(t => t.status === 'pending');
    if (pendingTasks.length === 0) {
      return null;
    }
    
    // 按依赖关系选择
    const completed = plan.subtasks
      .filter(t => t.status === 'completed')
      .map(t => t.id);
    
    const executable = pendingTasks.filter(t =>
      t.dependencies.every(dep => completed.includes(dep))
    );
    
    const selected = executable.length > 0 ? executable[0] : pendingTasks[0];
    
    // 优先低风险任务
    const lowRisk = executable.find(t => 
      !['write_file', 'run_bash'].includes(t.toolName)
    );
    
    return {
      action: {
        type: 'tool_call',
        toolName: (lowRisk || selected).toolName,
        args: (lowRisk || selected).args,
      },
      reason: `执行任务: ${(lowRisk || selected).description}`,
      strategy: 'task_based',
    };
  }

  /**
   * 生成响应
   */
  private async selectByResponse(context: StrategyContext): Promise<SelectionResult | null> {
    const { orientation } = context;
    
    let content = '';
    if (this.responseGenerator) {
      content = await this.responseGenerator(orientation);
    } else {
      content = orientation.primaryIntent.rawInput 
        ? `我理解您的请求: ${orientation.primaryIntent.rawInput}`
        : '我理解您的请求';
    }

    return {
      action: {
        type: 'response',
        content,
      },
      reason: '生成响应',
      strategy: 'response',
    };
  }
}
