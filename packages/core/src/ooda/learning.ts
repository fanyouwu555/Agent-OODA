// packages/core/src/ooda/learning.ts
// 长期学习模块 - 从成功和失败中学习

import { Action, ActionResult, Intent } from '../types';

/**
 * 学习案例 - 存储成功/失败的经验
 */
export interface LearningCase {
  id: string;
  intentType: string;
  action: string;
  args: Record<string, unknown>;
  result: string;
  success: boolean;
  timestamp: number;
  tags: string[];
  /** 提取的模式/教训 */
  lessons: string[];
}

/**
 * 决策案例 - 存储决策上下文
 */
export interface DecisionCase {
  id: string;
  intentType: string;
  constraints: string[];
  selectedOption: string;
  alternatives: string[];
  outcome: 'success' | 'failure' | 'partial';
  timestamp: number;
}

/**
 * 工具使用模式 - 统计工具使用成功率
 */
export interface ToolUsagePattern {
  toolName: string;
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  failureReasons: Record<string, number>;
  avgExecutionTime: number;
}

/**
 * 长期学习模块
 */
export class LearningModule {
  private learningCases: LearningCase[] = [];
  private decisionCases: DecisionCase[] = [];
  private toolPatterns: Map<string, ToolUsagePattern> = new Map();
  
  private readonly MAX_CASES = 500;
  private readonly MAX_TOOL_PATTERNS = 100;
  
  /**
   * 从成功案例中学习
   */
  async learnFromSuccess(
    action: Action,
    result: ActionResult,
    intent: Intent
  ): Promise<string[]> {
    const lessons: string[] = [];
    
    // 提取成功要素
    if (result.feedback?.newInformation?.length > 0) {
      lessons.push(`成功获取新信息: ${result.feedback.newInformation[0]}`);
    }
    
    if (result.sideEffects?.length > 0) {
      lessons.push(`产生副作用: ${result.sideEffects.join('; ')}`);
    }
    
    // 创建学习案例
    const caseId = `success_${Date.now()}`;
    this.learningCases.push({
      id: caseId,
      intentType: intent.type,
      action: action.type === 'tool_call' ? action.toolName || 'unknown' : action.type,
      args: action.args || {},
      result: JSON.stringify(result.result).slice(0, 200),
      success: true,
      timestamp: Date.now(),
      tags: [intent.type, action.type === 'tool_call' ? action.toolName || '' : ''].filter(Boolean),
      lessons,
    });
    
    // 记录工具使用成功
    if (action.type === 'tool_call' && action.toolName) {
      this.recordToolUsage(action.toolName, true);
    }
    
    this.cleanup();
    
    return lessons;
  }
  
  /**
   * 从失败案例中学习
   */
  async learnFromFailure(
    action: Action,
    result: ActionResult,
    intent: Intent,
    error?: string
  ): Promise<string[]> {
    const lessons: string[] = [];
    
    // 提取失败原因
    if (result.feedback?.issues?.length > 0) {
      lessons.push(`问题: ${result.feedback.issues.join('; ')}`);
    }
    
    if (result.feedback?.suggestions?.length > 0) {
      lessons.push(`建议: ${result.feedback.suggestions.join('; ')}`);
    }
    
    if (error) {
      lessons.push(`错误: ${error}`);
    }
    
    // 创建学习案例
    const caseId = `failure_${Date.now()}`;
    this.learningCases.push({
      id: caseId,
      intentType: intent.type,
      action: action.type === 'tool_call' ? action.toolName || 'unknown' : action.type,
      args: action.args || {},
      result: JSON.stringify(result.result).slice(0, 200),
      success: false,
      timestamp: Date.now(),
      tags: [intent.type, action.type === 'tool_call' ? action.toolName || '' : ''].filter(Boolean),
      lessons,
    });
    
    // 记录工具使用失败
    if (action.type === 'tool_call' && action.toolName) {
      this.recordToolUsage(action.toolName, false, error);
    }
    
    this.cleanup();
    
    return lessons;
  }
  
  /**
   * 记录工具使用情况
   */
  recordToolUsage(
    toolName: string,
    success: boolean,
    errorMessage?: string
  ): void {
    let pattern = this.toolPatterns.get(toolName);
    
    if (!pattern) {
      pattern = {
        toolName,
        totalAttempts: 0,
        successCount: 0,
        failureCount: 0,
        failureReasons: {},
        avgExecutionTime: 0,
      };
      this.toolPatterns.set(toolName, pattern);
    }
    
    pattern.totalAttempts++;
    if (success) {
      pattern.successCount++;
    } else {
      pattern.failureCount++;
      if (errorMessage) {
        const reason = this.categorizeError(errorMessage);
        pattern.failureReasons[reason] = (pattern.failureReasons[reason] || 0) + 1;
      }
    }
  }
  
  /**
   * 错误分类
   */
  private categorizeError(error: string): string {
    const lowerError = error.toLowerCase();
    
    if (lowerError.includes('not found') || lowerError.includes('不存在')) {
      return 'not_found';
    }
    if (lowerError.includes('permission') || lowerError.includes('权限')) {
      return 'permission_denied';
    }
    if (lowerError.includes('timeout') || lowerError.includes('超时')) {
      return 'timeout';
    }
    if (lowerError.includes('network') || lowerError.includes('网络')) {
      return 'network_error';
    }
    if (lowerError.includes('syntax') || lowerError.includes('语法')) {
      return 'syntax_error';
    }
    
    return 'other';
  }
  
  /**
   * 检索相似案例
   */
  retrieveSimilarCases(
    intentType: string,
    limit: number = 5
  ): LearningCase[] {
    const relevant = this.learningCases
      .filter(c => c.intentType === intentType)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
    
    return relevant;
  }
  
  /**
   * 获取特定工具的成功率
   */
  getToolSuccessRate(toolName: string): number {
    const pattern = this.toolPatterns.get(toolName);
    if (!pattern || pattern.totalAttempts === 0) {
      return -1; // 未使用过
    }
    return pattern.successCount / pattern.totalAttempts;
  }
  
  /**
   * 获取工具失败原因统计
   */
  getToolFailureReasons(toolName: string): Record<string, number> {
    const pattern = this.toolPatterns.get(toolName);
    return pattern?.failureReasons || {};
  }
  
  /**
   * 获取所有工具使用模式
   */
  getAllToolPatterns(): ToolUsagePattern[] {
    return Array.from(this.toolPatterns.values());
  }
  
  /**
   * 决策记录
   */
  recordDecision(
    intentType: string,
    constraints: string[],
    selectedOption: string,
    alternatives: string[],
    outcome: 'success' | 'failure' | 'partial'
  ): void {
    const caseId = `decision_${Date.now()}`;
    this.decisionCases.push({
      id: caseId,
      intentType,
      constraints,
      selectedOption,
      alternatives,
      outcome,
      timestamp: Date.now(),
    });
    
    // 限制存储数量
    if (this.decisionCases.length > this.MAX_CASES) {
      this.decisionCases.shift();
    }
  }
  
  /**
   * 获取最佳决策选项
   */
  getBestOption(
    intentType: string,
    constraints: string[]
  ): string | null {
    const relevant = this.decisionCases.filter(
      d => d.intentType === intentType && d.outcome === 'success'
    );
    
    if (relevant.length === 0) {
      return null;
    }
    
    // 统计最常成功的选项
    const optionCounts: Record<string, number> = {};
    for (const decision of relevant) {
      // 检查约束是否匹配
      const hasMatchingConstraints = constraints.every(
        c => decision.constraints.some(dc => dc.includes(c))
      );
      if (hasMatchingConstraints || decision.constraints.length === 0) {
        optionCounts[decision.selectedOption] = 
          (optionCounts[decision.selectedOption] || 0) + 1;
      }
    }
    
    // 返回最常成功的选项
    let bestOption: string | null = null;
    let maxCount = 0;
    for (const [option, count] of Object.entries(optionCounts)) {
      if (count > maxCount) {
        maxCount = count;
        bestOption = option;
      }
    }
    
    return bestOption;
  }
  
  /**
   * 获取失败模式
   */
  getFailurePatterns(intentType?: string): string[] {
    const relevant = this.learningCases.filter(
      c => !c.success && (!intentType || c.intentType === intentType)
    );
    
    return relevant.flatMap(c => c.lessons);
  }
  
  /**
   * 清理过期案例
   */
  private cleanup(): void {
    if (this.learningCases.length > this.MAX_CASES) {
      // 按时间排序，保留最新的
      this.learningCases.sort((a, b) => b.timestamp - a.timestamp);
      this.learningCases = this.learningCases.slice(0, this.MAX_CASES);
    }
  }
  
  /**
   * 导出所有学习数据
   */
  toJSON(): {
    learningCases: LearningCase[];
    decisionCases: DecisionCase[];
    toolPatterns: ToolUsagePattern[];
  } {
    return {
      learningCases: this.learningCases,
      decisionCases: this.decisionCases,
      toolPatterns: Array.from(this.toolPatterns.values()),
    };
  }
  
  /**
   * 导入学习数据
   */
  fromJSON(data: {
    learningCases?: LearningCase[];
    decisionCases?: DecisionCase[];
    toolPatterns?: ToolUsagePattern[];
  }): void {
    if (data.learningCases) {
      this.learningCases = data.learningCases;
    }
    if (data.decisionCases) {
      this.decisionCases = data.decisionCases;
    }
    if (data.toolPatterns) {
      for (const pattern of data.toolPatterns) {
        this.toolPatterns.set(pattern.toolName, pattern);
      }
    }
  }
  
  /**
   * 清空所有学习数据
   */
  clear(): void {
    this.learningCases = [];
    this.decisionCases = [];
    this.toolPatterns.clear();
  }
}

// 全局学习模块实例
let globalLearningModule: LearningModule | null = null;

export function getLearningModule(): LearningModule {
  if (!globalLearningModule) {
    globalLearningModule = new LearningModule();
  }
  return globalLearningModule;
}

export function resetLearningModule(): void {
  if (globalLearningModule) {
    globalLearningModule.clear();
  }
  globalLearningModule = null;
}
