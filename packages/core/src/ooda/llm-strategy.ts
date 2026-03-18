// packages/core/src/ooda/llm-strategy.ts
// OODA 阶段 LLM 使用策略

import { AgentState, ToolResult, Action, Decision, ActionResult } from '../types';

/**
 * LLM 使用模式
 */
export type LLMUsageMode = 
  | 'always'      // 总是使用 LLM
  | 'never'       // 从不使用 LLM
  | 'auto';       // 自动判断（基于条件）

/**
 * 成本配置
 */
export interface LLMCostConfig {
  /** 每次调用预估成本（分） */
  estimatedCostPerCall: number;
  /** 预算上限（分） */
  budgetLimit: number;
  /** 当前消耗（分） */
  currentSpend: number;
}

/**
 * LLM 使用策略配置
 */
export interface LLMUsagePolicy {
  // Observe 阶段策略
  observe: {
    mode: LLMUsageMode;
    // 自动模式下的触发条件
    triggers?: {
      errorRateThreshold?: number;
      toolCountThreshold?: number;
      hasAnomalies?: boolean;
      complexTask?: boolean;
    };
  };
  
  // Act 阶段策略
  act: {
    mode: LLMUsageMode;
    triggers?: {
      isError?: boolean;
      complexResult?: boolean;
      noSuggestions?: boolean;
      confidenceThreshold?: number;
    };
  };
  
  // Orient 和 Decide 阶段（必须使用 LLM）
  orient: { mode: 'always' };
  decide: { mode: 'always' };
}

/**
 * 默认策略配置
 */
export const defaultLLMUsagePolicy: LLMUsagePolicy = {
  observe: {
    mode: 'auto',
    triggers: {
      errorRateThreshold: 0.3,
      toolCountThreshold: 5,
      hasAnomalies: true,
    }
  },
  act: {
    mode: 'auto',
    triggers: {
      isError: true,
      complexResult: true,
      noSuggestions: true,
    }
  },
  orient: { mode: 'always' },
  decide: { mode: 'always' }
};

/**
 * 上下文信息 - 用于决策
 */
export interface StrategyContext {
  // Observe 阶段上下文
  observe?: {
    state: AgentState;
    toolResults: ToolResult[];
    ruleDetectedAnomalies: number;
    toolCount: number;
    isComplexTask?: boolean;
  };
  
  // Act 阶段上下文
  act?: {
    action: Action;
    result: unknown;
    isError: boolean;
    hasHeuristicSuggestions: boolean;
    decision: Decision;
  };
}

/**
 * LLM 策略决策器
 */
export class LLMStrategyDecider {
  private policy: LLMUsagePolicy;
  private costConfig: LLMCostConfig;
  
  constructor(policy: Partial<LLMUsagePolicy> = {}, costConfig?: Partial<LLMCostConfig>) {
    this.policy = { ...defaultLLMUsagePolicy, ...policy };
    this.costConfig = {
      estimatedCostPerCall: 0.1,
      budgetLimit: 10,
      currentSpend: 0,
      ...costConfig,
    };
  }
  
  /**
   * 判断 Observe 阶段是否需要使用 LLM
   */
  shouldUseLLMForObserve(context: StrategyContext['observe']): boolean {
    // 预算检查
    if (this.costConfig.currentSpend >= this.costConfig.budgetLimit) {
      console.log('[LLMStrategy] 预算已用完，跳过 LLM');
      return false;
    }

    const observePolicy = this.policy.observe;
    
    if (observePolicy.mode === 'always') {
      return true;
    }
    
    if (observePolicy.mode === 'never') {
      return false;
    }
    
    if (observePolicy.mode === 'auto' && context) {
      const triggers = observePolicy.triggers || {};
      
      if (triggers.errorRateThreshold !== undefined && context.toolResults.length > 0) {
        const errorCount = context.toolResults.filter(r => r.isError).length;
        const errorRate = errorCount / context.toolResults.length;
        if (errorRate >= triggers.errorRateThreshold) {
          console.log('[LLMStrategy] Observe: 错误率触发 LLM', { errorRate, threshold: triggers.errorRateThreshold });
          return true;
        }
      }
      
      if (triggers.toolCountThreshold !== undefined && context.toolCount >= triggers.toolCountThreshold) {
        console.log('[LLMStrategy] Observe: 工具数量触发 LLM', { toolCount: context.toolCount, threshold: triggers.toolCountThreshold });
        return true;
      }
      
      if (triggers.hasAnomalies && context.ruleDetectedAnomalies > 0) {
        console.log('[LLMStrategy] Observe: 已有异常触发 LLM', { anomalies: context.ruleDetectedAnomalies });
        return true;
      }
      
      if (triggers.complexTask) {
        const inputLength = context.state.originalInput.length;
        const complexKeywords = ['实现', '开发', '创建', '设计', '重构', '修复', '分析', '比较'];
        const isComplex = inputLength > 200 || complexKeywords.some(k => context.state.originalInput.includes(k));
        if (isComplex) {
          console.log('[LLMStrategy] Observe: 复杂任务触发 LLM');
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * 判断 Act 阶段是否需要使用 LLM
   */
  shouldUseLLMForAct(context: StrategyContext['act']): boolean {
    // 预算检查
    if (this.costConfig.currentSpend >= this.costConfig.budgetLimit) {
      console.log('[LLMStrategy] 预算已用完，跳过 LLM');
      return false;
    }

    const actPolicy = this.policy.act;
    
    if (actPolicy.mode === 'always') {
      return true;
    }
    
    if (actPolicy.mode === 'never') {
      return false;
    }
    
    if (actPolicy.mode === 'auto' && context) {
      const triggers = actPolicy.triggers || {};
      
      if (triggers.isError && context.isError) {
        console.log('[LLMStrategy] Act: 错误触发 LLM');
        return true;
      }
      
      if (triggers.complexResult && context.result) {
        const resultStr = JSON.stringify(context.result);
        if (resultStr.length > 1000) {
          console.log('[LLMStrategy] Act: 复杂结果触发 LLM', { length: resultStr.length });
          return true;
        }
      }
      
      if (triggers.noSuggestions && !context.hasHeuristicSuggestions && context.isError) {
        console.log('[LLMStrategy] Act: 无建议且错误触发 LLM');
        return true;
      }
      
      if (triggers.confidenceThreshold !== undefined) {
        const confidence = context.decision.decisionMetadata?.confidence || 1;
        if (confidence < triggers.confidenceThreshold) {
          console.log('[LLMStrategy] Act: 置信度触发 LLM', { confidence, threshold: triggers.confidenceThreshold });
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * 记录 LLM 调用成本
   */
  recordCost(cost: number): void {
    this.costConfig.currentSpend += cost;
  }

  /**
   * 重置成本计数
   */
  resetCost(): void {
    this.costConfig.currentSpend = 0;
  }

  /**
   * 获取成本信息
   */
  getCostInfo(): LLMCostConfig {
    return { ...this.costConfig };
  }
  
  /**
   * 更新策略
   */
  updatePolicy(policy: Partial<LLMUsagePolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }
  
  /**
   * 获取当前策略
   */
  getPolicy(): LLMUsagePolicy {
    return { ...this.policy };
  }
}

// 全局策略实例
let globalLLMStrategyDecider: LLMStrategyDecider | null = null;

export function getLLMStrategyDecider(): LLMStrategyDecider {
  if (!globalLLMStrategyDecider) {
    globalLLMStrategyDecider = new LLMStrategyDecider();
  }
  return globalLLMStrategyDecider;
}

export function setLLMStrategyDecider(decider: LLMStrategyDecider): void {
  globalLLMStrategyDecider = decider;
}
