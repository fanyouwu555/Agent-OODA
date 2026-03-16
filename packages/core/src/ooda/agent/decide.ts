// packages/core/src/ooda/agent/decide.ts
// Decide Agent - 方案规划与风险评估专家

import { OODAAgentConfig, AgentInput, AgentOutput, DecideResult, AgentDependencies } from '../types';
import { LLMService } from '../../llm/service';
import { getSessionMemory } from '../../memory';

export class DecideAgent {
  protected config: OODAAgentConfig;
  protected sessionId: string;
  protected llmService: LLMService;
  protected sessionMemory: ReturnType<typeof getSessionMemory>;

  constructor(
    config: OODAAgentConfig,
    sessionId: string,
    dependencies: AgentDependencies
  ) {
    this.config = config;
    this.sessionId = sessionId;
    this.llmService = dependencies.llmService;
    this.sessionMemory = getSessionMemory(sessionId);
  }

  async execute(input: AgentInput): Promise<AgentOutput<DecideResult>> {
    const systemPrompt = this.config.systemPrompt;
    const userPrompt = this.buildUserPrompt(input);

    const llmResult = await this.callLLM(systemPrompt, userPrompt);

    const parsedResult = this.parseLLMResult(llmResult.text);

    const heuristicDecision = this.applyHeuristicRules(input, parsedResult);

    const plan = this.decomposeTask(heuristicDecision.selectedOption);

    const result: DecideResult = {
      options: parsedResult.options,
      selectedOption: heuristicDecision.selectedOption,
      plan,
      risks: parsedResult.risks,
    };

    const summary = this.buildSummary(result);

    return {
      success: true,
      data: result,
      summary,
      context: {
        nextTool: plan.steps[0]?.toolName,
        nextArgs: plan.steps[0]?.args,
        requiresConfirmation: heuristicDecision.requiresConfirmation,
        needsSimplification: heuristicDecision.needsSimplification,
      },
    };
  }

  private buildUserPrompt(input: AgentInput): string {
    const parts: string[] = [];
    parts.push(`## 用户输入\n${input.userInput}`);
    if (input.context?.observations) parts.push(`## 环境观察\n${input.context.observations}`);
    if (input.context?.intent) parts.push(`## 意图分析\n${input.context.intent}`);
    parts.push(`## 请生成执行方案并以 JSON 格式输出：
{
  "options": [{"id": "option-1", "description": "方案描述", "approach": "方法", "pros": [], "cons": [], "riskLevel": "low|medium|high", "score": 0.0-1.0}],
  "recommendedOption": "option-1",
  "reasoning": "理由",
  "risks": ["风险"]
}`);
    return parts.join('\n\n');
  }

  private async callLLM(systemPrompt: string, userPrompt: string, options?: { maxTokens?: number }): Promise<{ text: string; tokens: number; time: number }> {
    const modelConfig = this.config.model;
    const response = await this.llmService.generate(userPrompt, {
      systemPrompt,
      temperature: modelConfig.temperature,
      maxTokens: options?.maxTokens ?? modelConfig.maxTokens,
    });
    return { text: response.text, tokens: response.tokens, time: response.time };
  }

  private parseLLMResult(text: string): {
    options: DecideResult['options'];
    recommendedOption: string;
    reasoning: string;
    risks: string[];
  } {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          options: (parsed.options || []).map((o: any, i: number) => ({ id: o.id || `option-${i + 1}`, description: o.description || '', approach: o.approach || '', pros: o.pros || [], cons: o.cons || [], riskLevel: o.riskLevel || 'medium', score: o.score || 0.5 })),
          recommendedOption: parsed.recommendedOption || parsed.options?.[0]?.id || 'option-1',
          reasoning: parsed.reasoning || '',
          risks: parsed.risks || [],
        };
      }
    } catch { }
    return { options: [{ id: 'option-1', description: '默认方案', approach: '执行用户请求', pros: ['直接响应'], cons: ['可能不是最优'], riskLevel: 'medium' as const, score: 0.5 }], recommendedOption: 'option-1', reasoning: '基于用户输入生成', risks: [] };
  }

  private applyHeuristicRules(input: AgentInput, parsedResult: ReturnType<typeof this.parseLLMResult>): {
    selectedOption: DecideResult['selectedOption'];
    requiresConfirmation: boolean;
    needsSimplification: boolean;
  } {
    const config = this.config.heuristicRules;
    let selectedOption = parsedResult.options.find(o => o.id === parsedResult.recommendedOption) || parsedResult.options[0];
    let requiresConfirmation = false;
    let needsSimplification = false;

    if (config?.enabled) {
      if (input.context?.previousResult?.toLowerCase().includes('unclear')) requiresConfirmation = true;

      const history = this.sessionMemory.getShortTerm().getRecentMessages(10);
      const failureCount = history.filter(m => m.parts?.some(p => p.type === 'tool_result' && (p as any).isError)).length;

      if (failureCount >= (config.rules.consecutiveFailureThreshold || 3)) {
        needsSimplification = true;
        selectedOption = { ...selectedOption, description: `[简化] ${selectedOption.description}` };
      }

      if (selectedOption.riskLevel === 'high') requiresConfirmation = true;
    }

    return { selectedOption, requiresConfirmation, needsSimplification };
  }

  private decomposeTask(selectedOption: DecideResult['selectedOption']): DecideResult['plan'] {
    const steps: DecideResult['plan']['steps'] = [{ id: 'step-1', description: selectedOption.description, toolName: this.inferTool(selectedOption.description), args: {} }];
    return { steps };
  }

  private inferTool(description: string): string {
    const d = description.toLowerCase();
    if (d.includes('read') || d.includes('读取') || d.includes('查看')) return 'read';
    if (d.includes('write') || d.includes('写') || d.includes('创建')) return 'write';
    if (d.includes('exec') || d.includes('执行') || d.includes('运行')) return 'execute';
    if (d.includes('search') || d.includes('搜索')) return 'grep';
    if (d.includes('list') || d.includes('列出')) return 'list';
    return 'response';
  }

  private buildSummary(result: DecideResult): string {
    const parts: string[] = [];
    parts.push(`方案: ${result.selectedOption.description}`);
    if (result.risks.length > 0) parts.push(`风险: ${result.risks.join('; ')}`);
    parts.push(`步骤: ${result.plan.steps.map(s => s.description).join(' → ')}`);
    return parts.join(' | ');
  }
}
