import { AgentState, AgentResult, Message, Observation, Orientation, Decision, ActionResult } from '../types';
import { Observer, resetObserverState, initObserverLastStoredCount } from './observe';
import { Orienter, resetOrienterState, initOrienterCompressedCount, OrientThinkingCallback } from './orient';
import { Decider, DecideThinkingCallback } from './decide';
import { Actor } from './act';
import { getSessionMemory, SessionMemory } from '../memory';
import { StreamingOutputManager, StreamingHandler, StreamingConfig, createConsoleStreamingHandler } from './streaming';

export { ObserveAgent } from './observe';
export { OrientAgent } from './agent/orient';
export { DecideAgent } from './agent/decide';
export { ActAgent } from './agent/act';

type ThinkingCallback = (phase: 'orient' | 'decide', type: string, content: string) => void | Promise<void>;

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
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
  private observer: Observer;
  private orienter: Orienter;
  private decider: Decider;
  private actor: Actor;
  private sessionMemory: SessionMemory;
  private loopContext: LoopContext;
  private streamingManager?: StreamingOutputManager;
  private thinkingCallback?: ThinkingCallback;
  private streamContentCallback?: (chunk: string, isComplete: boolean) => Promise<void>;
  
  private maxIterations = 10;
  private timeout = 300000;
  private currentIteration = 0;
  private maxHistorySize = 100;
  
  private observationCache = new Map<string, CacheEntry<Observation>>();
  private orientationCache = new Map<string, CacheEntry<Orientation>>();
  private decisionCache = new Map<string, CacheEntry<Decision>>();
  
  private cacheTTL = 60000;
  private cacheEnabled = false;
  private maxCacheSize = 100;
  private performanceMetrics: PerformanceMetrics[] = [];
  
  constructor(sessionId?: string, streamingHandler?: StreamingHandler, streamingConfig?: Partial<StreamingConfig>) {
    this.sessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.sessionMemory = getSessionMemory(this.sessionId);
    this.loopContext = sessionLoopContextManager.getContext(this.sessionId);
    this.observer = new Observer(this.sessionId);
    this.orienter = new Orienter(this.sessionId);
    this.decider = new Decider();
    this.actor = new Actor(this.sessionId);
    
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
    
    let observeStart = Date.now();
    const observeEvent = { phase: 'observe' as const };
    await callback(observeEvent);
    await this.streamingManager?.handleOODAEvent(observeEvent);
    console.log('[OODA] Getting observation...');
    const observation = await this.getCachedObservation(state);
    this.enrichObservationWithContext(observation);
    console.log('[OODA] Observation complete');
    metrics.observeTime = Date.now() - observeStart;
    
    let orientStart = Date.now();
    console.log('[OODA] Getting orientation...');
    
    let orientation: Orientation;
    if (this.thinkingCallback) {
      const orientThinkingCallback: OrientThinkingCallback = async (type, content) => {
        await this.thinkingCallback!('orient', type, content);
      };
      orientation = await this.orienter.orientStream(observation, orientThinkingCallback);
    } else {
      orientation = await this.getCachedOrientation(observation);
    }
    console.log('[OODA] Orientation complete:', orientation.primaryIntent.type);
    
    this.loopContext.conversationSummary = orientation.relevantContext?.contextSummary;
    
    const orientEvent = { 
      phase: 'orient' as const, 
      data: { 
        intent: `意图类型: ${orientation.primaryIntent.type}, 置信度: ${orientation.primaryIntent.confidence}` 
      } 
    };
    await callback(orientEvent);
    await this.streamingManager?.handleOODAEvent(orientEvent);
    metrics.orientTime = Date.now() - orientStart;
    
    let decideStart = Date.now();
    console.log('[OODA] Getting decision...');
    
    let decision: Decision;
    if (this.thinkingCallback) {
      const decideThinkingCallback: DecideThinkingCallback = async (type, content) => {
        await this.thinkingCallback!('decide', type, content);
      };
      decision = await this.decider.decideStream(orientation, decideThinkingCallback);
    } else {
      decision = await this.getCachedDecision(orientation);
    }
    console.log('[OODA] Decision complete:', decision.nextAction.type);
    
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
    metrics.decideTime = Date.now() - decideStart;
    
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
      
      const actionResult = {
        success: true,
        result: { type: 'response', content },
        feedback: {
          observations: [content],
          newInformation: [] as string[],
          issues: [] as string[],
          suggestions: [] as string[],
        },
        sideEffects: [],
        executionTime: Date.now() - actStart,
      };
      
      this.loopContext.previousResults.push(actionResult);
      
      metrics.actTime = Date.now() - actStart;
      metrics.totalTime = Date.now() - cycleStartTime;
      this.performanceMetrics.push(metrics);
      
      return {
        ...state,
        currentStep: state.currentStep + 1,
        isComplete: true,
        history: [...state.history, {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: content,
          timestamp: Date.now(),
        }],
        result: {
          output: content,
          steps: [...(state.result?.steps || []), { type: 'action', content: decision.reasoning, timestamp: Date.now() }],
          metadata: { actionResult },
        },
      };
    }
    
    const actionResult = await this.actor.act(decision);
    this.loopContext.previousResults.push(actionResult);
    
    if (actionResult.feedback.issues.length > 0 || actionResult.feedback.suggestions.length > 0) {
      const feedbackEvent = {
        phase: 'feedback' as const,
        data: {
          feedback: {
            observations: actionResult.feedback.observations,
            issues: actionResult.feedback.issues,
            suggestions: actionResult.feedback.suggestions,
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
            result: actionResult.result,
          }
        }
      };
      await callback(toolResultEvent);
      await this.streamingManager?.handleOODAEvent(toolResultEvent);
    }
    metrics.actTime = Date.now() - actStart;
    metrics.totalTime = Date.now() - cycleStartTime;
    this.performanceMetrics.push(metrics);
    
    const isComplete = decision.nextAction.type === 'response' || actionResult.success;
    
    return {
      ...state,
      currentStep: state.currentStep + 1,
      isComplete,
      history: [...state.history, {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: actionResult.feedback.observations.join(' '),
        timestamp: Date.now(),
      }],
      result: isComplete ? {
        output: actionResult.feedback.observations.join('\n'),
        steps: [...(state.result?.steps || []), { type: 'action', content: decision.reasoning, timestamp: Date.now() }],
        metadata: { actionResult },
      } : state.result,
    };
  }

  private async getCachedObservation(state: AgentState): Promise<Observation> {
    if (!this.cacheEnabled) {
      return this.observer.observe(state);
    }
    const key = this.generateCacheKey(state);
    const cached = this.observationCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.value;
    }
    const observation = await this.observer.observe(state);
    this.observationCache.set(key, { value: observation, timestamp: Date.now(), ttl: this.cacheTTL });
    return observation;
  }

  private async getCachedOrientation(observation: Observation): Promise<Orientation> {
    if (!this.cacheEnabled) {
      return this.orienter.orient(observation);
    }
    const key = JSON.stringify({ observation: observation.environment });
    const cached = this.orientationCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.value;
    }
    const orientation = await this.orienter.orient(observation);
    this.orientationCache.set(key, { value: orientation, timestamp: Date.now(), ttl: this.cacheTTL });
    return orientation;
  }

  private async getCachedDecision(orientation: Orientation): Promise<Decision> {
    if (!this.cacheEnabled) {
      return this.decider.decide(orientation);
    }
    const key = JSON.stringify({ intent: orientation.primaryIntent.type });
    const cached = this.decisionCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.value;
    }
    const decision = await this.decider.decide(orientation);
    this.decisionCache.set(key, { value: decision, timestamp: Date.now(), ttl: this.cacheTTL });
    return decision;
  }

  private generateCacheKey(state: AgentState): string {
    return `${state.originalInput}:${state.history.length}`;
  }

  private enrichObservationWithContext(observation: Observation): void {
    // 可扩展：在观察阶段添加额外上下文
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
    if (this.observationCache.size > this.maxCacheSize) {
      this.observationCache.clear();
    }
    if (this.orientationCache.size > this.maxCacheSize) {
      this.orientationCache.clear();
    }
    if (this.decisionCache.size > this.maxCacheSize) {
      this.decisionCache.clear();
    }
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
    if (ttl) this.cacheTTL = ttl;
    if (maxSize) this.maxCacheSize = maxSize;
  }

  disableCache(): void {
    this.cacheEnabled = false;
    this.clearCache();
  }
}
