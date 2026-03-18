// packages/core/src/ooda/error-strategy-mapper.ts
// 错误策略映射器 - 根据错误类型映射到恢复策略

import { ErrorCategory, ClassifiedError } from './error-classifier';
import { DataType, DataSourceManager, getDataSourceManager } from './data-source';

/**
 * 恢复动作类型
 */
export enum RecoveryActionType {
  RETRY_SAME = 'retry_same',               // 重试相同工具
  RETRY_WITH_BACKOFF = 'retry_with_backoff', // 退避重试
  SWITCH_TOOL = 'switch_tool',             // 切换工具
  SWITCH_DATA_SOURCE = 'switch_data_source', // 切换数据源
  SWITCH_DATA_TYPE = 'switch_data_type',   // 切换数据类型
  USE_CACHE = 'use_cache',                 // 使用缓存
  ESCALATE = 'escalate',                   // 升级 (人工介入)
}

/**
 * 恢复动作
 */
export interface RecoveryAction {
  type: RecoveryActionType;
  params: Record<string, unknown>;
  reasoning: string;
}

/**
 * 恢复策略
 */
export interface RecoveryStrategy {
  errorCategory: ErrorCategory;
  actions: RecoveryAction[];
  maxRetries?: number;
  baseDelay?: number;
}

/**
 * 错误策略映射配置
 */
export interface ErrorStrategyConfig {
  strategies: Record<ErrorCategory, RecoveryStrategy>;
  defaultMaxRetries: number;
  defaultBaseDelay: number;
  maxRetriesLimit: number;
}

/**
 * 默认错误策略配置
 */
const DEFAULT_STRATEGIES: Record<ErrorCategory, RecoveryStrategy> = {
  // 网络超时: 重试 + 切换工具
  [ErrorCategory.NETWORK_TIMEOUT]: {
    errorCategory: ErrorCategory.NETWORK_TIMEOUT,
    actions: [
      {
        type: RecoveryActionType.RETRY_WITH_BACKOFF,
        params: { delayMultiplier: 2, maxDelay: 10000 },
        reasoning: '网络超时可能是临时性的，使用退避重试',
      },
      {
        type: RecoveryActionType.SWITCH_DATA_SOURCE,
        params: { fallbackToType: DataType.GENERAL },
        reasoning: '重试失败，切换到备用数据源',
      },
    ],
    maxRetries: 2,
    baseDelay: 2000,
  },

  // 网络连接错误: 切换数据源
  [ErrorCategory.NETWORK_CONNECTION_ERROR]: {
    errorCategory: ErrorCategory.NETWORK_CONNECTION_ERROR,
    actions: [
      {
        type: RecoveryActionType.SWITCH_DATA_SOURCE,
        params: {},
        reasoning: '网络连接失败，切换到其他数据源',
      },
      {
        type: RecoveryActionType.SWITCH_DATA_TYPE,
        params: { fallbackToType: DataType.GENERAL },
        reasoning: '所有数据源都不可用，切换到通用搜索',
      },
    ],
    maxRetries: 1,
    baseDelay: 1000,
  },

  // 403 访问被拒绝: 切换数据源
  [ErrorCategory.ACCESS_DENIED_403]: {
    errorCategory: ErrorCategory.ACCESS_DENIED_403,
    actions: [
      {
        type: RecoveryActionType.SWITCH_DATA_SOURCE,
        params: {},
        reasoning: '访问被拒绝 (403)，切换到其他数据源',
      },
      {
        type: RecoveryActionType.SWITCH_DATA_TYPE,
        params: { fallbackToType: DataType.GENERAL },
        reasoning: '目标数据源不可访问，切换到通用搜索',
      },
    ],
    maxRetries: 0,
  },

  // IP 被封: 切换数据源
  [ErrorCategory.ACCESS_DENIED_IP]: {
    errorCategory: ErrorCategory.ACCESS_DENIED_IP,
    actions: [
      {
        type: RecoveryActionType.SWITCH_DATA_SOURCE,
        params: {},
        reasoning: 'IP 被封，切换到其他数据源',
      },
      {
        type: RecoveryActionType.USE_CACHE,
        params: { acceptStale: true },
        reasoning: '无法访问外部数据，尝试使用缓存',
      },
    ],
    maxRetries: 0,
  },

  // 404 内容不存在: 切换查询
  [ErrorCategory.CONTENT_NOT_FOUND_404]: {
    errorCategory: ErrorCategory.CONTENT_NOT_FOUND_404,
    actions: [
      {
        type: RecoveryActionType.SWITCH_DATA_TYPE,
        params: { fallbackToType: DataType.GENERAL },
        reasoning: '内容不存在，尝试通用搜索',
      },
      {
        type: RecoveryActionType.ESCALATE,
        params: {},
        reasoning: '无法获取所需信息，需要用户澄清',
      },
    ],
    maxRetries: 0,
  },

  // 内容为空: 重试 + 切换
  [ErrorCategory.CONTENT_EMPTY]: {
    errorCategory: ErrorCategory.CONTENT_EMPTY,
    actions: [
      {
        type: RecoveryActionType.RETRY_SAME,
        params: {},
        reasoning: '内容为空，可能需要更长时间获取，重试一次',
      },
      {
        type: RecoveryActionType.SWITCH_DATA_SOURCE,
        params: {},
        reasoning: '重试后仍为空，切换数据源',
      },
    ],
    maxRetries: 1,
    baseDelay: 1000,
  },

  // 频率限制: 退避重试
  [ErrorCategory.RATE_LIMIT]: {
    errorCategory: ErrorCategory.RATE_LIMIT,
    actions: [
      {
        type: RecoveryActionType.RETRY_WITH_BACKOFF,
        params: { delayMultiplier: 5, maxDelay: 60000 },
        reasoning: '触发频率限制，使用大延迟退避重试',
      },
      {
        type: RecoveryActionType.SWITCH_DATA_SOURCE,
        params: {},
        reasoning: '退避重试仍失败，切换到其他数据源',
      },
    ],
    maxRetries: 1,
    baseDelay: 10000,
  },

  // 5XX 服务器错误: 重试
  [ErrorCategory.SERVER_ERROR_5XX]: {
    errorCategory: ErrorCategory.SERVER_ERROR_5XX,
    actions: [
      {
        type: RecoveryActionType.RETRY_WITH_BACKOFF,
        params: { delayMultiplier: 3, maxDelay: 30000 },
        reasoning: '服务器错误可能是临时的，使用退避重试',
      },
      {
        type: RecoveryActionType.SWITCH_DATA_SOURCE,
        params: {},
        reasoning: '服务器持续错误，切换到其他数据源',
      },
    ],
    maxRetries: 2,
    baseDelay: 5000,
  },

  // 解析错误: 切换数据源
  [ErrorCategory.PARSE_ERROR]: {
    errorCategory: ErrorCategory.PARSE_ERROR,
    actions: [
      {
        type: RecoveryActionType.SWITCH_DATA_SOURCE,
        params: {},
        reasoning: '内容解析失败，切换到更可靠的数据源',
      },
      {
        type: RecoveryActionType.ESCALATE,
        params: {},
        reasoning: '无法解析数据，需要人工介入',
      },
    ],
    maxRetries: 0,
  },

  // 认证错误: 升级
  [ErrorCategory.AUTH_ERROR]: {
    errorCategory: ErrorCategory.AUTH_ERROR,
    actions: [
      {
        type: RecoveryActionType.ESCALATE,
        params: {},
        reasoning: '认证失败，需要检查 API 配置',
      },
    ],
    maxRetries: 0,
  },

  // 配额超限: 升级
  [ErrorCategory.QUOTA_EXCEEDED]: {
    errorCategory: ErrorCategory.QUOTA_EXCEEDED,
    actions: [
      {
        type: RecoveryActionType.USE_CACHE,
        params: { acceptStale: true },
        reasoning: '配额已用完，尝试使用缓存数据',
      },
      {
        type: RecoveryActionType.ESCALATE,
        params: {},
        reasoning: '需要用户处理配额问题',
      },
    ],
    maxRetries: 0,
  },

  // 未知错误: 尝试重试
  [ErrorCategory.UNKNOWN]: {
    errorCategory: ErrorCategory.UNKNOWN,
    actions: [
      {
        type: RecoveryActionType.RETRY_SAME,
        params: {},
        reasoning: '未知错误，尝试重试一次',
      },
      {
        type: RecoveryActionType.SWITCH_DATA_SOURCE,
        params: {},
        reasoning: '重试失败，切换数据源',
      },
    ],
    maxRetries: 1,
    baseDelay: 1000,
  },
};

/**
 * 错误策略映射器
 */
export class ErrorStrategyMapper {
  private config: ErrorStrategyConfig;
  private dataSourceManager: DataSourceManager;

  constructor(config?: Partial<ErrorStrategyConfig>) {
    this.config = {
      strategies: { ...DEFAULT_STRATEGIES, ...config?.strategies },
      defaultMaxRetries: config?.defaultMaxRetries ?? 3,
      defaultBaseDelay: config?.defaultBaseDelay ?? 1000,
      maxRetriesLimit: config?.maxRetriesLimit ?? 5,
    };
    this.dataSourceManager = getDataSourceManager();
  }

  /**
   * 获取恢复策略
   */
  getStrategy(error: unknown): RecoveryStrategy {
    const classified = this.classifyError(error);
    return this.getStrategyForCategory(classified.category);
  }

  /**
   * 根据分类获取策略
   */
  getStrategyForCategory(category: ErrorCategory): RecoveryStrategy {
    return this.config.strategies[category] || this.config.strategies[ErrorCategory.UNKNOWN];
  }

  /**
   * 生成下一个恢复动作
   */
  generateNextAction(
    error: unknown,
    currentAttempt: number,
    previousActions: RecoveryActionType[]
  ): RecoveryAction | null {
    const strategy = this.getStrategy(error);
    
    // 检查是否还有重试次数
    const maxRetries = strategy.maxRetries ?? this.config.defaultMaxRetries;
    if (currentAttempt >= maxRetries) {
      // 返回第一个非重试的动作
      const nonRetryAction = strategy.actions.find(a => a.type !== RecoveryActionType.RETRY_SAME && a.type !== RecoveryActionType.RETRY_WITH_BACKOFF);
      return nonRetryAction || {
        type: RecoveryActionType.ESCALATE,
        params: {},
        reasoning: '已达到最大重试次数，需要人工介入',
      };
    }

    // 跳过已经执行过的动作类型
    for (const action of strategy.actions) {
      if (!previousActions.includes(action.type)) {
        // 如果是切换数据源，需要解析参数
        if (action.type === RecoveryActionType.SWITCH_DATA_SOURCE) {
          const resolvedParams = this.resolveActionParams(action.params, error);
          return { ...action, params: resolvedParams };
        }
        return action;
      }
    }

    // 所有动作都已执行，升级
    return {
      type: RecoveryActionType.ESCALATE,
      params: {},
      reasoning: '所有恢复动作都已尝试，需要人工介入',
    };
  }

  /**
   * 解析动作参数
   */
  private resolveActionParams(params: Record<string, unknown>, error: unknown): Record<string, unknown> {
    const resolved = { ...params };

    // 如果需要切换数据源，尝试获取替代数据源
    if (params.fallbackToType) {
      const fallbackType = params.fallbackToType as DataType;
      const source = this.dataSourceManager.getBestSource(fallbackType);
      if (source) {
        resolved.alternativeQueryParams = this.dataSourceManager.buildQueryParams(fallbackType, '');
      }
    }

    return resolved;
  }

  /**
   * 判断是否需要升级
   */
  shouldEscalate(error: unknown, attempt: number): boolean {
    const strategy = this.getStrategy(error);
    const maxRetries = strategy.maxRetries ?? this.config.defaultMaxRetries;
    
    // 达到最大重试次数
    if (attempt >= maxRetries) {
      return true;
    }

    // 检查是否需要升级
    const action = this.generateNextAction(error, attempt, []);
    return action?.type === RecoveryActionType.ESCALATE;
  }

  /**
   * 获取重试延迟
   */
  getRetryDelay(error: unknown, attempt: number): number {
    const strategy = this.getStrategy(error);
    const baseDelay = strategy.baseDelay ?? this.config.defaultBaseDelay;
    const multiplier = 2 ** attempt; // 指数退避
    
    return Math.min(baseDelay * multiplier, 30000); // 最大 30 秒
  }

  /**
   * 分类错误
   */
  private classifyError(error: unknown): ClassifiedError {
    // 导入 ErrorClassifier
    const { getErrorClassifier } = require('./error-classifier');
    const classifier = getErrorClassifier();
    return classifier.classify(error);
  }

  /**
   * 添加自定义策略
   */
  addStrategy(category: ErrorCategory, strategy: RecoveryStrategy): void {
    this.config.strategies[category] = strategy;
  }

  /**
   * 获取所有可用策略
   */
  getAllStrategies(): RecoveryStrategy[] {
    return Object.values(this.config.strategies);
  }
}

// 单例
let errorStrategyMapper: ErrorStrategyMapper | null = null;

export function getErrorStrategyMapper(): ErrorStrategyMapper {
  if (!errorStrategyMapper) {
    errorStrategyMapper = new ErrorStrategyMapper();
  }
  return errorStrategyMapper;
}
