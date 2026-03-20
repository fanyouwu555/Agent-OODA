import { AgentState, AgentResult, Message, Observation, Orientation, Decision, ActionResult, ThinkingCallback } from '../types';
import { Observer, resetObserverState, initObserverLastStoredCount, ObserveAgent } from './observe';
import { Orienter, resetOrienterState, initOrienterCompressedCount } from './orient';
import { Decider } from './decide';
import { Actor } from './act';
import { getSessionMemory, SessionMemory } from '../memory';
import { getHierarchicalMemory, HierarchicalMemoryManager } from '../memory/hierarchical-memory';
import { getLearningModule, LearningModule } from './learning';
import { StreamingOutputManager, StreamingHandler, StreamingConfig, createConsoleStreamingHandler } from './streaming';
import { OODACycleContext, createOODACycleContext, PhaseResult, LLMInteraction } from './types';
import { getLLMService } from '../llm/service';
import { ChatMessage } from '../llm/provider';
import { LRUCache } from '../utils/cache';

export { ObserveAgent } from './observe';

/**
 * Debug 日志辅助函数 - 安全地打印 JSON
 */
function debugJson(label: string, data: unknown): void {
  try {
    const json = JSON.stringify(data, null, 2);
    if (json.length > 5000) {
      console.log(`[DEBUG ${label}]`, json.slice(0, 5000), '\n... [truncated]');
    } else {
      console.log(`[DEBUG ${label}]`, json);
    }
  } catch (e) {
    console.log(`[DEBUG ${label}] [Serialization failed]`, String(e));
  }
}

interface PerformanceMetrics {
  observeTime: number;
  orientTime: number;
  decideTime: number;
  actTime: number;
  totalTime: number;
}

interface LoopContext {
  previousResults: ActionResult[];
  learningInsights: string[];
  adaptationNotes: string[];
  conversationSummary?: string;
}

export interface OODAEvent {
  phase: 'observe' | 'orient' | 'decide' | 'act' | 'tool_result' | 'complete' | 'feedback' | 'adaptation' | 'streaming_content';
  data?: {
    intent?: string;
    reasoning?: string;
    options?: string[];
    selectedOption?: string;
    chunk?: string;
    output?: string;
    toolCall?: {
      id: string;
      name: string;
      args: Record<string, unknown>;
      result?: unknown;
    };
    feedback?: {
      observations: string[];
      issues: string[];
      suggestions: string[];
    };
    adaptation?: {
      reason: string;
      action: string;
    };
    // 增强：每个阶段的完整输入输出
    phaseData?: {
      phaseName: 'observe' | 'orient' | 'decide' | 'act';
      input: Record<string, unknown>;
      output: Record<string, unknown>;
      duration: number;
      success: boolean;
    };
  };
}

export type OODACallback = (event: OODAEvent) => Promise<void> | void;

class SessionLoopContextManager {
  private contexts: Map<string, LoopContext> = new Map();
  
  getContext(sessionId: string): LoopContext {
    if (!this.contexts.has(sessionId)) {
      this.contexts.set(sessionId, {
        previousResults: [],
        learningInsights: [],
        adaptationNotes: [],
      });
    }
    return this.contexts.get(sessionId)!;
  }
  
  clearContext(sessionId: string): void {
    this.contexts.delete(sessionId);
  }
}

const sessionLoopContextManager = new SessionLoopContextManager();

export class OODALoop {
  private sessionId: string;
  private agentName: string;
  private observer: Observer;
  private orienter: Orienter;
  private decider: Decider;
  private actor: Actor;
  private sessionMemory: SessionMemory;
  private hierarchicalMemory: HierarchicalMemoryManager;
  private learningModule: LearningModule;
  private loopContext: LoopContext;
  private streamingManager?: StreamingOutputManager;
  private thinkingCallback?: ThinkingCallback;
  private streamContentCallback?: (chunk: string, isComplete: boolean) => Promise<void>;
  
  private maxIterations = 10;
  private timeout = 300000;
  private currentIteration = 0;
  private maxHistorySize = 100;

  private observationCache: LRUCache<Observation>;
  private orientationCache: LRUCache<Orientation>;
  private decisionCache: LRUCache<Decision>;

  private cacheTTL = 60000;
  private cacheEnabled = false;
  private maxCacheSize = 100;
  private performanceMetrics: PerformanceMetrics[] = [];

  private adaptiveCacheEnabled = true;
  private minTTL = 30000;
  private maxTTL = 300000;
  private targetAvgTime = 2000;

  constructor(sessionId?: string, streamingHandler?: StreamingHandler, streamingConfig?: Partial<StreamingConfig>, agentName?: string) {
    this.sessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.agentName = agentName || 'default';
    this.sessionMemory = getSessionMemory(this.sessionId);
    this.hierarchicalMemory = getHierarchicalMemory(this.sessionId);
    this.learningModule = getLearningModule();
    this.loopContext = sessionLoopContextManager.getContext(this.sessionId);
    this.observer = new Observer(this.sessionId);
    this.orienter = new Orienter(this.sessionId);
    this.decider = new Decider();
    this.actor = new Actor(this.sessionId, undefined, undefined, this.agentName);

    this.observationCache = new LRUCache<Observation>({ maxSize: this.maxCacheSize, ttl: this.cacheTTL });
    this.orientationCache = new LRUCache<Orientation>({ maxSize: this.maxCacheSize, ttl: this.cacheTTL });
    this.decisionCache = new LRUCache<Decision>({ maxSize: this.maxCacheSize, ttl: this.cacheTTL });

    if (streamingHandler) {
      this.streamingManager = new StreamingOutputManager(streamingHandler, streamingConfig, this.sessionId);
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  enableStreaming(handler: StreamingHandler, config?: Partial<StreamingConfig>): void {
    this.streamingManager = new StreamingOutputManager(handler, config, this.sessionId);
  }

  disableStreaming(): void {
    this.streamingManager = undefined;
  }

  getStreamingManager(): StreamingOutputManager | undefined {
    return this.streamingManager;
  }

  setThinkingCallback(callback: ThinkingCallback): void {
    this.thinkingCallback = callback;
  }

  setStreamContentCallback(callback: (chunk: string, isComplete: boolean) => Promise<void>): void {
    this.streamContentCallback = callback;
  }

  async run(input: string): Promise<AgentResult> {
    return this.runWithCallback(input, () => {});
  }

  async runWithCallback(input: string, callback: OODACallback, history?: Message[]): Promise<AgentResult> {
    this.loopContext = sessionLoopContextManager.getContext(this.sessionId);
    
    this.currentIteration = 0;
    this.performanceMetrics = [];
    
    resetObserverState(this.sessionId);
    resetOrienterState(this.sessionId);
    
    console.log(`[OODA] Session ${this.sessionId}: Starting with history sync...`);
    
    if (history && history.length > 0) {
      const existingMessages = this.sessionMemory.getShortTerm().getRecentMessages(100);
      const existingIds = new Set(existingMessages.map(m => m.id));
      
      let syncedCount = 0;
      for (const msg of history) {
        if (!existingIds.has(msg.id)) {
          this.sessionMemory.getShortTerm().storeMessage(msg);
          syncedCount++;
        }
      }
      console.log(`[OODA] Synced ${syncedCount} new history messages to session memory`);
    }
    
    const memoryMessages = this.sessionMemory.getShortTerm().getRecentMessages(100);
    console.log(`[OODA] Session memory now has ${memoryMessages.length} messages`);
    
    initObserverLastStoredCount(this.sessionId, memoryMessages.length);
    
    const COMPRESS_THRESHOLD = 20;
    if (memoryMessages.length > COMPRESS_THRESHOLD) {
      const oldMessagesCount = memoryMessages.length - 10;
      initOrienterCompressedCount(this.sessionId, oldMessagesCount);
    }
    
    const initialHistory: Message[] = memoryMessages.length > 0
      ? [...memoryMessages, { id: `msg-${Date.now()}`, role: 'user' as const, content: input, timestamp: Date.now() }]
      : history
        ? [...history, { id: `msg-${Date.now()}`, role: 'user' as const, content: input, timestamp: Date.now() }]
        : [{ id: 'initial', role: 'user' as const, content: input, timestamp: Date.now() }];
    
    const initialState: AgentState = {
      originalInput: input,
      history: initialHistory,
      currentStep: 0,
      isComplete: false,
      metadata: {},
    };
    
    let state = initialState;
    const startTime = Date.now();
    
    while (!state.isComplete && this.currentIteration < this.maxIterations) {
      if (Date.now() - startTime > this.timeout) {
        return this.handleTimeout(state);
      }
      
      state = await this.executeOODACycle(state, callback);
      this.currentIteration++;
      
      state = this.optimizeHistory(state);
      
      if (this.shouldAdapt(state)) {
        await this.adaptStrategy(state, callback);
      }
    }
    
    this.cleanupCache();
    this.adaptCacheStrategy();
    
    const output = state.result?.output || '';
    const completeEvent = { 
      phase: 'complete' as const,
      data: { output }
    };
    await callback(completeEvent);
    await this.streamingManager?.handleOODAEvent(completeEvent);
    
    return state.result || { output: '', steps: [], metadata: {} };
  }

  private async executeOODACycle(state: AgentState, callback: OODACallback): Promise<AgentState> {
    console.log(`[OODA] Starting cycle ${this.currentIteration}`);
    const cycleStartTime = Date.now();
    const metrics: PerformanceMetrics = {
      observeTime: 0,
      orientTime: 0,
      decideTime: 0,
      actTime: 0,
      totalTime: 0,
    };
    
    // 创建本轮 OODA 循环上下文
    const cycleContext = createOODACycleContext(this.sessionId, this.currentIteration, state.originalInput);
    
    // ========== 阶段 1: Observe ==========
    let observeStart = Date.now();
    const observeEvent = { phase: 'observe' as const };
    await callback(observeEvent);
    await this.streamingManager?.handleOODAEvent(observeEvent);
    console.log('[OODA] Getting observation...');
    
    const observation = await this.getCachedObservation(state);
    const observeDuration = Date.now() - observeStart;
    
    // 记录 Observe 阶段结果
    const observeResult: PhaseResult<Observation> = {
      phase: 'observe',
      success: true,
      data: observation,
      duration: observeDuration,
      timestamp: Date.now(),
    };
    cycleContext.observe = observeResult;
    console.log('[OODA] Observation complete');
    
    // 推送 Observe 阶段完整数据到前端
    await callback({
      phase: 'observe',
      data: {
        phaseData: {
          phaseName: 'observe',
          input: {
            originalInput: state.originalInput,
            historyCount: state.history.length,
            toolResults: observation.toolResults?.slice(0, 5),
            anomalies: observation.anomalies,
            patterns: observation.patterns?.slice(0, 5),
          },
          output: {
            userInput: observation.userInput,
            toolResults: observation.toolResults,
            context: observation.context,
            environment: observation.environment,
            anomalies: observation.anomalies,
            patterns: observation.patterns,
          },
          duration: observeDuration,
          success: true,
        },
      },
    });
    
    // ========== Debug: 打印 Observe 阶段的完整上下文 ==========
    debugJson('OBSERVE-INPUT', {
      originalInput: state.originalInput,
      historyCount: state.history.length,
      toolResults: observation.toolResults?.slice(0, 5),
      anomalies: observation.anomalies,
      patterns: observation.patterns?.slice(0, 5),
      environment: observation.environment,
    });
    debugJson('OBSERVE-OUTPUT', observation);
    
    metrics.observeTime = observeDuration;
    
    // ========== 阶段 2: Orient ==========
    let orientStart = Date.now();
    console.log('[OODA] Getting orientation...');
    
    // 如果有上一轮的验证反馈，将其添加到观察中
    if (state.validationFeedback) {
      console.log('[OODA] 使用上一轮验证反馈:', state.validationFeedback.issues);
    }
    
    let orientation: Orientation;
    let orientLLMInteraction: LLMInteraction | undefined;
    
    // 统一使用流式调用，确保完整的推理过程
    const orientThinkingCallback: ThinkingCallback = async (type, content) => {
      if (this.thinkingCallback) {
        await this.thinkingCallback('orient', type as string, content as string);
      }
    };
    orientation = await this.orienter.orientStream(observation, orientThinkingCallback, state.validationFeedback);
    
    const orientDuration = Date.now() - orientStart;
    
    // 记录 Orient 阶段结果（包含 LLM 交互信息）
    const orientResult: PhaseResult<Orientation> = {
      phase: 'orient',
      success: true,
      data: orientation,
      llmInteraction: orientLLMInteraction,
      duration: orientDuration,
      timestamp: Date.now(),
    };
    cycleContext.orient = orientResult;
    console.log('[OODA] Orientation complete:', orientation.primaryIntent.type);
    
    // 推送 Orient 阶段完整数据到前端
    await callback({
      phase: 'orient',
      data: {
        phaseData: {
          phaseName: 'orient',
          input: {
            userInput: observation.userInput,
            toolResults: observation.toolResults,
            anomalies: observation.anomalies,
            patterns: observation.patterns,
          },
          output: {
            primaryIntent: orientation.primaryIntent,
            constraints: orientation.constraints,
            knowledgeGaps: orientation.knowledgeGaps,
            patterns: orientation.patterns,
            relationships: orientation.relationships,
            assumptions: orientation.assumptions,
            risks: orientation.risks,
            relevantContext: orientation.relevantContext,
          },
          duration: orientDuration,
          success: true,
        },
      },
    });
    
    // ========== Debug: 打印 Orient 阶段的完整上下文 ==========
    debugJson('ORIENT-INPUT', {
      userInput: observation.userInput,
      toolResults: observation.toolResults,
      anomalies: observation.anomalies,
      patterns: observation.patterns,
    });
    debugJson('ORIENT-OUTPUT', {
      primaryIntent: orientation.primaryIntent,
      constraints: orientation.constraints,
      knowledgeGaps: orientation.knowledgeGaps,
      patterns: orientation.patterns,
      relationships: orientation.relationships,
      assumptions: orientation.assumptions,
      risks: orientation.risks,
      relevantContext: orientation.relevantContext,
    });
    
    this.loopContext.conversationSummary = orientation.relevantContext?.contextSummary;
    
    // ========== P1-1: 分层记忆集成 - Orient阶段 ==========
    // 设置当前意图到工作记忆
    this.hierarchicalMemory.setIntent(orientation.primaryIntent.type);
    // 设置当前任务
    this.hierarchicalMemory.setCurrentTask(state.originalInput);
    
    // 获取决策上下文（包含历史学习经验）
    const decisionContext = this.hierarchicalMemory.getDecisionContext();
    console.log('[OODA] Decision context from memory:', {
      recentActionsCount: decisionContext.recentActions.length,
      successPatternsCount: decisionContext.successPatterns.length,
      failurePatternsCount: decisionContext.failurePatterns.length,
    });
    // ========== 分层记忆集成结束 ==========
    
    const orientEvent = { 
      phase: 'orient' as const, 
      data: { 
        intent: `意图类型: ${orientation.primaryIntent.type}, 置信度: ${orientation.primaryIntent.confidence}` 
      } 
    };
    await callback(orientEvent);
    await this.streamingManager?.handleOODAEvent(orientEvent);
    metrics.orientTime = orientDuration;
    
    // ========== 阶段 3: Decide ==========
    let decideStart = Date.now();
    console.log('[OODA] Getting decision...');
    
    let decision: Decision;
    let decideLLMInteraction: LLMInteraction | undefined;
    
    // 统一使用流式调用，确保完整的推理过程
    const decideThinkingCallback: ThinkingCallback = async (type, content) => {
      if (this.thinkingCallback) {
        await this.thinkingCallback('decide', type as string, content as string);
      }
    };
    decision = await this.decider.decideStream(orientation, decideThinkingCallback);
    
    const decideDuration = Date.now() - decideStart;
    
    // 记录 Decide 阶段结果
    const decideResult: PhaseResult<Decision> = {
      phase: 'decide',
      success: true,
      data: decision,
      llmInteraction: decideLLMInteraction,
      duration: decideDuration,
      timestamp: Date.now(),
    };
    cycleContext.decide = decideResult;
    console.log('[OODA] Decision complete:', decision.nextAction.type);
    
    // 推送 Decide 阶段完整数据到前端
    await callback({
      phase: 'decide',
      data: {
        phaseData: {
          phaseName: 'decide',
          input: {
            primaryIntent: orientation.primaryIntent,
            constraints: orientation.constraints,
            knowledgeGaps: orientation.knowledgeGaps,
            patterns: orientation.patterns,
            risks: orientation.risks,
          },
          output: {
            problemStatement: decision.problemStatement,
            options: decision.options.map(o => ({
              id: o.id,
              description: o.description,
              approach: o.approach,
              pros: o.pros,
              cons: o.cons,
              estimatedComplexity: o.estimatedComplexity,
              riskLevel: o.riskLevel,
              score: o.score,
            })),
            selectedOption: decision.selectedOption,
            plan: decision.plan,
            nextAction: decision.nextAction,
            reasoning: decision.reasoning,
            riskAssessment: decision.riskAssessment,
          },
          duration: decideDuration,
          success: true,
        },
      },
    });
    
    // ========== Debug: 打印 Decide 阶段的完整上下文 ==========
    debugJson('DECIDE-INPUT', {
      primaryIntent: orientation.primaryIntent,
      constraints: orientation.constraints,
      knowledgeGaps: orientation.knowledgeGaps,
      patterns: orientation.patterns,
      risks: orientation.risks,
    });
    debugJson('DECIDE-OUTPUT', {
      problemStatement: decision.problemStatement,
      options: decision.options.map(o => ({
        id: o.id,
        description: o.description,
        approach: o.approach,
        pros: o.pros,
        cons: o.cons,
        estimatedComplexity: o.estimatedComplexity,
        riskLevel: o.riskLevel,
        score: o.score,
      })),
      selectedOption: decision.selectedOption,
      plan: decision.plan,
      nextAction: decision.nextAction,
      reasoning: decision.reasoning,
      riskAssessment: decision.riskAssessment,
    });
    
    const decideEvent = { 
      phase: 'decide' as const, 
      data: { 
        reasoning: decision.reasoning,
        options: decision.options.map(o => o.description),
        selectedOption: decision.selectedOption.description,
      } 
    };
    await callback(decideEvent);
    await this.streamingManager?.handleOODAEvent(decideEvent);
    metrics.decideTime = decideDuration;
    
    // ========== 阶段 4: Act ==========
    let actStart = Date.now();
    const actEvent = { phase: 'act' as const };
    await callback(actEvent);
    await this.streamingManager?.handleOODAEvent(actEvent);
    
    if (decision.nextAction.toolName) {
      const toolCallEvent = {
        phase: 'act' as const,
        data: {
          toolCall: {
            id: `call-${state.currentStep}`,
            name: decision.nextAction.toolName,
            args: decision.nextAction.args || {},
          }
        }
      };
      await callback(toolCallEvent);
      await this.streamingManager?.handleOODAEvent(toolCallEvent);
    }
    
    let actionResult: ActionResult;
    
    // ========== Debug: 打印 Act 阶段的输入 ==========
    debugJson('ACT-INPUT', {
      nextAction: decision.nextAction,
      selectedOption: decision.selectedOption,
    });
    
    // 如果是响应类型且设置了流式回调，使用流式生成
    if (decision.nextAction.type === 'response' && this.streamContentCallback) {
      const action = decision.nextAction;
      const content = action.content || '';
      
      // 流式发送响应内容
      const chunkSize = 5;
      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.slice(i, i + chunkSize);
        await this.streamContentCallback(chunk, i + chunkSize >= content.length);
      }
      
      actionResult = {
        success: true,
        result: { type: 'response', content },
        feedback: {
          observations: [content],
          newInformation: [] as string[],
          issues: [] as string[],
          suggestions: [] as string[],
        },
        sideEffects: [],
      };
    } else {
      actionResult = await this.actor.act(decision);
    }
    
    const actDuration = Date.now() - actStart;
    
    // 记录 Act 阶段结果到上下文
    const actResult: PhaseResult<ActionResult> = {
      phase: 'act',
      success: actionResult.success,
      data: actionResult,
      duration: actDuration,
      timestamp: Date.now(),
    };
    cycleContext.act = actResult;
    
    // 推送 Act 阶段完整数据到前端
    await callback({
      phase: 'act',
      data: {
        phaseData: {
          phaseName: 'act',
          input: {
            nextAction: decision.nextAction,
            selectedOption: decision.selectedOption,
          },
          output: {
            success: actionResult.success,
            result: actionResult.result,
            feedback: actionResult.feedback,
            sideEffects: actionResult.sideEffects,
          },
          duration: actDuration,
          success: actionResult.success,
        },
      },
    });
    
    // ========== Debug: 打印 Act 阶段的输出 ==========
    debugJson('ACT-OUTPUT', {
      success: actionResult.success,
      result: actionResult.result,
      feedback: actionResult.feedback,
      sideEffects: actionResult.sideEffects,
    });
    
    // 打印阶段摘要
    console.log(`[OODA] Cycle ${this.currentIteration} complete: ${cycleContext.getSummary()}`);
    
    this.loopContext.previousResults.push(actionResult);
    
    // ========== P1-2: 学习模块集成 ==========
    // 从执行结果中学习
    const action = decision.nextAction;
    const intent = orientation.primaryIntent;
    
    // 1. 更新分层记忆
    this.hierarchicalMemory.addAction(
      action.toolName || action.type,
      actionResult.success
    );
    this.hierarchicalMemory.addKeyEvent(
      `${action.toolName || action.type}: ${actionResult.success ? '成功' : '失败'}`
    );
    
    // 2. 调用长期学习模块
    if (actionResult.success) {
      await this.learningModule.learnFromSuccess(action, actionResult, intent);
    } else {
      await this.learningModule.learnFromFailure(
        action, 
        actionResult, 
        intent, 
        actionResult.feedback.issues[0]
      );
    }
    
    // 3. 记录决策
    this.learningModule.recordDecision(
      intent.type,
      orientation.constraints.map(c => c.description),
      decision.selectedOption?.description || 'default',
      decision.options.map(o => o.description),
      actionResult.success ? 'success' : 'failure'
    );
    // ========== 学习模块集成结束 ==========
    
    // ========== P2: 结果验证模块 ==========
    // 在返回结果前，验证工具返回的结果是否符合用户需求
    const originalInput = state.originalInput || '';
    const validatedResult = await this.validateActionResult(originalInput, actionResult, decision);
    // ========== 结果验证结束 ==========
    
    if (validatedResult.feedback.issues.length > 0 || validatedResult.feedback.suggestions.length > 0) {
      const feedbackEvent = {
        phase: 'feedback' as const,
        data: {
          feedback: {
            observations: validatedResult.feedback.observations,
            issues: validatedResult.feedback.issues,
            suggestions: validatedResult.feedback.suggestions,
          }
        }
      };
      await callback(feedbackEvent);
      await this.streamingManager?.handleOODAEvent(feedbackEvent);
    }
    
    if (decision.nextAction.toolName) {
      const toolResultEvent = {
        phase: 'tool_result' as const,
        data: {
          toolCall: {
            id: `call-${state.currentStep}`,
            name: decision.nextAction.toolName,
            args: decision.nextAction.args || {},
            result: validatedResult.result,
          }
        }
      };
      await callback(toolResultEvent);
      await this.streamingManager?.handleOODAEvent(toolResultEvent);
    }
    metrics.actTime = actDuration;
    metrics.totalTime = Date.now() - cycleStartTime;
    this.performanceMetrics.push(metrics);
    
    const isComplete = cycleContext.isComplete();
    
    // 构建验证反馈 - 传递给下一轮循环
    const validationFeedback = {
      issues: validatedResult.feedback.issues || [],
      suggestions: validatedResult.feedback.suggestions || [],
      isValid: validatedResult.success,
      needsMoreWork: validatedResult.feedback.issues.length > 0,
      previousQuery: decision.nextAction.args?.query as string,
    };
    
    return {
      ...state,
      currentStep: state.currentStep + 1,
      isComplete,
      validationFeedback,
      history: [...state.history, {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: validatedResult.feedback.observations.join(' '),
        timestamp: Date.now(),
      }],
      result: {
        // 即使没有完成，也发送反馈内容
        output: validatedResult.feedback.observations.join('\n') || validatedResult.feedback.newInformation.join('\n') || '',
        steps: [...(state.result?.steps || []), { type: 'action', content: decision.reasoning, timestamp: Date.now() }],
        metadata: { actionResult: validatedResult, cycleContext },
      },
    };
  }

  private async getCachedObservation(state: AgentState): Promise<Observation> {
    if (!this.cacheEnabled) {
      return this.observer.observe(state);
    }
    const key = this.generateCacheKey(state);
    const cached = this.observationCache.get(key);
    if (cached) {
      return cached;
    }
    const observation = await this.observer.observe(state);
    this.observationCache.set(key, observation);
    return observation;
  }

  private async getCachedOrientation(observation: Observation): Promise<Orientation> {
    if (!this.cacheEnabled) {
      return this.orienter.orient(observation);
    }
    const key = JSON.stringify({ observation: observation.environment });
    const cached = this.orientationCache.get(key);
    if (cached) {
      return cached;
    }
    const orientation = await this.orienter.orient(observation);
    this.orientationCache.set(key, orientation);
    return orientation;
  }

  private async getCachedDecision(orientation: Orientation): Promise<Decision> {
    if (!this.cacheEnabled) {
      return this.decider.decide(orientation);
    }
    const key = JSON.stringify({ intent: orientation.primaryIntent.type });
    const cached = this.decisionCache.get(key);
    if (cached) {
      return cached;
    }
    const decision = await this.decider.decide(orientation);
    this.decisionCache.set(key, decision);
    return decision;
  }

  private generateCacheKey(state: AgentState): string {
    return `${state.originalInput}:${state.history.length}`;
  }

  private optimizeHistory(state: AgentState): AgentState {
    if (state.history.length > this.maxHistorySize) {
      return {
        ...state,
        history: state.history.slice(-this.maxHistorySize),
      };
    }
    return state;
  }

  private shouldAdapt(state: AgentState): boolean {
    if (!this.loopContext.previousResults.length) return false;
    const recentResults = this.loopContext.previousResults.slice(-3);
    const failureRate = recentResults.filter(r => !r.success).length / recentResults.length;
    return failureRate >= 0.5 || this.findRepeatedErrors(recentResults).length > 0;
  }

  private findRepeatedErrors(results: ActionResult[]): string[] {
    const errorTools: string[] = [];
    for (const result of results) {
      if (!result.success) {
        errorTools.push(JSON.stringify(result));
      }
    }
    return errorTools;
  }

  private async adaptStrategy(state: AgentState, callback: OODACallback): Promise<void> {
    const adaptationEvent = {
      phase: 'adaptation' as const,
      data: {
        adaptation: {
          reason: 'High failure rate detected',
          action: 'Adjusting strategy',
        }
      }
    };
    await callback(adaptationEvent);
    await this.streamingManager?.handleOODAEvent(adaptationEvent);
    this.loopContext.adaptationNotes.push(`[Iteration ${this.currentIteration}] Adapted strategy`);
  }

  private handleTimeout(state: AgentState): AgentResult {
    return {
      output: '任务执行超时',
      steps: state.result?.steps || [],
      metadata: { error: 'timeout' },
    };
  }

  private cleanupCache(): void {
    this.observationCache.cleanup();
    this.orientationCache.cleanup();
    this.decisionCache.cleanup();
  }

  getPerformanceMetrics(): PerformanceMetrics[] {
    return this.performanceMetrics;
  }

  clearCache(): void {
    this.observationCache.clear();
    this.orientationCache.clear();
    this.decisionCache.clear();
  }

  enableCache(ttl?: number, maxSize?: number): void {
    this.cacheEnabled = true;
    if (ttl) {
      this.cacheTTL = ttl;
    }
    if (maxSize) {
      this.maxCacheSize = maxSize;
    }
  }

  disableCache(): void {
    this.cacheEnabled = false;
    this.clearCache();
  }

  /**
   * 动态调整缓存策略 - 基于性能指标自动调整
   */
  private adaptCacheStrategy(): void {
    if (!this.adaptiveCacheEnabled || this.performanceMetrics.length < 3) {
      return;
    }

    // 计算最近几次的平均执行时间
    const recentMetrics = this.performanceMetrics.slice(-5);
    const avgTime = recentMetrics.reduce((sum, m) => sum + m.totalTime, 0) / recentMetrics.length;
    
    // 如果执行时间过长，启用或增加缓存
    if (avgTime > this.targetAvgTime * 2) {
      if (!this.cacheEnabled) {
        console.log('[OODA] 执行时间过长，启用缓存');
        this.enableCache();
      } else {
        // 增加 TTL
        const newTTL = Math.min(this.cacheTTL * 1.5, this.maxTTL);
        if (newTTL !== this.cacheTTL) {
          console.log('[OODA] 增加缓存 TTL:', this.cacheTTL, '->', newTTL);
          this.cacheTTL = newTTL;
        }
      }
    }
    // 如果执行时间很短，可以减少缓存
    else if (avgTime < this.targetAvgTime * 0.5 && this.cacheEnabled) {
      const newTTL = Math.max(this.cacheTTL * 0.7, this.minTTL);
      if (newTTL !== this.cacheTTL) {
        console.log('[OODA] 执行时间很短，减少缓存 TTL:', this.cacheTTL, '->', newTTL);
        this.cacheTTL = newTTL;
      }
    }
  }

  /**
   * 启用自适应缓存
   */
  enableAdaptiveCache(enabled: boolean): void {
    this.adaptiveCacheEnabled = enabled;
  }

  /**
   * 配置缓存参数
   */
  configureCache(config: { ttl?: number; maxSize?: number; minTTL?: number; maxTTL?: number }): void {
    if (config.ttl) this.cacheTTL = config.ttl;
    if (config.maxSize) this.maxCacheSize = config.maxSize;
    if (config.minTTL) this.minTTL = config.minTTL;
    if (config.maxTTL) this.maxTTL = config.maxTTL;

    if (config.maxSize) {
      this.observationCache = new LRUCache<Observation>({ maxSize: this.maxCacheSize, ttl: this.cacheTTL });
      this.orientationCache = new LRUCache<Orientation>({ maxSize: this.maxCacheSize, ttl: this.cacheTTL });
      this.decisionCache = new LRUCache<Decision>({ maxSize: this.maxCacheSize, ttl: this.cacheTTL });
    }
  }

  /**
   * ========== 结果验证模块 ==========
   * 在 Act 阶段执行完成后，验证工具返回的结果是否符合用户需求
   * 如果不符合，生成改进后的响应
   */
  private async validateActionResult(
    userInput: string,
    actionResult: ActionResult,
    decision: Decision
  ): Promise<ActionResult> {
    // 只对工具调用类型的结果进行验证
    if (decision.nextAction.type !== 'tool_call' || !actionResult.success) {
      return actionResult;
    }

    const toolName = decision.nextAction.toolName;
    
    // 只对搜索类工具进行验证
    const searchTools = ['web_search', 'web_search_and_fetch', 'search_web', 'webSearch'];
    if (!searchTools.includes(toolName || '')) {
      return actionResult;
    }

    try {
      const llm = getLLMService();
      
      // 获取工具返回的结果
      const resultData = actionResult.result as any;
      const results = resultData?.result?.results || resultData?.results || [];
      
      // 提取结果内容用于验证
      const resultSummary = results.slice(0, 3).map((r: any) => {
        const content = r.content || r.snippet || '';
        const title = r.title || '';
        return `标题: ${title}\n内容: ${content.slice(0, 300)}`;
      }).join('\n\n');

      const validationPrompt = `你是一个结果验证助手。请判断以下工具返回的结果是否回答了用户的问题。

## 用户原始问题
${userInput}

## 工具返回的结果（部分）
${resultSummary || '无内容'}

## 判断标准
1. 结果是否直接回答了用户的问题？
2. 结果是否提供了用户需要的信息？
3. 如果是新闻类问题，结果是否包含实际新闻内容（而非仅网站链接）？

## 输出格式（JSON）
{
  "isSatisfied": true/false,  // 结果是否满足用户需求
  "analysis": "简短分析",      // 为什么满足或不满足
  "improvedResponse": "如果结果不满足，生成改进后的响应"  // 可选
}

请只输出 JSON，不要有其他内容。`;

      const response = await llm.generate(validationPrompt, { maxTokens: 500 });
      const content = response.text || '';
      
      // 解析 JSON 响应
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('[ResultValidation] 验证结果:', parsed.isSatisfied, parsed.analysis);
        
        // 如果结果不满足用户需求，改进响应
        if (!parsed.isSatisfied && parsed.improvedResponse) {
          // 更新 feedback 中的 observations
          actionResult.feedback.observations = [parsed.improvedResponse];
          actionResult.feedback.suggestions.push('结果经过 LLM 验证和改进');
        } else if (parsed.isSatisfied && parsed.analysis) {
          // 添加分析说明
          actionResult.feedback.observations.push(`📋 结果分析: ${parsed.analysis}`);
        }
      }
    } catch (error) {
      console.error('[ResultValidation] 验证失败:', error);
      // 验证失败不影响原有结果
    }
    
    return actionResult;
  }
}
