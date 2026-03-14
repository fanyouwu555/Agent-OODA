import { Observation, Orientation, Intent, Constraint, KnowledgeGap, Pattern, Relationship } from '../types';
import { getLLMService } from '../llm/service';
import { ChatMessage } from '../llm/provider';
import { getSessionMemory, SessionMemory } from '../memory';
import { MemoryCompressor } from '../memory/long-term';

interface AnalysisResult {
  intentType: string;
  parameters: Record<string, unknown>;
  confidence: number;
  patterns: Pattern[];
  relationships: Relationship[];
  assumptions: string[];
  risks: string[];
  contextSummary?: string;
}

const MAX_HISTORY_TOKENS = 4000;
const COMPRESS_THRESHOLD = 50; // 从 20 改为 50，减少压缩频率
const KEEP_RECENT_MESSAGES = 10;

interface OrienterState {
  conversationSummary: string;
  compressedCount: number;
}

class OrienterStateManager {
  private states: Map<string, OrienterState> = new Map();
  
  getState(sessionId: string): OrienterState {
    if (!this.states.has(sessionId)) {
      this.states.set(sessionId, {
        conversationSummary: '',
        compressedCount: 0,
      });
    }
    return this.states.get(sessionId)!;
  }
  
  resetState(sessionId: string): void {
    this.states.set(sessionId, {
      conversationSummary: '',
      compressedCount: 0,
    });
  }
  
  initCompressedCount(sessionId: string, count: number): void {
    const state = this.getState(sessionId);
    state.compressedCount = count;
  }
  
  clearState(sessionId: string): void {
    this.states.delete(sessionId);
  }
}

const orienterStateManager = new OrienterStateManager();

export function resetOrienterState(sessionId: string): void {
  orienterStateManager.resetState(sessionId);
}

export function initOrienterCompressedCount(sessionId: string, count: number): void {
  orienterStateManager.initCompressedCount(sessionId, count);
}

export class Orienter {
  private sessionId: string;
  private sessionMemory: SessionMemory;
  private state: OrienterState;
  
  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.sessionMemory = getSessionMemory(sessionId);
    this.state = orienterStateManager.getState(sessionId);
  }
  
  private async getLLM() {
    return getLLMService();
  }
  
  async orient(observation: Observation): Promise<Orientation> {
        const analysisResult = await this.performDeepAnalysis(observation);
        
        const intent = this.buildIntent(analysisResult, observation.userInput);
        const constraints = this.identifyConstraints(observation, analysisResult);
        const knowledgeGaps = this.identifyKnowledgeGaps(observation, intent, analysisResult);
        const patterns = this.synthesizePatterns(observation, analysisResult);
        const relationships = this.mapRelationships(observation, analysisResult);
        
        return {
            primaryIntent: intent,
            relevantContext: {
                ...observation.context,
                contextSummary: analysisResult.contextSummary,
            },
            constraints,
            knowledgeGaps,
            patterns,
            relationships,
            assumptions: analysisResult.assumptions,
            risks: analysisResult.risks,
        };
    }

  private async performDeepAnalysis(observation: Observation): Promise<AnalysisResult> {
    const llmService = await this.getLLM();
    
    const allHistory = this.sessionMemory.getShortTerm().getRecentMessages(100);
    const historyToUse = allHistory.length > 0 ? allHistory : observation.history;
    
    console.log(`[Orienter] performDeepAnalysis: allHistory=${allHistory.length}, observation.history=${observation.history.length}, historyToUse=${historyToUse.length}`);
    
    const { history, summary } = await this.prepareHistoryForLLM(historyToUse, llmService);
    
    console.log(`[Orienter] prepareHistoryForLLM returned: history.length=${history.length}, summary=${summary ? 'exists' : 'empty'}`);
    
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildAnalysisPrompt(observation, summary);
    
    const response = await llmService.generate(userPrompt, {
      systemPrompt,
      history,
      maxTokens: 100,  // 本地模型限制，意图分析不需要太长
    });
    
    return this.parseAnalysisResult(response.text, observation);
  }
  
  private async prepareHistoryForLLM(
    messages: Array<{ role: string; content: string; timestamp?: number }>,
    llmService: Awaited<ReturnType<typeof getLLMService>>
  ): Promise<{ history: ChatMessage[]; summary: string }> {
    const history: ChatMessage[] = [];
    let summary = this.state.conversationSummary;
    
    if (messages.length > COMPRESS_THRESHOLD) {
      const oldMessages = messages.slice(0, -KEEP_RECENT_MESSAGES);
      const recentMessages = messages.slice(-KEEP_RECENT_MESSAGES);
      
      if (oldMessages.length > this.state.compressedCount) {
        const newToCompress = oldMessages.slice(this.state.compressedCount);
        
        if (newToCompress.length > 0) {
          const compressionResult = await this.compressMessages(newToCompress, llmService);
          summary = compressionResult;
          this.state.conversationSummary = summary;
          this.state.compressedCount = oldMessages.length;
          
          console.log(`[Orient] Compressed ${newToCompress.length} messages into summary`);
        }
      }
      
      for (const msg of recentMessages) {
        history.push({
          role: msg.role === 'tool' ? 'assistant' : msg.role as 'user' | 'assistant' | 'system',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      }
    } else {
      for (const msg of messages) {
        history.push({
          role: msg.role === 'tool' ? 'assistant' : msg.role as 'user' | 'assistant' | 'system',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      }
    }
    
    return { history, summary };
  }
  
  private async compressMessages(
    messages: Array<{ role: string; content: string }>,
    llmService: Awaited<ReturnType<typeof getLLMService>>
  ): Promise<string> {
    const conversationText = messages
      .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content).slice(0, 500)}`)
      .join('\n');
    
    const existingSummary = this.state.conversationSummary;
    
    const prompt = `${existingSummary ? `已有对话摘要：\n${existingSummary}\n\n` : ''}请为以下对话内容生成一个简洁的摘要，保留关键信息、用户意图和重要决策：

${conversationText}

摘要要求：
1. 保留用户的主要请求和意图
2. 保留重要的决策和结论
3. 保留关键的技术细节
4. 简洁明了，不超过300字

请直接输出摘要内容，不要有其他内容。`;

    try {
      const response = await llmService.generate(prompt, {
        maxTokens: 200,  // 本地模型限制
      });
      return response.text || existingSummary || '';
    } catch (error) {
      console.error('[Orient] Failed to compress messages:', error);
      return existingSummary || '';
    }
  }

  private buildSystemPrompt(): string {
    return `你是一个智能对话分析系统，负责分析用户的意图和上下文。

你的任务是：
1. 准确理解用户的真实意图
2. 识别对话中的模式和关系
3. 评估潜在的风险和约束
4. 提取关键参数和信息

请以JSON格式输出分析结果，确保格式正确。`;
  }

  private buildAnalysisPrompt(observation: Observation, conversationSummary?: string): string {
    const recentHistory = observation.history
      .slice(-5)
      .map(m => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content).slice(0, 200);
        return `${m.role}: ${content}`;
      })
      .join('\n');
    
    const toolResultsSummary = observation.toolResults
      .slice(-3)
      .map(r => {
        const resultPreview = typeof r.result === 'string' 
          ? r.result.slice(0, 100) 
          : JSON.stringify(r.result).slice(0, 100);
        return `${r.toolName}: ${r.isError ? 'ERROR' : 'SUCCESS'} - ${resultPreview}`;
      })
      .join('\n');

    const relevantFacts = observation.context?.relevantFacts?.slice(0, 3).join('\n') || '无';

    const summarySection = conversationSummary 
      ? `\n## 对话历史摘要\n${conversationSummary}\n` 
      : '';

    return `请分析以下用户输入和上下文信息：

## 当前用户输入
${observation.userInput}
${summarySection}
## 最近对话
${recentHistory || '无历史记录'}

## 工具执行结果
${toolResultsSummary || '无工具调用'}

## 相关背景信息
${relevantFacts}

## 环境状态
- 内存使用: ${Math.round(observation.environment.resourceUsage.memory * 100)}%
- CPU使用: ${Math.round(observation.environment.resourceUsage.cpu * 100)}%

## 分析任务

请进行以下分析并以JSON格式输出：

1. **意图分析**: 理解用户真正想要什么
   - type: 意图类型，可选值包括:
     - question: 用户在提问，需要直接回答
     - file_read: 用户想读取文件
     - file_write: 用户想写入或修改文件
     - execute: 用户想执行命令
     - search: 用户想搜索信息
     - code_analysis: 用户想分析代码
     - general: 一般性请求或对话
   - parameters: 从输入中提取的关键参数
   - confidence: 置信度 (0-1)

2. **上下文摘要**: 简要总结当前对话的上下文

3. **模式识别**: 识别观察数据中的模式

4. **关系映射**: 识别组件之间的关系

5. **假设识别**: 当前分析中的假设

6. **风险评估**: 潜在风险

## 输出格式
{
  "intentType": "意图类型",
  "parameters": {"key": "value"},
  "confidence": 0.85,
  "contextSummary": "当前对话的上下文摘要",
  "patterns": [
    {"type": "pattern_type", "description": "模式描述", "significance": 0.8}
  ],
  "relationships": [
    {"from": "组件A", "to": "组件B", "type": "dependency", "strength": 0.9}
  ],
  "assumptions": ["假设1", "假设2"],
  "risks": ["风险1", "风险2"]
}

请只输出JSON，不要有其他内容。`;
  }

  private parseAnalysisResult(response: string, observation: Observation): AnalysisResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          intentType: parsed.intentType || 'general',
          parameters: parsed.parameters || {},
          confidence: parsed.confidence || 0.5,
          contextSummary: parsed.contextSummary,
          patterns: parsed.patterns || [],
          relationships: parsed.relationships || [],
          assumptions: parsed.assumptions || [],
          risks: parsed.risks || [],
        };
      }
    } catch (e) {
      console.warn('[Orient] Failed to parse LLM response:', e);
    }
    
    return this.fallbackAnalysis(observation);
  }

  private fallbackAnalysis(observation: Observation): AnalysisResult {
    const input = observation.userInput.toLowerCase();
    const timestamp = Date.now();
    
    let intentType = 'general';
    const parameters: Record<string, unknown> = {};
    
    const patterns: Pattern[] = [
      {
        type: 'input_analysis',
        description: `用户输入长度: ${observation.userInput.length} 字符`,
        significance: 0.5,
      },
    ];
    
    if (observation.history.length > 0) {
      patterns.push({
        type: 'context_analysis',
        description: `存在 ${observation.history.length} 条历史消息`,
        significance: 0.4,
      });
    }
    
    const questionIndicators = ['什么', '如何', '为什么', '怎么', '哪', '？', '?', 'what', 'how', 'why', 'where', 'when'];
    const hasQuestion = questionIndicators.some(indicator => input.includes(indicator));
    
    if (hasQuestion) {
      intentType = 'question';
      patterns.push({
        type: 'intent_pattern',
        description: '检测到问题询问意图',
        significance: 0.8,
      });
    } else if (input.includes('读取') || input.includes('查看') || input.includes('打开') || input.includes('read')) {
      intentType = 'file_read';
      const pathMatch = observation.userInput.match(/['"]([^'"]+)['"]/);
      if (pathMatch) parameters.path = pathMatch[1];
    } else if (input.includes('写入') || input.includes('保存') || input.includes('修改') || input.includes('write')) {
      intentType = 'file_write';
      const pathMatch = observation.userInput.match(/['"]([^'"]+)['"]/);
      if (pathMatch) parameters.path = pathMatch[1];
    } else if (input.includes('运行') || input.includes('执行') || input.includes('命令') || input.includes('run') || input.includes('bash')) {
      intentType = 'execute';
    } else if (input.includes('搜索') || input.includes('查找') || input.includes('查询') || input.includes('search') || input.includes('find')) {
      intentType = 'search';
    } else if (input.includes('分析') || input.includes('解释') || input.includes('代码') || input.includes('analyze') || input.includes('explain')) {
      intentType = 'code_analysis';
    }
    
    const relationships: Relationship[] = [];
    if (observation.toolResults.length > 0) {
      relationships.push({
        from: 'previous_tool',
        to: 'current_request',
        type: 'correlation',
        strength: 0.6,
      });
    }
    
    return {
      intentType,
      parameters,
      confidence: 0.6,
      contextSummary: `用户输入: ${observation.userInput.slice(0, 100)}`,
      patterns,
      relationships,
      assumptions: [`使用关键词匹配进行意图分类 (时间戳: ${timestamp})`],
      risks: ['fallback 模式：LLM 解析失败，使用关键词匹配'],
    };
  }

  private buildIntent(analysis: AnalysisResult, userInput: string): Intent {
    return {
      type: analysis.intentType,
      parameters: analysis.parameters,
      confidence: analysis.confidence,
      rawInput: userInput,
    };
  }

  private identifyConstraints(observation: Observation, analysis: AnalysisResult): Constraint[] {
    const constraints: Constraint[] = [];
    
    // 资源约束
    if (observation.environment.resourceUsage.memory > 0.8) {
      constraints.push({
        type: 'resource',
        description: '内存使用率过高，可能影响性能',
        severity: 'high',
      });
    } else if (observation.environment.resourceUsage.memory > 0.6) {
      constraints.push({
        type: 'resource',
        description: '内存使用率较高',
        severity: 'medium',
      });
    }
    
    if (observation.environment.resourceUsage.cpu > 0.8) {
      constraints.push({
        type: 'resource',
        description: 'CPU使用率过高',
        severity: 'high',
      });
    }
    
    // 错误约束
    const errorResults = observation.toolResults.filter(r => r.isError);
    if (errorResults.length > 0) {
      constraints.push({
        type: 'logic',
        description: `存在${errorResults.length}个工具执行错误`,
        severity: 'medium',
      });
    }
    
    // 风险约束
    for (const risk of analysis.risks) {
      constraints.push({
        type: 'logic',
        description: risk,
        severity: 'medium',
      });
    }
    
    // 新增启发式约束识别
    constraints.push(...this.identifyHeuristicConstraints(observation, analysis));
    
    return constraints;
  }

  /**
   * 启发式约束识别 - 基于模式识别额外的约束条件
   */
  private identifyHeuristicConstraints(observation: Observation, analysis: AnalysisResult): Constraint[] {
    const constraints: Constraint[] = [];
    
    // 检测工作流约束
    const workflowPattern = observation.patterns?.find(p => p.type === 'workflow');
    if (workflowPattern) {
      if (workflowPattern.description.includes('调试')) {
        constraints.push({
          type: 'logic',
          description: '当前处于调试模式，需要谨慎修改',
          severity: 'medium',
        });
      }
      if (workflowPattern.description.includes('多文件')) {
        constraints.push({
          type: 'logic',
          description: '多文件操作需要保持一致性',
          severity: 'medium',
        });
      }
    }
    
    // 检测复杂度约束
    const complexityPattern = observation.patterns?.find(p => p.type === 'complexity');
    if (complexityPattern && complexityPattern.significance > 0.8) {
      constraints.push({
        type: 'time',
        description: '高复杂度任务可能需要更多时间',
        severity: 'medium',
      });
    }
    
    // 检测上下文切换约束
    const contextSwitchPattern = observation.patterns?.find(p => p.type === 'context_switch');
    if (contextSwitchPattern) {
      constraints.push({
        type: 'logic',
        description: '用户频繁切换话题，需要确认当前焦点',
        severity: 'low',
      });
    }
    
    // 检测连续失败约束
    const consecutiveFailures = observation.anomalies?.find(a => 
      a.type === 'error' && a.description.includes('连续失败')
    );
    if (consecutiveFailures) {
      constraints.push({
        type: 'logic',
        description: '连续失败多次，建议改变策略或请求帮助',
        severity: 'high',
      });
    }
    
    // 基于意图类型的约束
    const intent = analysis.intentType;
    if (intent === 'file_write') {
      constraints.push({
        type: 'permission',
        description: '文件写入操作需要确认权限',
        severity: 'medium',
      });
    } else if (intent === 'execute') {
      constraints.push({
        type: 'permission',
        description: '命令执行可能存在安全风险',
        severity: 'high',
      });
    }
    
    // 基于历史长度的约束
    const historyLength = observation.history.length;
    if (historyLength > 30) {
      constraints.push({
        type: 'time',
        description: '长对话历史，建议总结上下文',
        severity: 'low',
      });
    }
    
    return constraints;
  }

  private identifyKnowledgeGaps(observation: Observation, intent: Intent, analysis: AnalysisResult): KnowledgeGap[] {
    const gaps: KnowledgeGap[] = [];
    
    if (intent.type === 'file_read' && !intent.parameters.path) {
      gaps.push({
        topic: '目标文件路径',
        description: '需要知道要读取哪个文件',
        importance: 0.9,
        possibleSources: ['用户输入', '当前目录结构', '最近操作的文件'],
      });
    }
    
    if (intent.type === 'file_write' && !intent.parameters.content) {
      gaps.push({
        topic: '写入内容',
        description: '需要知道要写入什么内容',
        importance: 0.9,
        possibleSources: ['用户输入', '模板', '其他文件'],
      });
    }
    
    if (intent.type === 'execute' && !intent.parameters.command) {
      gaps.push({
        topic: '执行命令',
        description: '需要知道要执行什么命令',
        importance: 0.9,
        possibleSources: ['用户输入'],
      });
    }
    
    if (intent.type === 'search' && !intent.parameters.query) {
      gaps.push({
        topic: '搜索关键词',
        description: '需要知道搜索什么内容',
        importance: 0.8,
        possibleSources: ['用户输入'],
      });
    }
    
    if (intent.confidence < 0.5) {
      gaps.push({
        topic: '用户意图',
        description: '用户意图不明确，需要进一步澄清',
        importance: 0.7,
        possibleSources: ['向用户询问'],
      });
    }
    
    return gaps;
  }

  private synthesizePatterns(observation: Observation, analysis: AnalysisResult): Pattern[] {
    const patterns: Pattern[] = [];
    
    patterns.push(...(analysis.patterns || []));
    
    const recentTools = observation.toolResults.slice(-5).map(r => r.toolName);
    const toolFrequency: Record<string, number> = {};
    for (const tool of recentTools) {
      toolFrequency[tool] = (toolFrequency[tool] || 0) + 1;
    }
    
    for (const [tool, count] of Object.entries(toolFrequency)) {
      if (count >= 3) {
        patterns.push({
          type: 'tool_usage',
          description: `频繁使用工具: ${tool} (${count}次)`,
          significance: 0.7,
        });
      }
    }
    
    const errorRate = observation.toolResults.filter(r => r.isError).length / Math.max(observation.toolResults.length, 1);
    if (errorRate > 0.5) {
      patterns.push({
        type: 'error_pattern',
        description: `高错误率: ${Math.round(errorRate * 100)}%`,
        significance: 0.9,
      });
    }
    
    return patterns;
  }

  private mapRelationships(observation: Observation, analysis: AnalysisResult): Relationship[] {
    const relationships: Relationship[] = [];
    
    relationships.push(...(analysis.relationships || []));
    
    const toolSequence = observation.toolResults.slice(-3);
    for (let i = 0; i < toolSequence.length - 1; i++) {
      relationships.push({
        from: toolSequence[i].toolName,
        to: toolSequence[i + 1].toolName,
        type: 'sequence',
        strength: 0.5,
      });
    }
    
    return relationships;
  }
}
