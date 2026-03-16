// packages/core/src/ooda/agent/act.ts
// Act Agent - 执行与结果评估专家

import { BaseOODAAgent } from './base';
import { OODAAgentConfig, AgentInput, AgentOutput, ActResult, AgentDependencies } from '../types';

export class ActAgent extends BaseOODAAgent {
  constructor(
    config: OODAAgentConfig,
    sessionId: string,
    dependencies: AgentDependencies
  ) {
    super(config, sessionId, dependencies);
  }

  async execute(input: AgentInput): Promise<AgentOutput<ActResult>> {
    const plan = this.parsePlan(input);

    let executionResult: ActResult['execution'];

    if (plan.toolName && plan.args) {
      executionResult = await this.executeAction(plan.toolName, plan.args);
    } else {
      executionResult = { result: plan.response || input.userInput, success: true };
    }

    const evaluation = await this.evaluateResult(input, executionResult);
    const feedback = this.generateFeedback(executionResult, evaluation);
    const isComplete = this.determineCompletion(evaluation, executionResult);

    const result: ActResult = { execution: executionResult, evaluation, feedback };

    const summary = this.buildSummary(result);

    return {
      success: executionResult.success,
      data: result,
      summary,
      isComplete,
      context: { toolName: executionResult.toolName, result: executionResult.result, feedback },
    };
  }

  private parsePlan(input: AgentInput): { toolName?: string; args?: Record<string, unknown>; response?: string } {
    const decision = input.context?.decision || '';
    try {
      const match = decision.match(/\{[\s\S]*"steps"[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const steps = parsed.plan?.steps || parsed.steps || [];
        if (steps.length > 0) return { toolName: steps[0].toolName, args: steps[0].args || {} };
      }
    } catch { }
    const toolPatterns = [/工具:\s*(\w+)/, /使用\s*(\w+)/, /执行\s*(\w+)/];
    for (const pattern of toolPatterns) {
      const match = decision.match(pattern);
      if (match) return { toolName: match[1], args: { input: input.userInput } };
    }
    return { response: decision || '任务已处理完成' };
  }

  private async executeAction(toolName: string, args: Record<string, unknown>): Promise<ActResult['execution']> {
    try {
      const permission = this.checkPermission(toolName);
      if (permission === 'deny') return { toolName, args, result: null, success: false, error: `Permission denied: ${toolName}` };
      if (!this.toolRegistry.has(toolName)) return { toolName, args, result: null, success: false, error: `Tool not found: ${toolName}` };
      const result = await this.executeTool(toolName, args);
      return { toolName, args, result, success: true };
    } catch (error) {
      return { toolName, args, result: null, success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async evaluateResult(input: AgentInput, execution: ActResult['execution']): Promise<ActResult['evaluation']> {
    const config = this.config.completion;
    if (!config?.enabled) return { targetMet: execution.success, confidence: execution.success ? 0.8 : 0.3, reasoning: execution.success ? '执行成功' : '执行失败' };
    const prompt = `## 用户输入\n${input.userInput}\n\n## 执行结果\n${JSON.stringify(execution.result, null, 2)}\n\n## 请判断任务是否完成：{"targetMet": true|false, "confidence": 0.0-1.0, "reasoning": "理由"}`;
    try {
      const result = await this.callLLM('你是一个任务评估专家，判断任务是否完成。', prompt, { maxTokens: 500 });
      const parsed = JSON.parse(result.text.match(/\{[\s\S]*\}/)?.[0] || '{}');
      return { targetMet: parsed.targetMet ?? execution.success, confidence: parsed.confidence ?? 0.5, reasoning: parsed.reasoning || '' };
    } catch {
      return { targetMet: execution.success, confidence: execution.success ? 0.7 : 0.3, reasoning: execution.success ? '执行成功' : '执行失败' };
    }
  }

  private generateFeedback(execution: ActResult['execution'], evaluation: ActResult['evaluation']): ActResult['feedback'] {
    const feedback: ActResult['feedback'] = { observations: [], suggestions: [], issues: [] };
    if (this.config.heuristicFeedback?.enabled) {
      if (execution.success) {
        feedback.observations.push('操作成功完成');
        if (execution.toolName) feedback.observations.push(`工具 ${execution.toolName} 执行成功`);
      } else {
        feedback.issues.push(execution.error || '执行失败');
        const err = execution.error?.toLowerCase() || '';
        if (err.includes('permission') || err.includes('权限')) feedback.suggestions.push('请检查权限设置');
        else if (err.includes('not found') || err.includes('不存在')) feedback.suggestions.push('请检查资源路径');
        else if (err.includes('timeout') || err.includes('超时')) feedback.suggestions.push('请尝试简化操作');
        else feedback.suggestions.push('请检查错误信息并重试');
      }
    }
    if (evaluation.targetMet) feedback.observations.push('任务目标已达成');
    else feedback.suggestions.push('任务目标未达成，可能需要重新尝试');
    return feedback;
  }

  private determineCompletion(evaluation: ActResult['evaluation'], execution: ActResult['execution']): boolean {
    const config = this.config.completion;
    if (!config?.enabled) return execution.success;
    if (evaluation.confidence >= (config.confidenceThreshold || 0.8)) return evaluation.targetMet;
    return execution.success && evaluation.targetMet;
  }

  private buildSummary(result: ActResult): string {
    const parts: string[] = [];
    parts.push(result.execution.success ? '✅ 执行成功' : `❌ 执行失败: ${result.execution.error}`);
    if (result.evaluation.targetMet) parts.push('🎯 目标达成');
    if (result.feedback.suggestions.length > 0) parts.push(`💡 建议: ${result.feedback.suggestions.join('; ')}`);
    return parts.join(' | ');
  }
}
