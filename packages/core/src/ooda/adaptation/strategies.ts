import { AdaptationRuleOptions } from './types';

export const DEFAULT_ADAPTATION_STRATEGIES: AdaptationRuleOptions[] = [
  {
    id: 'cache-when-slow',
    name: 'Cache When Slow',
    type: 'cache',
    trigger: 'threshold',
    enabled: true,
    threshold: {
      metric: 'latency',
      operator: '>',
      value: 2000,
    },
    config: {
      cacheTTL: 120000,
      cacheMaxSize: 150,
    },
  },
  {
    id: 'cache-when-error',
    name: 'Cache When Error Rate High',
    type: 'cache',
    trigger: 'threshold',
    enabled: true,
    threshold: {
      metric: 'errorRate',
      operator: '>',
      value: 0.1,
    },
    config: {
      cacheTTL: 60000,
      cacheMaxSize: 200,
    },
  },
  {
    id: 'increase-retry-on-error',
    name: 'Increase Retry On Error',
    type: 'retry',
    trigger: 'threshold',
    enabled: true,
    threshold: {
      metric: 'errorRate',
      operator: '>',
      value: 0.15,
    },
    config: {
      maxRetries: 5,
      retryDelay: 1000,
      retryBackoff: 'exponential',
    },
  },
  {
    id: 'decrease-retry-on-success',
    name: 'Decrease Retry On High Success',
    type: 'retry',
    trigger: 'threshold',
    enabled: true,
    threshold: {
      metric: 'successRate',
      operator: '>=',
      value: 0.95,
    },
    config: {
      maxRetries: 1,
      retryDelay: 500,
      retryBackoff: 'linear',
    },
  },
  {
    id: 'prefer-fast-tools',
    name: 'Prefer Fast Tools',
    type: 'tool_selection',
    trigger: 'pattern',
    enabled: false,
    config: {
      preferredTools: ['read_file', 'grep'],
      fallbackTools: ['search_code', 'search_web'],
    },
  },
];

export function getDefaultAdaptationStrategies(): AdaptationRuleOptions[] {
  return DEFAULT_ADAPTATION_STRATEGIES.map(s => ({ ...s }));
}
