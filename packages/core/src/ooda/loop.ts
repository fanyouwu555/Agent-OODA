// packages/core/src/ooda/loop.ts
import { AgentState, AgentResult, Message, Observation, Orientation, Decision } from '../types';
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

export interface OODAEvent {
  phase: 'observe' | 'orient' | 'decide' | 'act' | 'tool_result' | 'complete';
  data?: {
    intent?: string;
    reasoning?: string;
    toolCall?: {
      id: string;
      name: string;
      args: Record<string, unknown>;
      result?: unknown;
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

  async run(input: string): Promise<AgentResult> {
    return this.runWithCallback(input, () => {});
  }

  async runWithCallback(input: string, callback: OODACallback): Promise<AgentResult> {
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
        reasoning: decision.reasoning 
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
    
    if (decision.nextAction.toolName) {
      await callback({
        phase: 'tool_result',
        data: {
          toolCall: {
            id: `call-${state.currentStep}`,
            name: decision.nextAction.toolName,
            args: decision.nextAction.args || {},
            result: actionResult,
          }
        }
      });
    }
    
    metrics.actTime = Date.now() - actStart;
    
    metrics.totalTime = Date.now() - cycleStartTime;
    this.performanceMetrics.push(metrics);
    
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
      {
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
      },
      {
        id: `result-${state.currentStep}`,
        role: 'tool',
        content: JSON.stringify(actionResult),
        timestamp: Date.now(),
        parts: [{
          type: 'tool_result',
          toolCallId: `call-${state.currentStep}`,
          result: actionResult,
        }],
      },
    ];
    
    const updatedState: AgentState = {
      ...state,
      history: [
        ...state.history,
        ...newMessages,
      ],
      currentStep: state.currentStep + 1,
      isComplete: decision.nextAction.type === 'response',
      metadata: {
        ...state.metadata,
        lastAction: decision.nextAction,
        lastResult: actionResult,
        performanceMetrics: metrics,
      },
    };
    
    if (updatedState.isComplete) {
      updatedState.result = {
        output: decision.nextAction.content!,
        steps: updatedState.history.map((msg, index) => ({
          type: index % 3 === 0 ? 'thought' : index % 3 === 1 ? 'action' : 'observation',
          content: msg.content,
          timestamp: msg.timestamp,
        })),
        metadata: {
          ...updatedState.metadata,
          performanceMetrics: this.getAveragePerformanceMetrics(),
        },
      };
    }
    
    return updatedState;
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
      },
    };
  }
}
