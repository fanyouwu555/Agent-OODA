// packages/core/src/ooda/dynamic-tool-router.ts
// 动态工具路由器 - 根据数据类型和执行上下文智能选择工具

import { KnowledgeGapType, DetectedKnowledgeGap } from './knowledge-gap';
import { DataSourceManager, DataType, getDataSourceManager } from './data-source';
import { ErrorStrategyMapper, RecoveryAction, RecoveryActionType, getErrorStrategyMapper } from './error-strategy-mapper';

/**
 * 工具选择结果
 */
export interface ToolSelection {
  toolName: string;
  args: Record<string, unknown>;
  dataType: DataType;
  reasoning: string;
  confidence: number;
  sourceConfig?: {
    name: string;
    queryTemplate?: string;
  };
}

/**
 * 工具执行上下文 - 用于动态工具路由
 */
export interface ToolExecutionContext {
  sessionId: string;
  userInput: string;
  availableTools: string[];
  retryCount?: number;
  previousErrors?: unknown[];
  previousActions?: RecoveryAction[];
}

// 兼容旧名称
export type ExecutionContext = ToolExecutionContext;

/**
 * 工具能力元数据
 */
interface ToolMetadata {
  name: string;
  category: 'search' | 'fetch' | 'read' | 'write' | 'execute' | 'analysis' | 'utility';
  supportedDataTypes: DataType[];
  reliability: number;    // 基础可靠性
  latency: number;       // 基础延迟 ms
  cost: number;         // 资源消耗
}

/**
 * 工具注册表
 */
const TOOL_REGISTRY: Record<string, ToolMetadata> = {
  web_search: {
    name: 'web_search',
    category: 'search',
    supportedDataTypes: [
      DataType.GOLD_PRICE, DataType.SILVER_PRICE, DataType.FOREX,
      DataType.CRYPTO, DataType.STOCK, DataType.WEATHER,
      DataType.NEWS, DataType.GENERAL
    ],
    reliability: 0.7,
    latency: 2000,
    cost: 1,
  },
  web_search_and_fetch: {
    name: 'web_search_and_fetch',
    category: 'search',
    supportedDataTypes: [
      DataType.GOLD_PRICE, DataType.SILVER_PRICE, DataType.FOREX,
      DataType.CRYPTO, DataType.STOCK, DataType.WEATHER,
      DataType.NEWS, DataType.GENERAL
    ],
    reliability: 0.6,
    latency: 4000,
    cost: 2,
  },
  read_file: {
    name: 'read_file',
    category: 'read',
    supportedDataTypes: [],
    reliability: 0.95,
    latency: 100,
    cost: 1,
  },
  run_bash: {
    name: 'run_bash',
    category: 'execute',
    supportedDataTypes: [],
    reliability: 0.9,
    latency: 5000,
    cost: 5,
  },
  grep: {
    name: 'grep',
    category: 'search',
    supportedDataTypes: [],
    reliability: 0.95,
    latency: 500,
    cost: 1,
  },
};

/**
 * 动态工具路由器
 * 
 * 核心职责:
 * 1. 根据数据类型选择最佳工具
 * 2. 根据数据源配置生成工具参数
 * 3. 根据错误生成替代工具
 * 4. 考虑历史成功率调整选择
 */
export class DynamicToolRouter {
  private dataSourceManager: DataSourceManager;
  private errorStrategyMapper: ErrorStrategyMapper;

  constructor() {
    this.dataSourceManager = getDataSourceManager();
    this.errorStrategyMapper = getErrorStrategyMapper();
  }

  /**
   * 主选择方法: 根据知识缺口选择工具
   */
  selectTool(
    gap: DetectedKnowledgeGap,
    context: ToolExecutionContext
  ): ToolSelection | null {
    // 1. 获取数据类型
    const dataType = this.resolveDataType(gap);
    
    // 2. 检查是否有历史成功记录
    const successHistory = this.dataSourceManager.getSuccessHistory(
      context.userInput,
      dataType
    );
    
    if (successHistory && context.retryCount === 0) {
      // 使用历史成功的工具配置
      return this.reconstructFromHistory(successHistory, context);
    }

    // 3. 获取最佳数据源
    const source = this.dataSourceManager.getBestSource(dataType);
    
    if (!source) {
      // 没有可用数据源，降级到通用
      return this.selectFallback(DataType.GENERAL, context);
    }

    // 4. 根据数据源选择工具
    const tool = this.selectToolForSource(source, context);
    
    if (!tool) {
      return this.selectFallback(dataType, context);
    }

    // 5. 构建工具参数
    const args = this.buildToolArgs(tool, source, context);

    return {
      toolName: tool.name,
      args,
      dataType,
      reasoning: `根据数据类型 ${dataType} 选择工具 ${tool.name}，数据源: ${source.name}`,
      confidence: this.calculateConfidence(tool, source, context),
      sourceConfig: {
        name: source.name,
        queryTemplate: source.queryTemplate,
      },
    };
  }

  /**
   * 生成替代工具 (当工具执行失败时)
   */
  generateAlternativeTool(
    failedTool: string,
    error: unknown,
    context: ToolExecutionContext,
    attempt: number
  ): ToolSelection | null {
    // 1. 使用错误策略映射器获取下一个动作
    const action = this.errorStrategyMapper.generateNextAction(
      error,
      attempt,
      context.previousActions?.map(a => a.type) || []
    );

    if (!action) {
      return null;
    }

    // 2. 根据动作类型生成替代工具
    switch (action.type) {
      case RecoveryActionType.RETRY_SAME:
        // 重试相同工具，简单返回
        return this.selectTool(
          { type: KnowledgeGapType.REALTIME_INFO, description: '', confidence: 0.5, triggerKeywords: [] },
          { ...context, retryCount: (context.retryCount || 0) + 1 }
        );

      case RecoveryActionType.RETRY_WITH_BACKOFF:
        // 返回带延迟参数的重试
        const delay = this.errorStrategyMapper.getRetryDelay(error, attempt);
        return {
          toolName: 'retry_with_delay',
          args: { delay, originalRetry: true },
          dataType: DataType.GENERAL,
          reasoning: `退避重试，延迟 ${delay}ms`,
          confidence: 0.3,
        };

      case RecoveryActionType.SWITCH_DATA_SOURCE:
        // 切换数据源
        const fallbackType = action.params.fallbackToType as DataType || DataType.GENERAL;
        return this.selectFallback(fallbackType, context);

      case RecoveryActionType.SWITCH_TOOL:
        // 切换工具
        const newTool = action.params.toolName as string;
        return {
          toolName: newTool,
          args: { query: context.userInput },
          dataType: DataType.GENERAL,
          reasoning: `切换工具到 ${newTool}`,
          confidence: 0.4,
        };

      case RecoveryActionType.USE_CACHE:
        // 使用缓存
        return {
          toolName: 'get_cached',
          args: { key: `query_${context.userInput}`, acceptStale: action.params.acceptStale },
          dataType: DataType.GENERAL,
          reasoning: '尝试获取缓存数据',
          confidence: 0.5,
        };

      case RecoveryActionType.ESCALATE:
        // 升级，需要用户介入
        return {
          toolName: 'escalate',
          args: { reason: action.reasoning },
          dataType: DataType.GENERAL,
          reasoning: action.reasoning,
          confidence: 0,
        };

      default:
        return null;
    }
  }

  /**
   * 选择兜底工具
   */
  private selectFallback(dataType: DataType, context: ToolExecutionContext): ToolSelection | null {
    const source = this.dataSourceManager.getBestSource(dataType);
    
    if (!source) {
      return {
        toolName: 'web_search',
        args: { query: context.userInput, limit: 5 },
        dataType: DataType.GENERAL,
        reasoning: '兜底选择 web_search',
        confidence: 0.3,
      };
    }

    const tool = this.selectToolForSource(source, context);
    
    if (!tool) {
      return null;
    }

    return {
      toolName: tool.name,
      args: this.buildToolArgs(tool, source, context),
      dataType,
      reasoning: `兜底: 使用 ${source.name} 数据源`,
      confidence: 0.3,
      sourceConfig: {
        name: source.name,
      },
    };
  }

  /**
   * 根据数据源选择工具
   */
  private selectToolForSource(
    source: ReturnType<DataSourceManager['getBestSource']>,
    context: ToolExecutionContext
  ): ToolMetadata | null {
    // 过滤出可用的工具
    const availableTools = Object.values(TOOL_REGISTRY).filter(tool => {
      // 检查工具是否在可用列表中
      if (context.availableTools.length > 0 && 
          !context.availableTools.includes(tool.name)) {
        return false;
      }
      // 检查工具是否支持该数据类型
      return tool.supportedDataTypes.includes(source!.type);
    });

    if (availableTools.length === 0) {
      // 返回任何可用的搜索工具
      const fallback = Object.values(TOOL_REGISTRY).find(
        t => context.availableTools.length === 0 || context.availableTools.includes(t.name)
      );
      return fallback || null;
    }

    // 按可靠性+延迟评分排序
    availableTools.sort((a, b) => {
      const scoreA = a.reliability * 1000 - a.latency;
      const scoreB = b.reliability * 1000 - b.latency;
      return scoreB - scoreA;
    });

    return availableTools[0];
  }

  /**
   * 构建工具参数
   */
  private buildToolArgs(
    tool: ToolMetadata,
    source: NonNullable<ReturnType<DataSourceManager['getBestSource']>>,
    context: ToolExecutionContext
  ): Record<string, unknown> {
    // 使用数据源管理器的构建方法
    const params = this.dataSourceManager.buildQueryParams(source.type, context.userInput);

    // 如果工具不匹配，调整参数
    if (tool.name === 'web_search' && params.tool === 'web_fetch') {
      // 需要调整
      return {
        query: params.query,
        limit: 5,
      };
    }

    return params.args;
  }

  /**
   * 从历史记录重建工具选择
   */
  private reconstructFromHistory(
    history: NonNullable<ReturnType<DataSourceManager['getSuccessHistory']>>,
    _context: ToolExecutionContext
  ): ToolSelection {
    return {
      toolName: history.toolName,
      args: JSON.parse(history.args || '{}'),
      dataType: history.dataType,
      reasoning: '使用历史成功的工具配置',
      confidence: 0.9,
    };
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    tool: ToolMetadata,
    source: NonNullable<ReturnType<DataSourceManager['getBestSource']>>,
    context: ToolExecutionContext
  ): number {
    let confidence = tool.reliability * source.reliability;
    
    // 调整因子
    if (context.retryCount && context.retryCount > 0) {
      confidence *= 0.8; // 重试次数越多，置信度越低
    }
    
    // 惩罚失败历史
    if (context.previousErrors && context.previousErrors.length > 0) {
      confidence *= (1 - context.previousErrors.length * 0.1);
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * 解析数据类型
   */
  private resolveDataType(gap: DetectedKnowledgeGap): DataType {
    // 从 gap 获取数据类型
    if (gap.dataType) {
      return gap.dataType as DataType;
    }

    // 根据知识缺口类型推断
    switch (gap.type) {
      case KnowledgeGapType.REALTIME_INFO:
        return DataType.GENERAL;
      case KnowledgeGapType.WEB_SEARCH:
        return DataType.GENERAL;
      case KnowledgeGapType.NEWS_SUMMARY:
        return DataType.NEWS;
      case KnowledgeGapType.FILE_CONTENT:
      case KnowledgeGapType.CODE_ANALYSIS:
        return DataType.GENERAL; // 不需要外部数据
      default:
        return DataType.GENERAL;
    }
  }

  /**
   * 注册自定义工具
   */
  registerTool(tool: ToolMetadata): void {
    TOOL_REGISTRY[tool.name] = tool;
  }

  /**
   * 获取工具能力
   */
  getToolCapability(toolName: string): ToolMetadata | undefined {
    return TOOL_REGISTRY[toolName];
  }

  /**
   * 获取所有可用工具
   */
  getAvailableTools(context: ToolExecutionContext): ToolMetadata[] {
    return Object.values(TOOL_REGISTRY).filter(tool => 
      context.availableTools.length === 0 || 
      context.availableTools.includes(tool.name)
    );
  }
}

// 单例
let dynamicToolRouter: DynamicToolRouter | null = null;

export function getDynamicToolRouter(): DynamicToolRouter {
  if (!dynamicToolRouter) {
    dynamicToolRouter = new DynamicToolRouter();
  }
  return dynamicToolRouter;
}
