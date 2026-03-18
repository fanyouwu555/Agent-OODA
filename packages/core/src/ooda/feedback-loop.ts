// packages/core/src/ooda/feedback-loop.ts
// 反馈循环 - 实现 Act 结果到 Observe 输入的转换

import { ActionResult, ToolResult, Anomaly, Pattern } from '../types';
import { OrientInput } from './types';

export interface FeedbackContext {
  /** 上一轮执行的动作 */
  action: {
    type: string;
    toolName?: string;
    args?: Record<string, unknown>;
  };
  /** 执行结果 */
  result: ActionResult;
  /** 轮次信息 */
  iteration: number;
  /** 是否是最后一轮 */
  isLastRound: boolean;
}

/**
 * 反馈到观察的转换器
 */
export class FeedbackLoopConverter {
  /**
   * 将 ActionResult 转换为 Observe 阶段可以使用的输入
   */
  convertToOrientInput(
    previousResult: ActionResult,
    currentOrientInput: OrientInput,
    iteration: number
  ): OrientInput {
    // 从结果中提取问题和建议
    const { feedback, success, result } = previousResult;
    
    // 构建新的 priorFeedback
    const priorFeedback: OrientInput['priorFeedback'] = {
      issues: [],
      suggestions: [],
    };
    
    if (!success) {
      // 执行失败，添加问题
      priorFeedback.issues.push(...feedback.issues);
      priorFeedback.suggestions.push(...feedback.suggestions);
    } else {
      // 执行成功，添加观察结果
      priorFeedback.issues.push(...feedback.observations);
    }
    
    // 返回更新后的输入
    return {
      ...currentOrientInput,
      priorFeedback,
    };
  }

  /**
   * 从执行结果中提取工具调用信息
   */
  extractToolResults(previousResult: ActionResult): ToolResult[] {
    const results: ToolResult[] = [];
    
    if (previousResult.result && typeof previousResult.result === 'object') {
      const r = previousResult.result as Record<string, unknown>;
      results.push({
        toolName: r.toolName as string || 'unknown',
        result: r.result,
        isError: !previousResult.success,
        executionTime: (r.executionTime as number) || 0,
      });
    }
    
    return results;
  }

  /**
   * 从执行结果中检测异常
   */
  detectAnomaliesFromResult(result: ActionResult): Anomaly[] {
    const anomalies: Anomaly[] = [];
    
    if (!result.success) {
      const errorMsg = result.feedback.issues.join('; ');
      anomalies.push({
        type: 'error',
        description: `执行失败: ${errorMsg}`,
        severity: 'high',
        context: `工具: ${JSON.stringify(result.result)}`,
      });
    }
    
    // 检测副作用
    for (const sideEffect of result.sideEffects) {
      if (sideEffect.includes('失败') || sideEffect.includes('error')) {
        anomalies.push({
          type: 'warning',
          description: sideEffect,
          severity: 'medium',
          context: '副作用警告',
        });
      }
    }
    
    return anomalies;
  }

  /**
   * 从执行结果中识别模式
   */
  recognizePatternsFromResult(result: ActionResult): Pattern[] {
    const patterns: Pattern[] = [];
    
    // 成功模式
    if (result.success) {
      patterns.push({
        type: 'success_pattern',
        description: '执行成功',
        significance: 0.9,
      });
    }
    
    // 新信息模式
    if (result.feedback.newInformation.length > 0) {
      patterns.push({
        type: 'information_gain',
        description: `获取了新信息: ${result.feedback.newInformation.length}项`,
        significance: 0.7,
      });
    }
    
    // 建议模式
    if (result.feedback.suggestions.length > 0) {
      patterns.push({
        type: 'suggestion_available',
        description: `有 ${result.feedback.suggestions.length} 条建议`,
        significance: 0.5,
      });
    }
    
    return patterns;
  }

  /**
   * 评估是否需要继续循环
   */
  shouldContinueLoop(
    context: FeedbackContext,
    maxIterations: number = 10
  ): { shouldContinue: boolean; reason: string } {
    const { iteration, isLastRound, result } = context;
    
    // 达到最大迭代次数
    if (iteration >= maxIterations) {
      return { shouldContinue: false, reason: '达到最大迭代次数' };
    }
    
    // 执行成功且没有遗留问题
    if (result.success && result.feedback.issues.length === 0) {
      return { shouldContinue: false, reason: '任务成功完成' };
    }
    
    // 执行失败且无法提供建议
    if (!result.success && result.feedback.suggestions.length === 0) {
      return { shouldContinue: false, reason: '执行失败且无建议' };
    }
    
    // 是最后一轮
    if (isLastRound) {
      return { shouldContinue: false, reason: '最后一轮' };
    }
    
    return { shouldContinue: true, reason: '需要继续' };
  }

  /**
   * 生成学习摘要
   */
  generateLearningSummary(context: FeedbackContext): string {
    const { action, result, iteration } = context;
    const parts: string[] = [];
    
    parts.push(`第${iteration}轮:`);
    parts.push(`动作: ${action.type}${action.toolName ? '(' + action.toolName + ')' : ''}`);
    parts.push(`结果: ${result.success ? '成功' : '失败'}`);
    
    if (result.feedback.issues.length > 0) {
      parts.push(`问题: ${result.feedback.issues.join('; ')}`);
    }
    
    if (result.feedback.suggestions.length > 0) {
      parts.push(`建议: ${result.feedback.suggestions.join('; ')}`);
    }
    
    return parts.join(' | ');
  }
}

// 全局单例
let feedbackLoopConverter: FeedbackLoopConverter | null = null;

export function getFeedbackLoopConverter(): FeedbackLoopConverter {
  if (!feedbackLoopConverter) {
    feedbackLoopConverter = new FeedbackLoopConverter();
  }
  return feedbackLoopConverter;
}
