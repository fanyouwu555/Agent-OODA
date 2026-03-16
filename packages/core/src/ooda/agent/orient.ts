// packages/core/src/ooda/agent/orient.ts
// Orient Agent - 意图分析与规划专家

import { OODAAgentConfig, AgentInput, AgentOutput, OrientResult, AgentDependencies } from '../types';
import { Message } from '../../types';
import { LLMService } from '../../llm/service';
import { getSessionMemory } from '../../memory';

export class OrientAgent {
  protected config: OODAAgentConfig;
  protected sessionId: string;
  protected llmService: LLMService;
  protected sessionMemory: ReturnType<typeof getSessionMemory>;
  private conversationSummary: string = '';

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

  async execute(input: AgentInput): Promise<AgentOutput<OrientResult>> {
    const historyInfo = await this.prepareHistory(input);

    const systemPrompt = this.config.systemPrompt;
    const userPrompt = this.buildUserPrompt(input, historyInfo);

    const llmResult = await this.callLLM(systemPrompt, userPrompt);

    const parsedResult = this.parseLLMResult(llmResult.text);

    const constraints = this.identifyConstraints(input, parsedResult);

    const result: OrientResult = {
      intent: parsedResult.intent,
      constraints,
      knowledgeGaps: parsedResult.knowledgeGaps,
      analysis: parsedResult.analysis,
    };

    const summary = this.buildSummary(result);

    return {
      success: true,
      data: result,
      summary,
      context: {
        highSeverityConstraints: result.constraints.filter(c => c.severity === 'high'),
        needsClarification: result.knowledgeGaps.length > 0 && result.knowledgeGaps.some(k => k.importance > 0.7),
      },
    };
  }

  private async prepareHistory(input: AgentInput): Promise<{ history: Message[]; summary: string }> {
    const config = this.config.compression;
    const messages = input.fullHistory || this.sessionMemory.getShortTerm().getRecentMessages(50);

    if (!config?.enabled || messages.length <= (config.threshold || 20)) {
      return { history: messages, summary: this.conversationSummary };
    }

    const oldMessages = messages.slice(0, -(config.keepRecent || 10));
    const recentMessages = messages.slice(-(config.keepRecent || 10));

    if (oldMessages.length > 0) {
      const newSummary = await this.compressMessages(oldMessages);
      this.conversationSummary = newSummary;
    }

    return { history: recentMessages, summary: this.conversationSummary };
  }

  private async compressMessages(messages: Message[]): Promise<string> {
    const conversationText = messages
      .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 200) : JSON.stringify(m.content).slice(0, 200)}`)
      .join('\n');

    const prompt = `${this.conversationSummary ? `已有摘要:\n${this.conversationSummary}\n\n` : ''}请为以下对话生成300字以内的摘要，保留关键信息：\n\n${conversationText}`;

    const result = await this.callLLM('你是一个对话摘要专家。', prompt, { maxTokens: 500 });
    return result.text;
  }

  private buildUserPrompt(input: AgentInput, historyInfo: { history: Message[]; summary: string }): string {
    const parts: string[] = [];
    parts.push(`## 用户输入\n${input.userInput}`);

    if (input.context?.observations) {
      parts.push(`## 环境观察结果\n${input.context.observations}`);
    }

    if (historyInfo.summary) {
      parts.push(`## 对话历史摘要\n${historyInfo.summary}`);
    }

    parts.push(`## 请分析并以 JSON 格式输出：
{
  "intent": { "type": "意图类型", "description": "描述", "confidence": 0.0-1.0 },
  "knowledgeGaps": [],
  "analysis": "分析内容"
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
    intent: OrientResult['intent'];
    constraints: OrientResult['constraints'];
    knowledgeGaps: OrientResult['knowledgeGaps'];
    analysis: string;
  } {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          intent: { type: parsed.intent?.type || 'general', description: parsed.intent?.description || '', confidence: parsed.intent?.confidence || 0.5 },
          constraints: [],
          knowledgeGaps: (parsed.knowledgeGaps || []).map((k: any) => ({ topic: k.topic || '', description: k.description || '', importance: k.importance || 0.5 })),
          analysis: parsed.analysis || '',
        };
      }
    } catch { }
    return { intent: { type: 'general', description: text.slice(0, 200), confidence: 0.5 }, constraints: [], knowledgeGaps: [], analysis: text };
  }

  private identifyConstraints(input: AgentInput, parsedResult: ReturnType<typeof this.parseLLMResult>): OrientResult['constraints'] {
    const constraints: OrientResult['constraints'] = [];
    if (input.context?.previousResult?.toLowerCase().includes('error')) {
      constraints.push({ type: 'logic', description: '上次操作失败，需要调整策略', severity: 'high' });
    }
    const intentType = parsedResult.intent.type;
    if (intentType === 'file_write' || intentType === 'execute') {
      constraints.push({ type: 'permission', description: '需要写入或执行权限', severity: 'medium' });
    }
    return constraints;
  }

  private buildSummary(result: OrientResult): string {
    const parts: string[] = [];
    parts.push(`意图: ${result.intent.type} (${result.intent.confidence})`);
    if (result.constraints.length > 0) parts.push(`约束: ${result.constraints.map(c => c.description).join('; ')}`);
    if (result.knowledgeGaps.length > 0) parts.push(`知识缺口: ${result.knowledgeGaps.map(k => k.topic).join(', ')}`);
    return parts.join(' | ');
  }
}
