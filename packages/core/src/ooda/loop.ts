// packages/core/src/ooda/loop.ts
import { AgentState, AgentResult, Message, Observation, Orientation, Decision, ActionResult } from '../types';
import { Observer } from './observe';
import { Orienter } from './orient';
import { Decider } from './decide';
import { Actor } from './act';

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
}

export interface OODAEvent {
  phase: 'observe' | 'orient' | 'decide' | 'act' | 'tool_result' | 'complete' | 'feedback' | 'adaptation';
  data?: {
    intent?: string;
    reasoning?: string;
    options?: string[];
    selectedOption?: string;
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

export class OODALoop {
  private observer = new Observer();
  private orienter = new Orienter();
  private decider = new Decider();
  private actor = new Actor();
  
  private maxIterations = 10;
  private timeout = 300000;
  private currentIteration = 0;
  private maxHistorySize = 100;
  
  private observationCache = new Map<string, CacheEntry<Observation>>();
  private orientationCache = new Map<string, CacheEntry<Orientation>>();
  private decisionCache = new Map<string, CacheEntry<Decision>>();
  
  private cacheTTL = 30000;
  private performanceMetrics: PerformanceMetrics[] = [];
  
  private loopContext: LoopContext = {
    previousResults: [],
    learningInsights: [],
    adaptationNotes: [],
  };

  async run(input: string): Promise<AgentResult> {
    return this.runWithCallback(input, () => {});
  }

  async runWithCallback(input: string, callback: OODACallback): Promise<AgentResult> {
    this.loopContext = {
      previousResults: [],
      learningInsights: [],
      adaptationNotes: [],
    };
    
    const initialState: AgentState = {
      originalInput: input,
      history: [{
        id: 'initial',
        role: 'user',
        content: input,
        timestamp: Date.now(),
      }],
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
    
    await callback({ phase: 'complete' });
    
    return this.finalizeResult(state);
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
    await callback({ phase: 'observe' });
    console.log('[OODA] Getting observation...');
    const observation = await this.getCachedObservation(state);
    this.enrichObservationWithContext(observation);
    console.log('[OODA] Observation complete');
    metrics.observeTime = Date.now() - observeStart;
    
    let orientStart = Date.now();
    console.log('[OODA] Getting orientation...');
    const orientation = await this.getCachedOrientation(observation);
    console.log('[OODA] Orientation complete:', orientation.primaryIntent.type);
    await callback({ 
      phase: 'orient', 
      data: { 
        intent: `意图类型: ${orientation.primaryIntent.type}, 置信度: ${orientation.primaryIntent.confidence}` 
      } 
    });
    metrics.orientTime = Date.now() - orientStart;
    
    let decideStart = Date.now();
    console.log('[OODA] Getting decision...');
    const decision = await this.getCachedDecision(orientation);
    console.log('[OODA] Decision complete:', decision.nextAction.type);
    
    await callback({ 
      phase: 'decide', 
      data: { 
        reasoning: decision.reasoning,
        options: decision.options.map(o => o.description),
        selectedOption: decision.selectedOption.description,
      } 
    });
    metrics.decideTime = Date.now() - decideStart;
    
    let actStart = Date.now();
    await callback({ phase: 'act' });
    
    if (decision.nextAction.toolName) {
      await callback({
        phase: 'act',
        data: {
          toolCall: {
            id: `call-${state.currentStep}`,
            name: decision.nextAction.toolName,
            args: decision.nextAction.args || {},
          }
        }
      });
    }
    
    const actionResult = await this.actor.act(decision);
    this.loopContext.previousResults.push(actionResult);
    
    if (actionResult.feedback.issues.length > 0 || actionResult.feedback.suggestions.length > 0) {
      await callback({
        phase: 'feedback',
        data: {
          feedback: {
            observations: actionResult.feedback.observations,
            issues: actionResult.feedback.issues,
            suggestions: actionResult.feedback.suggestions,
          }
        }
      });
    }
    
    if (decision.nextAction.toolName) {
      await callback({
        phase: 'tool_result',
        data: {
          toolCall: {
            id: `call-${state.currentStep}`,
            name: decision.nextAction.toolName,
            args: decision.nextAction.args || {},
            result: actionResult.result,
          }
        }
      });
    }
    
    metrics.actTime = Date.now() - actStart;
    
    metrics.totalTime = Date.now() - cycleStartTime;
    this.performanceMetrics.push(metrics);
    
    this.extractLearningInsights(actionResult, decision);
    
    const newMessages: Message[] = [
      {
        id: `step-${state.currentStep}`,
        role: 'assistant',
        content: decision.reasoning,
        timestamp: Date.now(),
        parts: [{
          type: 'text',
          text: decision.reasoning,
        }],
      },
    ];
    
    if (decision.nextAction.type === 'tool_call' || decision.nextAction.type === 'skill_call') {
      newMessages.push({
        id: `action-${state.currentStep}`,
        role: 'assistant',
        content: JSON.stringify(decision.nextAction),
        timestamp: Date.now(),
        parts: [{
          type: 'tool_call',
          toolCallId: `call-${state.currentStep}`,
          toolName: decision.nextAction.toolName!,
          args: decision.nextAction.args!,
        }],
      });
      
      newMessages.push({
        id: `result-${state.currentStep}`,
        role: 'tool',
        content: JSON.stringify(actionResult.result),
        timestamp: Date.now(),
        parts: [{
          type: 'tool_result',
          toolCallId: `call-${state.currentStep}`,
          result: actionResult.result,
          isError: !actionResult.success,
        }],
      });
    }
    
    const isComplete = this.determineCompletion(decision, actionResult);
    
    const updatedState: AgentState = {
      ...state,
      history: [
        ...state.history,
        ...newMessages,
      ],
      currentStep: state.currentStep + 1,
      isComplete,
      metadata: {
        ...state.metadata,
        lastAction: decision.nextAction,
        lastResult: actionResult,
        performanceMetrics: metrics,
        learningInsights: this.loopContext.learningInsights,
      },
    };
    
    if (updatedState.isComplete) {
      const output = this.generateFinalOutput(decision, actionResult);
      updatedState.result = {
        output,
        steps: updatedState.history.map((msg, index) => ({
          type: index % 3 === 0 ? 'thought' : index % 3 === 1 ? 'action' : 'observation',
          content: msg.content,
          timestamp: msg.timestamp,
        })),
        metadata: {
          ...updatedState.metadata,
          performanceMetrics: this.getAveragePerformanceMetrics(),
          totalIterations: this.currentIteration + 1,
          learningInsights: this.loopContext.learningInsights,
        },
      };
    }
    
    return updatedState;
  }

  private enrichObservationWithContext(observation: Observation): void {
    if (this.loopContext.previousResults.length > 0) {
      const recentFeedback = this.loopContext.previousResults
        .slice(-3)
        .flatMap(r => r.feedback.observations);
      
      observation.context.relevantFacts.push(...recentFeedback);
    }
    
    if (this.loopContext.learningInsights.length > 0) {
      observation.context.relevantFacts.push(...this.loopContext.learningInsights.slice(-5));
    }
  }

  private shouldAdapt(state: AgentState): boolean {
    const recentResults = this.loopContext.previousResults.slice(-3);
    if (recentResults.length < 2) return false;
    
    const failureRate = recentResults.filter(r => !r.success).length / recentResults.length;
    if (failureRate >= 0.5) return true;
    
    const repeatedErrors = this.findRepeatedErrors(recentResults);
    if (repeatedErrors.length > 0) return true;
    
    return false;
  }

  private findRepeatedErrors(results: ActionResult[]): string[] {
    const errorMessages: Record<string, number> = {};
    
    for (const result of results) {
      if (!result.success) {
        const errorMsg = result.feedback.issues.join('; ');
        errorMessages[errorMsg] = (errorMessages[errorMsg] || 0) + 1;
      }
    }
    
    return Object.entries(errorMessages)
      .filter(([_, count]) => count >= 2)
      .map(([msg, _]) => msg);
  }

  private async adaptStrategy(state: AgentState, callback: OODACallback): Promise<void> {
    const recentErrors = this.loopContext.previousResults
      .filter(r => !r.success)
      .flatMap(r => r.feedback.issues);
    
    const adaptationNote = `检测到重复失败模式: ${recentErrors.slice(0, 3).join(', ')}. 建议调整策略.`;
    this.loopContext.adaptationNotes.push(adaptationNote);
    
    await callback({
      phase: 'adaptation',
      data: {
        adaptation: {
          reason: '检测到高失败率或重复错误',
          action: '将在下一轮迭代中调整决策策略',
        }
      }
    });
    
    console.log(`[OODA] Adapting strategy: ${adaptationNote}`);
  }

  private extractLearningInsights(actionResult: ActionResult, decision: Decision): void {
    if (!actionResult.success) {
      const insight = `方案 "${decision.selectedOption.description}" 失败: ${actionResult.feedback.issues.join(', ')}`;
      this.loopContext.learningInsights.push(insight);
    } else if (actionResult.feedback.newInformation.length > 0) {
      const insight = actionResult.feedback.newInformation[0];
      this.loopContext.learningInsights.push(insight);
    }
    
    if (this.loopContext.learningInsights.length > 20) {
      this.loopContext.learningInsights = this.loopContext.learningInsights.slice(-15);
    }
  }

  private determineCompletion(decision: Decision, actionResult: ActionResult): boolean {
    if (decision.nextAction.type === 'response') {
      return true;
    }
    
    if (decision.nextAction.type === 'clarification') {
      return true;
    }
    
    if (actionResult.success && decision.plan.subtasks.length === 0) {
      return true;
    }
    
    const pendingTasks = decision.plan.subtasks.filter(t => t.status === 'pending');
    if (pendingTasks.length === 0 && actionResult.success) {
      return true;
    }
    
    return false;
  }

  private generateFinalOutput(decision: Decision, actionResult: ActionResult): string {
    if (decision.nextAction.type === 'response') {
      return decision.nextAction.content || '任务完成';
    }
    
    if (decision.nextAction.type === 'clarification') {
      return decision.nextAction.clarificationQuestion || '需要更多信息';
    }
    
    if (actionResult.success) {
      const resultData = actionResult.result as any;
      if (resultData && resultData.result) {
        if (typeof resultData.result === 'string') {
          return resultData.result;
        }
        try {
          return JSON.stringify(resultData.result, null, 2);
        } catch {
          return '任务完成';
        }
      }
      return '任务完成';
    }
    
    return `任务执行遇到问题: ${actionResult.feedback.issues.join(', ')}`;
  }

  private async getCachedObservation(state: AgentState): Promise<Observation> {
    const cacheKey = this.generateCacheKey(state);
    const cached = this.observationCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.value;
    }
    
    const observation = await this.observer.observe(state);
    
    this.observationCache.set(cacheKey, {
      value: observation,
      timestamp: Date.now(),
      ttl: this.cacheTTL,
    });
    
    return observation;
  }

  private async getCachedOrientation(observation: Observation): Promise<Orientation> {
    const cacheKey = this.generateObservationKey(observation);
    const cached = this.orientationCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.value;
    }
    
    const orientation = await this.orienter.orient(observation);
    
    this.orientationCache.set(cacheKey, {
      value: orientation,
      timestamp: Date.now(),
      ttl: this.cacheTTL,
    });
    
    return orientation;
  }

  private async getCachedDecision(orientation: Orientation): Promise<Decision> {
    const cacheKey = this.generateOrientationKey(orientation);
    const cached = this.decisionCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.value;
    }
    
    const decision = await this.decider.decide(orientation);
    
    this.decisionCache.set(cacheKey, {
      value: decision,
      timestamp: Date.now(),
      ttl: this.cacheTTL,
    });
    
    return decision;
  }

  private generateCacheKey(state: AgentState): string {
    return `${state.originalInput}-${state.currentStep}-${state.history.length}`;
  }

  private generateObservationKey(observation: Observation): string {
    return `${observation.userInput}-${observation.toolResults.length}`;
  }

  private generateOrientationKey(orientation: Orientation): string {
    return `${orientation.primaryIntent.type}-${orientation.constraints.length}`;
  }

  private optimizeHistory(state: AgentState): AgentState {
    if (state.history.length > this.maxHistorySize) {
      const recentHistory = state.history.slice(-this.maxHistorySize);
      return {
        ...state,
        history: recentHistory,
      };
    }
    return state;
  }

  private cleanupCache(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.observationCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.observationCache.delete(key);
      }
    }
    
    for (const [key, entry] of this.orientationCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.orientationCache.delete(key);
      }
    }
    
    for (const [key, entry] of this.decisionCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.decisionCache.delete(key);
      }
    }
  }

  private getAveragePerformanceMetrics(): PerformanceMetrics {
    if (this.performanceMetrics.length === 0) {
      return {
        observeTime: 0,
        orientTime: 0,
        decideTime: 0,
        actTime: 0,
        totalTime: 0,
      };
    }
    
    const sum = this.performanceMetrics.reduce((acc, metrics) => ({
      observeTime: acc.observeTime + metrics.observeTime,
      orientTime: acc.orientTime + metrics.orientTime,
      decideTime: acc.decideTime + metrics.decideTime,
      actTime: acc.actTime + metrics.actTime,
      totalTime: acc.totalTime + metrics.totalTime,
    }), {
      observeTime: 0,
      orientTime: 0,
      decideTime: 0,
      actTime: 0,
      totalTime: 0,
    });
    
    const count = this.performanceMetrics.length;
    
    return {
      observeTime: Math.round(sum.observeTime / count),
      orientTime: Math.round(sum.orientTime / count),
      decideTime: Math.round(sum.decideTime / count),
      actTime: Math.round(sum.actTime / count),
      totalTime: Math.round(sum.totalTime / count),
    };
  }

  private handleTimeout(state: AgentState): AgentResult {
    return {
      output: '任务执行超时',
      steps: state.history.map((msg, index) => ({
        type: index % 3 === 0 ? 'thought' : index % 3 === 1 ? 'action' : 'observation',
        content: msg.content,
        timestamp: msg.timestamp,
      })),
      metadata: {
        ...state.metadata,
        isTimeout: true,
        iterations: this.currentIteration,
        timeout: this.timeout,
        performanceMetrics: this.getAveragePerformanceMetrics(),
        learningInsights: this.loopContext.learningInsights,
      },
    };
  }

  private finalizeResult(state: AgentState): AgentResult {
    if (state.result) {
      return state.result;
    }
    
    return {
      output: '任务执行未完成',
      steps: state.history.map((msg, index) => ({
        type: index % 3 === 0 ? 'thought' : index % 3 === 1 ? 'action' : 'observation',
        content: msg.content,
        timestamp: msg.timestamp,
      })),
      metadata: {
        ...state.metadata,
        iterations: this.currentIteration,
        performanceMetrics: this.getAveragePerformanceMetrics(),
        learningInsights: this.loopContext.learningInsights,
      },
    };
  }
}
