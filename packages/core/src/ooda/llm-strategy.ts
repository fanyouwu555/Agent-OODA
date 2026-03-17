// packages/core/src/ooda/llm-strategy.ts
// OODA 阶段 LLM 使用策略

import { AgentState, ToolResult, Action, Decision, ActionResult } from '../types';

/**
 * LLM 使用模式
 */
export type LLMUsageMode = 
  | 'always'      // 总是使用 LLM
  | 'never'      // 从不使用 LLM
  | 'auto';      // 自动判断（基于条件）

/**
 * LLM 使用策略配置
 */
export interface LLMUsagePolicy {
  // Observe 阶段策略
  observe: {
    mode: LLMUsageMode;
    // 自动模式下的触发条件
    triggers?: {
      errorRateThreshold?: number;      // 错误率超过此值时使用 LLM
      toolCountThreshold?: number;     // 工具调用数量超过此值时使用 LLM
      hasAnomalies?: boolean;           // 已检测到异常时使用 LLM
      complexTask?: boolean;           // 复杂任务时使用 LLM
    };
  };
  
  // Act 阶段策略
  act: {
    mode: LLMUsageMode;
    triggers?: {
      isError?: boolean;               // 执行出错时使用 LLM
      complexResult?: boolean;         // 结果复杂时使用 LLM
      noSuggestions?: boolean;          // 启发式无建议时使用 LLM
      confidenceThreshold?: number;    // 置信度低于此值时使用 LLM
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
      errorRateThreshold: 0.3,        // 错误率超过 30%
      toolCountThreshold: 5,          // 工具调用超过 5 次
      hasAnomalies: true,             // 检测到异常
    }
  },
  act: {
    mode: 'auto',
    triggers: {
      isError: true,                  // 执行出错
      complexResult: true,           // 结果复杂
      noSuggestions: true,           // 无启发式建议
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
  
  constructor(policy: Partial<LLMUsagePolicy> = {}) {
    this.policy = { ...defaultLLMUsagePolicy, ...policy };
  }
  
  /**
   * 判断 Observe 阶段是否需要使用 LLM
   */
  shouldUseLLMForObserve(context: StrategyContext['observe']): boolean {
    const observePolicy = this.policy.observe;
    
    // 总是模式
    if (observePolicy.mode === 'always') {
      return true;
    }
    
    // 从不模式
    if (observePolicy.mode === 'never') {
      return false;
    }
    
    // 自动模式 - 检查触发条件
    if (observePolicy.mode === 'auto' && context) {
      const triggers = observePolicy.triggers || {};
      
      // 1. 错误率触发
      if (triggers.errorRateThreshold !== undefined && context.toolResults.length > 0) {
        const errorCount = context.toolResults.filter(r => r.isError).length;
        const errorRate = errorCount / context.toolResults.length;
        if (errorRate >= triggers.errorRateThreshold) {
          console.log('[LLMStrategy] Observe: 错误率触发 LLM', { errorRate, threshold: triggers.errorRateThreshold });
          return true;
        }
      }
      
      // 2. 工具数量触发
      if (triggers.toolCountThreshold !== undefined && context.toolCount >= triggers.toolCountThreshold) {
        console.log('[LLMStrategy] Observe: 工具数量触发 LLM', { toolCount: context.toolCount, threshold: triggers.toolCountThreshold });
        return true;
      }
      
      // 3. 已有异常触发
      if (triggers.hasAnomalies && context.ruleDetectedAnomalies > 0) {
        console.log('[LLMStrategy] Observe: 已有异常触发 LLM', { anomalies: context.ruleDetectedAnomalies });
        return true;
      }
      
      // 4. 复杂任务触发（简单启发式：输入长度 > 200 或包含特定关键词）
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
    
    // 默认不触发
    return false;
  }
  
  /**
   * 判断 Act 阶段是否需要使用 LLM
   */
  shouldUseLLMForAct(context: StrategyContext['act']): boolean {
    const actPolicy = this.policy.act;
    
    // 总是模式
    if (actPolicy.mode === 'always') {
      return true;
    }
    
    // 从不模式
    if (actPolicy.mode === 'never') {
      return false;
    }
    
    // 自动模式 - 检查触发条件
    if (actPolicy.mode === 'auto' && context) {
      const triggers = actPolicy.triggers || {};
      
      // 1. 错误触发
      if (triggers.isError && context.isError) {
        console.log('[LLMStrategy] Act: 错误触发 LLM');
        return true;
      }
      
      // 2. 复杂结果触发
      if (triggers.complexResult && context.result) {
        const resultStr = JSON.stringify(context.result);
        // 结果超过 1000 字符认为是复杂结果
        if (resultStr.length > 1000) {
          console.log('[LLMStrategy] Act: 复杂结果触发 LLM', { length: resultStr.length });
          return true;
        }
      }
      
      // 3. 无启发式建议触发
      if (triggers.noSuggestions && !context.hasHeuristicSuggestions && context.isError) {
        console.log('[LLMStrategy] Act: 无建议且错误触发 LLM');
        return true;
      }
      
      // 4. 置信度触发
      if (triggers.confidenceThreshold !== undefined) {
        const confidence = context.decision.decisionMetadata?.confidence || 1;
        if (confidence < triggers.confidenceThreshold) {
          console.log('[LLMStrategy] Act: 置信度触发 LLM', { confidence, threshold: triggers.confidenceThreshold });
          return true;
        }
      }
    }
    
    // 默认不触发
    return false;
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
