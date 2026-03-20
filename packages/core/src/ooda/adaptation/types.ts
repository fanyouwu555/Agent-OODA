export type AdaptationStrategyType = 'cache' | 'retry' | 'tool_selection' | 'model';

export type TriggerType = 'threshold' | 'pattern' | 'manual';

export interface AdaptationStrategyConfig {
  cacheTTL?: number;
  cacheMaxSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  retryBackoff?: 'linear' | 'exponential';
  preferredTools?: string[];
  fallbackTools?: string[];
  modelName?: string;
  temperature?: number;
}

export interface ThresholdTrigger {
  metric: string;
  operator: '>' | '<' | '>=' | '<=';
  value: number;
}

export interface AdaptationStrategy {
  id: string;
  name: string;
  type: AdaptationStrategyType;
  trigger: TriggerType;
  enabled: boolean;
  config: AdaptationStrategyConfig;
  threshold?: ThresholdTrigger;
}

export interface AdaptationResult {
  applied: boolean;
  strategy: AdaptationStrategy;
  effect: 'positive' | 'negative' | 'neutral';
  metrics: {
    before: PerformanceMetrics;
    after: PerformanceMetrics;
  };
  timestamp: number;
}

export interface PerformanceMetrics {
  latency: number;
  errorRate: number;
  successRate: number;
  cacheHitRate: number;
  retryCount: number;
  toolUsage: Record<string, number>;
}

export interface AdaptationRuleOptions {
  id: string;
  name: string;
  type: AdaptationStrategyType;
  trigger?: TriggerType;
  enabled?: boolean;
  config?: AdaptationStrategyConfig;
  threshold?: ThresholdTrigger;
}
