import type { Pattern } from '../pattern/types';
import type { Action, Decision, Orientation, Observation } from '../types';
import { getLLMService } from '../llm/service';

export type OODAPhase = 'observe' | 'orient' | 'decide' | 'act' | 'learn';

export interface ToolCallResult {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  status: 'success' | 'error';
  executionTime: number;
}

export interface PatternMatch {
  pattern: Pattern;
  similarity: number;
}

export interface ResponseMetadata {
  duration: number;
  phases: OODAPhase[];
  flowType: string;
  modelUsed: string;
  tokensUsed?: number;
}

export interface AggregatedResponse {
  content: string;
  reasoning: string;
  toolCalls: ToolCallResult[];
  patterns: PatternMatch[];
  metadata: ResponseMetadata;
}

export interface PhaseResult {
  observation?: Observation;
  orientation?: Orientation;
  decision?: Decision;
  action?: unknown;
  patterns?: Pattern[];
}

export class ResponseAggregator {
  private sessionId: string;
  private phases: Map<OODAPhase, unknown> = new Map();
  private startTime: number = 0;
  private flowType: string = 'simple';
  private modelUsed: string = 'unknown';

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  startAggregation(flowType: string, modelUsed: string): void {
    this.phases.clear();
    this.startTime = Date.now();
    this.flowType = flowType;
    this.modelUsed = modelUsed;
  }

  addPhaseResult(phase: OODAPhase, result: unknown): void {
    this.phases.set(phase, result);
  }

  getPhaseResult<T>(phase: OODAPhase): T | undefined {
    return this.phases.get(phase) as T | undefined;
  }

  async finalize(): Promise<AggregatedResponse> {
    const observation = this.phases.get('observe') as Observation | undefined;
    const orientation = this.phases.get('orient') as Orientation | undefined;
    const decision = this.phases.get('decide') as Decision | undefined;
    const actionResult = this.phases.get('act') as { result?: unknown; success?: boolean } | undefined;
    const patterns = this.phases.get('learn') as Pattern[] | undefined;

    const content = this.generateFinalContent(decision, actionResult);
    const reasoning = this.extractReasoning(orientation, decision);
    const toolCalls = this.extractToolCalls(actionResult);
    const patternMatches = this.extractPatternMatches(patterns);

    return {
      content,
      reasoning,
      toolCalls,
      patterns: patternMatches,
      metadata: {
        duration: Date.now() - this.startTime,
        phases: Array.from(this.phases.keys()),
        flowType: this.flowType,
        modelUsed: this.modelUsed,
      },
    };
  }

  private generateFinalContent(
    decision: Decision | undefined, 
    actionResult: { result?: unknown; success?: boolean } | undefined
  ): string {
    if (decision?.nextAction?.type === 'response') {
      return decision.nextAction.content || '任务完成';
    }

    if (decision?.nextAction?.type === 'clarification') {
      return decision.nextAction.clarificationQuestion || '需要更多信息';
    }

    if (actionResult?.success === false) {
      const errorResult = actionResult.result as { message?: string } | undefined;
      return `任务执行遇到问题: ${errorResult?.message || '未知错误'}`;
    }

    if (actionResult?.result) {
      const result = actionResult.result as { result?: unknown; content?: string };
      
      // 检查是否需要生成新闻摘要
      const needsSummary = decision?.nextAction?.args?.['summarize'] === true;
      
      if (needsSummary && result.result) {
        // 异步生成摘要（不阻塞返回）
        this.generateNewsSummary(result.result, decision.nextAction.args)
          .then(summary => {
            if (summary) {
              // 可以通过事件或其他方式更新内容
              console.log('[ResponseAggregator] Generated news summary');
            }
          })
          .catch(err => {
            console.warn('[ResponseAggregator] Failed to generate summary:', err);
          });
        
        // 先返回处理中的提示，实际摘要会通过流式返回
        return this.formatSearchResultsAsSummary(result.result);
      }
      
      if (typeof result.result === 'string') {
        return result.result;
      }
      if (result.content) {
        return result.content;
      }
      if (typeof result === 'string') {
        return result;
      }
      try {
        return JSON.stringify(result.result || result, null, 2);
      } catch {
        return '任务完成';
      }
    }

    return '任务完成';
  }

  /**
   * 将搜索结果格式化为新闻摘要
   */
  private formatSearchResultsAsSummary(result: unknown): string {
    // 提取搜索结果中的标题和摘要
    const searchResults = this.extractSearchResults(result);
    
    if (searchResults.length === 0) {
      return '未找到相关新闻结果';
    }
    
    // 格式化为新闻摘要样式
    const lines: string[] = ['📰 今日新闻摘要:\n'];
    
    for (let i = 0; i < Math.min(searchResults.length, 5); i++) {
      const item = searchResults[i];
      lines.push(`${i + 1}. ${item.title}`);
      if (item.snippet) {
        lines.push(`   ${item.snippet.slice(0, 100)}...`);
      }
    }
    
    lines.push('\n💡 如需了解详细内容，请告诉我具体想看哪条新闻');
    
    return lines.join('\n');
  }

  /**
   * 从工具结果中提取搜索结果
   */
  private extractSearchResults(result: unknown): Array<{title: string; url: string; snippet: string}> {
    try {
      // 处理各种可能的格式
      const data = result as { results?: unknown[]; result?: unknown[] };
      const results = data.results || data.result || [];
      
      return results.map((item: unknown) => {
        const r = item as { title?: string; url?: string; snippet?: string };
        return {
          title: r.title || '无标题',
          url: r.url || '',
          snippet: r.snippet || '',
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * 使用 LLM 生成新闻摘要
   */
  private async generateNewsSummary(
    result: unknown, 
    args?: Record<string, unknown>
  ): Promise<string | null> {
    const searchResults = this.extractSearchResults(result);
    
    if (searchResults.length === 0) {
      return null;
    }
    
    try {
      const llm = await getLLMService();
      
      const summaryStyle = args?.['summaryStyle'] || 'bullet';
      const maxItems = args?.['maxItems'] || 5;
      
      const prompt = `请根据以下新闻搜索结果，生成一个简洁的今日新闻摘要：

${searchResults.slice(0, 10).map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}`).join('\n')}

要求：
1. 提取最重要的 ${maxItems} 条新闻
2. 用${summaryStyle === 'bullet' ? '要点式' : '段落式'}格式呈现
3. 每条新闻用一句话概括
4. 按重要性排序

请直接输出摘要，不要有其他内容。`;
      
      const response = await llm.generate(prompt, { maxTokens: 500 });
      return response.text || null;
    } catch (err) {
      console.warn('[ResponseAggregator] LLM summary generation failed:', err);
      return null;
    }
  }

  private extractReasoning(
    orientation: Orientation | undefined, 
    decision: Decision | undefined
  ): string {
    const parts: string[] = [];

    if (orientation?.primaryIntent) {
      parts.push(`意图: ${orientation.primaryIntent.type} (置信度: ${Math.round(orientation.primaryIntent.confidence * 100)}%)`);
    }

    if (decision?.reasoning) {
      parts.push(`决策: ${decision.reasoning}`);
    }

    if (decision?.selectedOption) {
      parts.push(`选择方案: ${decision.selectedOption.description}`);
    }

    return parts.join('\n');
  }

  private extractToolCalls(
    actionResult: { result?: unknown } | undefined
  ): ToolCallResult[] {
    const toolCalls: ToolCallResult[] = [];

    if (!actionResult?.result) {
      return toolCalls;
    }

    const result = actionResult.result as {
      toolName?: string;
      skillName?: string;
      result?: unknown;
      isError?: boolean;
      executionTime?: number;
    };

    if (result.toolName || result.skillName) {
      toolCalls.push({
        id: `tool-${Date.now()}`,
        name: result.toolName || result.skillName || 'unknown',
        args: {},
        result: result.result,
        status: result.isError ? 'error' : 'success',
        executionTime: result.executionTime || 0,
      });
    }

    return toolCalls;
  }

  private extractPatternMatches(patterns: Pattern[] | undefined): PatternMatch[] {
    if (!patterns) {
      return [];
    }

    return patterns.map(pattern => ({
      pattern,
      similarity: pattern.successRate,
    }));
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getDuration(): number {
    return Date.now() - this.startTime;
  }
}

let aggregators: Map<string, ResponseAggregator> = new Map();

export function getResponseAggregator(sessionId: string): ResponseAggregator {
  if (!aggregators.has(sessionId)) {
    aggregators.set(sessionId, new ResponseAggregator(sessionId));
  }
  return aggregators.get(sessionId)!;
}

export function deleteResponseAggregator(sessionId: string): void {
  aggregators.delete(sessionId);
}

export function clearAllAggregators(): void {
  aggregators.clear();
}
