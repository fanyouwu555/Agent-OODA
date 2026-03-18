import { Observation, Orientation, Intent, Constraint, KnowledgeGap, Pattern, Relationship, ThinkingCallback } from '../types';
import { OrientInput, OrientOutput, createOrientInput, OODAPhaseModelConfig } from './types';
import { LLMService } from '../llm/service';
import { getLLMConnectionPool } from '../llm/connection-pool';
import { ChatMessage, StreamOptions } from '../llm/provider';
import { getSessionMemory, SessionMemory } from '../memory';
import { MemoryCompressor } from '../memory/long-term';
import { KnowledgeGapDetector, KnowledgeGapType, getKnowledgeGapDetector, DetectedKnowledgeGap } from './knowledge-gap';
import { ToolSelector, getToolSelector, ToolSelection } from './tool-selector';
import { getLogger } from '../logger';

// 使用统一的 ThinkingCallback 类型
export type OrientThinkingCallback = ThinkingCallback;

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

// 创建 LLM 解析专用 logger
const llmLogger = getLogger({
  minLevel: 'debug',
  enableConsole: true,
  enableFile: true,
  filePath: './logs/llm-parse-debug.log',
  format: 'text',
});

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
  private knowledgeGapDetector: KnowledgeGapDetector;
  private toolSelector: ToolSelector;
  private logger = llmLogger;
  private phaseModelConfig?: OODAPhaseModelConfig;
  
  constructor(sessionId: string, phaseModelConfig?: OODAPhaseModelConfig) {
    this.sessionId = sessionId;
    this.sessionMemory = getSessionMemory(sessionId);
    this.state = orienterStateManager.getState(sessionId);
    // 初始化知识缺口检测器和工具选择器
    this.knowledgeGapDetector = getKnowledgeGapDetector();
    this.toolSelector = getToolSelector();
    this.phaseModelConfig = phaseModelConfig;
  }
  
  /**
   * 获取 Orient 阶段的 LLM 服务（使用连接池）
   * 如果配置了阶段模型，使用配置的模型；否则使用默认模型
   */
  private async getLLM(): Promise<LLMService> {
    const pool = getLLMConnectionPool();
    
    if (this.phaseModelConfig?.orient) {
      const { provider, model } = this.phaseModelConfig.orient;
      return pool.acquire({ type: provider as any, model });
    }
    return pool.acquire();
  }
  
  /**
   * 释放 LLM 服务回连接池
   */
  private releaseLLM(service: LLMService): void {
    const pool = getLLMConnectionPool();
    pool.release(service);
  }
  
  /**
   * 更新阶段模型配置
   */
  setPhaseModelConfig(config: OODAPhaseModelConfig) {
    this.phaseModelConfig = config;
  }

  /**
   * 使用边界类型的 orient 方法 - 解耦版本
   * 输入输出更清晰，减少对内部类型的依赖
   */
  async orientWithBoundary(input: OrientInput): Promise<OrientOutput> {
    const analysisResult = await this.performDeepAnalysisFromBoundary(input);
    
    const intent: Intent = {
      type: analysisResult.intentType,
      parameters: analysisResult.parameters,
      confidence: analysisResult.confidence,
      rawInput: input.userInput,
    };
    
    // 知识缺口自动检测
    const mockHistory = input.recentHistory.map((m, i) => ({
      id: `mock-${i}`,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: Date.now(),
    }));
    
    const detectedGaps = this.knowledgeGapDetector.detect(input.userInput, {
      userInput: input.userInput,
      toolResults: input.toolResultsSummary.map(r => ({
        toolName: r.toolName,
        isError: r.isError,
        executionTime: r.executionTime,
        result: null,
      })),
      environment: {
        resourceUsage: {
          memory: input.environmentSummary.memoryUsage,
          cpu: input.environmentSummary.cpuUsage,
          network: 0,
        },
        currentTime: Date.now(),
        availableTools: [],
      },
      context: {
        relevantFacts: [],
        recentEvents: [],
        userPreferences: {},
      },
      history: mockHistory,
    } as unknown as Observation);
    
    const primaryGap = detectedGaps[0];
    
    if (primaryGap && primaryGap.type !== KnowledgeGapType.NONE && primaryGap.confidence >= 0.6) {
      intent.parameters = {
        ...intent.parameters,
        knowledgeGap: primaryGap.type,
        suggestedTool: primaryGap.suggestedTool,
        suggestedArgs: primaryGap.suggestedArgs,
        gapConfidence: primaryGap.confidence,
      };
    }
    
    // 构建约束
    const constraints = this.buildConstraintsFromBoundary(input);
    
    // 返回清晰的输出边界
    return {
      primaryIntent: {
        type: intent.type,
        parameters: intent.parameters,
        confidence: intent.confidence,
        rawInput: intent.rawInput || '',
      },
      constraints,
      knowledgeGaps: input.priorFeedback?.issues.map(issue => ({
        topic: '上一轮问题',
        description: issue,
        importance: 0.7,
      })) || [],
      risks: analysisResult.risks,
      assumptions: analysisResult.assumptions,
      contextSummary: analysisResult.contextSummary || '',
      detectedKnowledgeGaps: detectedGaps.map(g => ({
        type: g.type,
        description: g.description,
        confidence: g.confidence,
        suggestedTool: g.suggestedTool,
        suggestedArgs: g.suggestedArgs,
      })),
    };
  }

  /**
   * 从边界输入构建约束
   */
  private buildConstraintsFromBoundary(input: OrientInput): OrientOutput['constraints'] {
    const constraints: OrientOutput['constraints'] = [];
    
    // 资源约束
    if (input.environmentSummary.memoryUsage > 0.8) {
      constraints.push({
        type: 'resource',
        description: '内存使用率过高',
        severity: 'high',
      });
    }
    
    // 工具错误约束
    const errorTools = input.toolResultsSummary.filter(r => r.isError);
    if (errorTools.length > 0) {
      constraints.push({
        type: 'logic',
        description: `工具执行错误: ${errorTools.map(r => r.toolName).join(', ')}`,
        severity: 'medium',
      });
    }
    
    // 来自反馈的约束
    if (input.priorFeedback?.issues.length) {
      constraints.push({
        type: 'logic',
        description: `需要解决的问题: ${input.priorFeedback.issues.join('; ')}`,
        severity: 'medium',
      });
    }
    
    return constraints;
  }

  /**
   * 从边界输入执行深度分析
   */
  private async performDeepAnalysisFromBoundary(input: OrientInput): Promise<AnalysisResult> {
    const llmService = await this.getLLM();
    
    // 准备历史消息
    const history: ChatMessage[] = input.recentHistory.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));
    
    // 构建分析提示
    const userPrompt = this.buildAnalysisPromptFromBoundary(input);
    
    try {
      const response = await llmService.generate(userPrompt, {
        systemPrompt: this.buildSystemPrompt(),
        history,
        maxTokens: 1500,
      });
      
      return this.parseAnalysisResult(response.text || '', { userInput: input.userInput } as Observation);
    } catch (error) {
      console.error('[Orient] 边界输入分析失败:', error);
      return this.fallbackAnalysis({ userInput: input.userInput } as Observation);
    }
  }

  /**
   * 为边界输入构建分析提示
   */
  private buildAnalysisPromptFromBoundary(input: OrientInput): string {
    const toolResultsSummary = input.toolResultsSummary
      .slice(-3)
      .map(r => `${r.toolName}: ${r.isError ? 'ERROR' : 'SUCCESS'}`)
      .join('\n');

    const priorFeedbackSection = input.priorFeedback 
      ? `\n## 上一轮反馈信息\n问题: ${input.priorFeedback.issues.join('; ')}\n建议: ${input.priorFeedback.suggestions.join('; ')}\n`
      : '';

    return `请分析以下用户输入和上下文信息：

## 当前用户输入
${input.userInput}
${priorFeedbackSection}
## 最近对话
${input.recentHistory.map(m => `${m.role}: ${m.content}`).join('\n') || '无历史记录'}

## 工具执行结果
${toolResultsSummary || '无工具调用'}

## 环境状态
- 内存使用: ${Math.round(input.environmentSummary.memoryUsage * 100)}%
- CPU使用: ${Math.round(input.environmentSummary.cpuUsage * 100)}%

请以JSON格式输出意图分析结果，包含：intentType, parameters, confidence, contextSummary, assumptions, risks。

请只输出JSON。`;
  }

  /**
   * 同步版本的 orient - 保持原有行为
   */
  async orient(observation: Observation): Promise<Orientation> {
    return this.orientStream(observation);
  }

  /**
   * 流式版本的 orient - 实时推送 LLM 思考过程
   */
  async orientStream(
    observation: Observation, 
    onThinking?: OrientThinkingCallback,
    validationFeedback?: {
      issues: string[];
      suggestions: string[];
      isValid: boolean;
      needsMoreWork: boolean;
    }
  ): Promise<Orientation> {
    // 先发送开始思考的消息
    if (onThinking) {
      await onThinking('thinking', '🤔 正在分析您的意图...');
    }

    const analysisResult = await this.performDeepAnalysisStream(observation, onThinking, validationFeedback);
    
    const intent = this.buildIntent(analysisResult, observation.userInput);
    
    // ========== 新增：知识缺口自动检测 ==========
    const detectedGaps = this.knowledgeGapDetector.detect(observation.userInput, observation);
    const primaryGap = detectedGaps[0];
    
    // 如果检测到需要工具调用的知识缺口，更新 intent 类型
    if (primaryGap && primaryGap.type !== KnowledgeGapType.NONE && primaryGap.confidence >= 0.6) {
      intent.parameters = {
        ...intent.parameters,
        knowledgeGap: primaryGap.type,
        suggestedTool: primaryGap.suggestedTool,
        suggestedArgs: primaryGap.suggestedArgs,
        gapConfidence: primaryGap.confidence,
        triggerKeywords: primaryGap.triggerKeywords,
      };
      
      // 发送知识缺口检测结果
      if (onThinking) {
        await onThinking('analysis', `🔍 检测到知识缺口: ${primaryGap.type}, 建议工具: ${primaryGap.suggestedTool}`);
      }
    }
    // ========== 知识缺口检测结束 ==========
    
    // 发送意图识别结果
    if (onThinking) {
      await onThinking('intent', `✨ 识别到意图: ${intent.type} (置信度: ${Math.round(intent.confidence * 100)}%)`);
    }
    
    const constraints = this.identifyConstraints(observation, analysisResult);
    const knowledgeGaps = this.identifyKnowledgeGaps(observation, intent, analysisResult);
    const patterns = this.synthesizePatterns(observation, analysisResult);
    const relationships = this.mapRelationships(observation, analysisResult);
    
    return {
      primaryIntent: intent,
      relevantContext: {
        ...observation.context,
        contextSummary: analysisResult.contextSummary,
        // 将检测到的知识缺口传递给下一阶段
        detectedKnowledgeGaps: detectedGaps,
      },
      constraints,
      knowledgeGaps,
      patterns,
      relationships,
      assumptions: analysisResult.assumptions,
      risks: analysisResult.risks,
    };
  }

  /**
   * 流式版本的深度分析 - 实时推送 LLM 生成的内容
   */
  private async performDeepAnalysisStream(
    observation: Observation, 
    onThinking?: OrientThinkingCallback,
    validationFeedback?: {
      issues: string[];
      suggestions: string[];
      isValid: boolean;
      needsMoreWork: boolean;
    }
  ): Promise<AnalysisResult> {
    const llmService = await this.getLLM();
    
    const allHistory = this.sessionMemory.getShortTerm().getRecentMessages(100);
    const historyToUse = allHistory.length > 0 ? allHistory : observation.history;
    
    if (onThinking) {
      await onThinking('thinking', `📚 加载历史记录: ${historyToUse.length} 条消息`);
    }
    
    const { history, summary } = await this.prepareHistoryForLLM(historyToUse, llmService);
    
    if (onThinking) {
      await onThinking('analysis', `📝 对话摘要: ${summary ? '已生成' : '使用简短历史'}`);
    }
    
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildAnalysisPrompt(observation, summary, validationFeedback);
    
    if (onThinking) {
      await onThinking('thinking', '🔄 正在调用 LLM 分析意图...');
    }
    
    // 使用流式调用 LLM
    let fullResponse = '';
    const streamOptions: StreamOptions = {
      systemPrompt,
      history,
      maxTokens: 1500,  // 增加 token 数量以确保返回完整 JSON
      onToken: (token) => {
        fullResponse += token;
      },
    };
    
    console.log(`[Orienter] LLM prompt length: ${userPrompt.length}, maxTokens: 1500`);
    
    for await (const token of llmService.stream(userPrompt, streamOptions)) {
      // 每个 token 都实时推送（可以按需节流）
      if (onThinking && fullResponse.length % 20 === 0) {
        await onThinking('analysis', `💭 分析中: ${fullResponse.slice(-30)}...`);
      }
    }
    
    if (onThinking) {
      await onThinking('analysis', '✅ 意图分析完成');
    }
    
    return this.parseAnalysisResult(fullResponse, observation);
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
    
    // 详细日志：记录 LLM 调用信息
    this.logger.debug('========================================');
    this.logger.debug('开始调用 LLM 服务（流式思考模式）');
    this.logger.debug(`System Prompt 长度: ${systemPrompt.length} 字符`);
    this.logger.debug(`User Prompt 长度: ${userPrompt.length} 字符`);
    this.logger.debug(`History 消息数: ${history.length}`);
    
    console.log(`[Orienter] ========================================`);
    console.log(`[Orienter] 开始调用 LLM 服务（流式思考模式）`);
    console.log(`[Orienter] System Prompt 长度: ${systemPrompt.length} 字符`);
    console.log(`[Orienter] User Prompt 长度: ${userPrompt.length} 字符`);
    console.log(`[Orienter] History 消息数: ${history.length}`);
    
    const callStartTime = Date.now();
    
    // 第一步：流式获取 LLM 分析（自由文本）
    let fullAnalysis = '';
    let thinkingContent = '';
    let jsonContent = '';
    let isInJson = false;
    
    try {
      console.log(`[Orienter] 开始流式接收分析...`);
      
      for await (const chunk of llmService.stream(userPrompt, {
        systemPrompt,
        history,
        maxTokens: 2000,
        temperature: 0.7,
      })) {
        fullAnalysis += chunk;
        
        // 解析 <thinking> 和 <json> 标签
        if (chunk.includes('<json>')) {
          isInJson = true;
          const parts = chunk.split('<json>');
          thinkingContent += parts[0];
          if (parts[1]) {
            jsonContent += parts[1];
          }
        } else if (chunk.includes('</json>')) {
          const parts = chunk.split('</json>');
          jsonContent += parts[0];
          isInJson = false;
          if (parts[1]) {
            thinkingContent += parts[1];
          }
        } else if (isInJson) {
          jsonContent += chunk;
        } else {
          thinkingContent += chunk;
        }
        
        // 每 100 个字符输出一次日志
        if (fullAnalysis.length % 100 < chunk.length) {
          console.log(`[Orienter] 已接收 ${fullAnalysis.length} 字符...`);
        }
      }
      
      const callDuration = Date.now() - callStartTime;
      
      console.log(`[Orienter] 流式接收完成，总长度: ${fullAnalysis.length} 字符，耗时: ${callDuration}ms`);
      console.log(`[Orienter] 思考内容: ${thinkingContent.length} 字符`);
      console.log(`[Orienter] JSON内容: ${jsonContent.length} 字符`);
      
      this.logger.debug(`流式调用耗时: ${callDuration}ms`);
      this.logger.debug(`完整响应长度: ${fullAnalysis.length} 字符`);
      this.logger.debug(`思考内容:\n${thinkingContent}`);
      this.logger.debug(`JSON内容:\n${jsonContent}`);
      
    } catch (err) {
      const callDuration = Date.now() - callStartTime;
      this.logger.error(`流式调用失败 (${callDuration}ms): ${(err as Error).message}`);
      console.error('[Orient] 流式调用失败:', (err as Error).message);
      return this.fallbackAnalysis(observation);
    }
    
    // 如果响应为空，使用 fallback
    if (!fullAnalysis || fullAnalysis.trim().length === 0) {
      this.logger.warn('❌ LLM返回空响应，使用fallback');
      console.warn('[Orient] ❌ LLM返回空响应，使用fallback');
      return this.fallbackAnalysis(observation);
    }
    
    // 第二步：如果有 JSON 内容，直接解析；否则提取结构化数据
    if (jsonContent && jsonContent.trim().length > 0) {
      console.log(`[Orienter] 从 <json> 标签提取到内容，直接解析`);
      return this.parseAnalysisResult(jsonContent, observation);
    } else {
      console.log(`[Orienter] 未找到 <json> 标签，使用完整响应解析`);
      return this.parseAnalysisResult(fullAnalysis, observation);
    }
  }
  
  private async prepareHistoryForLLM(
    messages: Array<{ role: string; content: string; timestamp?: number }>,
    llmService: LLMService
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
    llmService: LLMService
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
    return `你是一个智能对话分析系统。请分析用户输入并提供详细的意图分析。

【分析任务】
1. 准确理解用户的真实意图
2. 识别对话中的模式和关系
3. 评估潜在的风险和约束
4. 提取关键参数和信息

【输出格式】
请使用以下格式输出：

<thinking>
你的详细分析过程，包括：
- 用户输入的理解
- 可能的意图推测
- 上下文分析
- 风险评估
</thinking>

<json>
{
  "intentType": "意图类型",
  "parameters": {"key": "value"},
  "confidence": 0.85,
  "contextSummary": "上下文摘要",
  "patterns": [{"type": "pattern_type", "description": "描述", "significance": 0.8}],
  "relationships": [{"from": "A", "to": "B", "type": "dependency", "strength": 0.9}],
  "assumptions": ["假设1", "假设2"],
  "risks": ["风险1", "风险2"]
}
</json>

【意图类型】
- question: 用户提问
- file_read: 读取文件
- file_write: 写入文件
- execute: 执行命令
- search: 搜索信息
- code_analysis: 代码分析
- general: 一般对话

【要求】
1. 先输出思考过程（<thinking>标签内）
2. 再输出结构化JSON（<json>标签内）
3. JSON必须可被JSON.parse解析
4. 如果无法确定，使用 "general" 类型`;
  }

  private buildAnalysisPrompt(
    observation: Observation, 
    conversationSummary?: string,
    validationFeedback?: {
      issues: string[];
      suggestions: string[];
      isValid: boolean;
      needsMoreWork: boolean;
    }
  ): string {
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

    // 构建验证反馈部分
    let validationSection = '';
    if (validationFeedback) {
      validationSection = `
## 上一轮搜索/执行结果验证
- 是否有效: ${validationFeedback.isValid ? '无效' : '有效'}
- 需要改进: ${validationFeedback.needsMoreWork ? '是' : '否'}
${validationFeedback.issues.length > 0 ? `- 发现的问题: ${validationFeedback.issues.join('; ')}` : ''}
${validationFeedback.suggestions.length > 0 ? `- 改进建议: ${validationFeedback.suggestions.join('; ')}` : ''}
`;
    }

    return `请分析以下用户输入和上下文信息：

## 当前用户输入
${observation.userInput}
${summarySection}${validationSection}
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

## 输出要求

请先详细分析，然后按照 system prompt 中指定的格式输出 <thinking> 和 <json> 标签。

分析要点：
1. 理解用户真正想要什么
2. 识别对话中的模式和关系
3. 评估潜在风险
4. 提取关键参数`;
  }

  private parseAnalysisResult(response: string, observation: Observation): AnalysisResult {
    // 记录完整原始响应以便调试 - 写入日志文件
    this.logger.debug('========================================');
    this.logger.debug('开始解析 LLM 响应');
    this.logger.debug(`响应长度: ${response?.length || 0} 字符`);
    this.logger.debug(`原始响应内容:\n${response || '(空响应)'}`);
    this.logger.debug('----------------------------------------');
    
    // 同时输出到控制台
    console.log(`[Orient] ========================================`);
    console.log(`[Orient] 开始解析 LLM 响应`);
    console.log(`[Orient] 响应长度: ${response?.length || 0} 字符`);
    console.log(`[Orient] 原始响应内容:\n${response || '(空响应)'}`);
    console.log(`[Orient] ----------------------------------------`);
    
    if (!response || response.trim().length === 0) {
      this.logger.warn('❌ 失败原因: LLM 返回空响应');
      this.logger.debug('========================================');
      console.warn('[Orient] ❌ 失败原因: LLM 返回空响应');
      console.log(`[Orient] ========================================`);
      return this.fallbackAnalysis(observation);
    }
    
    try {
      // 尝试多种 JSON 提取策略
      const jsonMatch = this.extractJSON(response);
      if (jsonMatch) {
        this.logger.debug(`✅ 成功提取 JSON，长度: ${jsonMatch.length} 字符`);
        this.logger.debug(`提取的 JSON 内容:\n${jsonMatch}`);
        console.log(`[Orient] ✅ 成功提取 JSON，长度: ${jsonMatch.length} 字符`);
        console.log(`[Orient] 提取的 JSON 内容:\n${jsonMatch}`);
        
        try {
          const parsed = JSON.parse(jsonMatch);
          
          // 验证必需字段
          const requiredFields = ['intentType', 'parameters', 'confidence'];
          const missingFields = requiredFields.filter(f => !(f in parsed));
          
          if (missingFields.length > 0) {
            this.logger.warn(`⚠️  JSON 缺少必需字段: ${missingFields.join(', ')}`);
            console.warn(`[Orient] ⚠️  JSON 缺少必需字段: ${missingFields.join(', ')}`);
          } else {
            this.logger.debug('✅ JSON 包含所有必需字段');
            console.log(`[Orient] ✅ JSON 包含所有必需字段`);
          }
          
          this.logger.debug(`解析结果: intentType=${parsed.intentType}, confidence=${parsed.confidence}`);
          this.logger.debug('========================================');
          console.log(`[Orient] 解析结果: intentType=${parsed.intentType}, confidence=${parsed.confidence}`);
          console.log(`[Orient] ========================================`);
          
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
        } catch (parseError) {
          this.logger.warn(`❌ JSON.parse 失败: ${parseError}`);
          this.logger.debug(`尝试解析的内容: ${jsonMatch.slice(0, 500)}`);
          console.warn(`[Orient] ❌ JSON.parse 失败:`, parseError);
          console.log(`[Orient] 尝试解析的内容: ${jsonMatch.slice(0, 500)}`);
        }
      } else {
        this.logger.warn('❌ 失败原因: 无法从响应中提取有效 JSON');
        this.logger.debug(`响应内容预览 (前1000字符):\n${response?.slice(0, 1000)}`);
        console.warn('[Orient] ❌ 失败原因: 无法从响应中提取有效 JSON');
        console.log(`[Orient] 响应内容预览 (前1000字符):\n${response?.slice(0, 1000)}`);
        
        // 分析为什么提取失败
        if (!response.includes('{')) {
          this.logger.warn('诊断: 响应中不包含 "{" 字符，可能不是 JSON 格式');
          console.warn('[Orient] 诊断: 响应中不包含 "{" 字符，可能不是 JSON 格式');
        } else if (!response.includes('}')) {
          this.logger.warn('诊断: 响应中不包含 "}" 字符，JSON 可能不完整');
          console.warn('[Orient] 诊断: 响应中不包含 "}" 字符，JSON 可能不完整');
        } else {
          // 尝试找出可能的 JSON 问题
          const braceCount = (response.match(/{/g) || []).length;
          const closeBraceCount = (response.match(/}/g) || []).length;
          this.logger.warn(`诊断: 花括号不匹配 - 开括号: ${braceCount}, 闭括号: ${closeBraceCount}`);
          console.warn(`[Orient] 诊断: 花括号不匹配 - 开括号: ${braceCount}, 闭括号: ${closeBraceCount}`);
        }
      }
    } catch (e) {
      this.logger.warn(`❌ 解析过程发生异常: ${e}`);
      console.warn('[Orient] ❌ 解析过程发生异常:', e);
    }
    
    this.logger.warn('⚠️  将使用 fallback 关键词匹配模式');
    this.logger.debug('========================================');
    console.warn('[Orient] ⚠️  将使用 fallback 关键词匹配模式');
    console.log(`[Orient] ========================================`);
    return this.fallbackAnalysis(observation);
  }

  /**
   * 多策略 JSON 提取 - 更健壮的 JSON 解析
   */
  private extractJSON(response: string): string | null {
    if (!response || !response.trim()) {
      this.logger.debug('extractJSON: 响应为空');
      console.log('[Orient] extractJSON: 响应为空');
      return null;
    }

    this.logger.debug('extractJSON: 开始尝试 5 种提取策略');
    console.log('[Orient] extractJSON: 开始尝试 5 种提取策略');

    // 策略 1: 尝试直接解析整个响应
    try {
      JSON.parse(response);
      this.logger.debug('extractJSON: ✅ 策略1成功 - 直接解析整个响应');
      console.log('[Orient] extractJSON: ✅ 策略1成功 - 直接解析整个响应');
      return response;
    } catch (e) {
      this.logger.debug('extractJSON: ❌ 策略1失败 - 直接解析失败');
      console.log('[Orient] extractJSON: ❌ 策略1失败 - 直接解析失败');
    }

    // 策略 2: 查找 JSON 对象 {...}
    const objectMatch = response.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      // 验证提取的内容是否可以解析
      try {
        JSON.parse(objectMatch[0]);
        this.logger.debug('extractJSON: ✅ 策略2成功 - 匹配 {...}');
        console.log('[Orient] extractJSON: ✅ 策略2成功 - 匹配 {...}');
        return objectMatch[0];
      } catch (e) {
        this.logger.debug(`extractJSON: ❌ 策略2失败 - 匹配到内容但解析失败，长度: ${objectMatch[0].length}`);
        console.log(`[Orient] extractJSON: ❌ 策略2失败 - 匹配到内容但解析失败，长度: ${objectMatch[0].length}`);
      }
    } else {
      this.logger.debug('extractJSON: ❌ 策略2失败 - 未匹配到 {...}');
      console.log('[Orient] extractJSON: ❌ 策略2失败 - 未匹配到 {...}');
    }

    // 策略 3: 查找 JSON 数组 [...]
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        JSON.parse(arrayMatch[0]);
        this.logger.debug('extractJSON: ✅ 策略3成功 - 匹配 [...]');
        console.log('[Orient] extractJSON: ✅ 策略3成功 - 匹配 [...]');
        return arrayMatch[0];
      } catch (e) {
        this.logger.debug('extractJSON: ❌ 策略3失败 - 匹配到数组但解析失败');
        console.log(`[Orient] extractJSON: ❌ 策略3失败 - 匹配到数组但解析失败`);
      }
    } else {
      this.logger.debug('extractJSON: ❌ 策略3失败 - 未匹配到 [...]');
      console.log('[Orient] extractJSON: ❌ 策略3失败 - 未匹配到 [...]');
    }

    // 策略 4: 尝试找到 "{" 和 "}" 包围的内容
    const startBrace = response.indexOf('{');
    const endBrace = response.lastIndexOf('}');
    if (startBrace !== -1 && endBrace !== -1 && endBrace > startBrace) {
      const jsonCandidate = response.substring(startBrace, endBrace + 1);
      try {
        JSON.parse(jsonCandidate);
        this.logger.debug('extractJSON: ✅ 策略4成功 - 通过索引提取 {...}');
        console.log('[Orient] extractJSON: ✅ 策略4成功 - 通过索引提取 {...}');
        return jsonCandidate;
      } catch (e) {
        this.logger.debug(`extractJSON: ❌ 策略4失败 - 索引提取但解析失败，内容长度: ${jsonCandidate.length}`);
        console.log(`[Orient] extractJSON: ❌ 策略4失败 - 索引提取但解析失败，内容长度: ${jsonCandidate.length}`);
      }
    } else {
      this.logger.debug(`extractJSON: ❌ 策略4失败 - 无法定位花括号 (start: ${startBrace}, end: ${endBrace})`);
      console.log(`[Orient] extractJSON: ❌ 策略4失败 - 无法定位花括号 (start: ${startBrace}, end: ${endBrace})`);
    }

    // 策略 5: 移除 markdown 代码块标记
    const withoutMarkdown = response.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    try {
      JSON.parse(withoutMarkdown);
      this.logger.debug('extractJSON: ✅ 策略5成功 - 移除 markdown 后解析');
      console.log('[Orient] extractJSON: ✅ 策略5成功 - 移除 markdown 后解析');
      return withoutMarkdown;
    } catch (e) {
      this.logger.debug('extractJSON: ❌ 策略5失败 - 移除 markdown 后仍无法解析');
      console.log('[Orient] extractJSON: ❌ 策略5失败 - 移除 markdown 后仍无法解析');
    }

    this.logger.debug('extractJSON: ⚠️  所有策略均失败');
    console.log('[Orient] extractJSON: ⚠️  所有策略均失败');
    return null;
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
