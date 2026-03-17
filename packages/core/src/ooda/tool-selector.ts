// packages/core/src/ooda/tool-selector.ts
// 工具自动选择器 - 根据知识缺口类型自动选择合适的工具

import { KnowledgeGapType, DetectedKnowledgeGap } from './knowledge-gap';

/**
 * 工具选择结果
 */
export interface ToolSelection {
  toolName: string;
  args: Record<string, unknown>;
  reasoning: string;
  confidence: number;
  fallbackTool?: string;
}

/**
 * 工具元数据
 */
export interface ToolMetadata {
  name: string;
  category: 'search' | 'fetch' | 'read' | 'write' | 'execute' | 'analysis' | 'utility';
  keywords: string[];
  description: string;
}

/**
 * 可用工具注册表
 */
const TOOL_REGISTRY: Record<KnowledgeGapType, ToolMetadata[]> = {
  [KnowledgeGapType.REALTIME_INFO]: [
    {
      name: 'web_search',
      category: 'search',
      keywords: ['weather', 'news', 'stock', 'price', '实时', '天气', '新闻', '股价'],
      description: '搜索网络获取最新信息',
    },
    {
      name: 'web_search_and_fetch',
      category: 'search',
      keywords: ['search', 'find', '搜索', '查找'],
      description: '搜索并抓取网页内容',
    },
  ],
  [KnowledgeGapType.WEB_SEARCH]: [
    {
      name: 'web_search',
      category: 'search',
      keywords: ['search', 'find', 'how', 'what', '搜索', '查找', '如何'],
      description: '搜索网络获取信息',
    },
    {
      name: 'web_search_and_fetch',
      category: 'fetch',
      keywords: ['search', 'find', '详细', '完整'],
      description: '搜索并获取详细页面内容',
    },
  ],
  [KnowledgeGapType.FILE_CONTENT]: [
    {
      name: 'read_file',
      category: 'read',
      keywords: ['read', 'view', '读取', '查看', '文件'],
      description: '读取文件内容',
    },
    {
      name: 'glob',
      category: 'search',
      keywords: ['glob', 'find', 'search', '查找', '搜索'],
      description: '搜索匹配模式的文件',
    },
  ],
  [KnowledgeGapType.COMMAND_EXEC]: [
    {
      name: 'run_bash',
      category: 'execute',
      keywords: ['run', 'execute', 'command', 'shell', '运行', '执行', '命令'],
      description: '执行 Shell 命令',
    },
  ],
  [KnowledgeGapType.CODE_ANALYSIS]: [
    {
      name: 'read_file',
      category: 'read',
      keywords: ['read', 'file', '文件'],
      description: '读取代码文件',
    },
    {
      name: 'grep',
      category: 'search',
      keywords: ['search', 'find', 'grep', '查找'],
      description: '搜索代码中的内容',
    },
  ],
  [KnowledgeGapType.CLARIFICATION]: [],
  [KnowledgeGapType.NONE]: [],
};

/**
 * 工具选择器配置
 */
export interface ToolSelectorConfig {
  /** 是否启用 fallback 机制 */
  enableFallback: boolean;
  /** 最大 fallback 层级 */
  maxFallbackDepth: number;
  /** 默认工具映射 */
  defaultToolMapping: Partial<Record<KnowledgeGapType, string>>;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ToolSelectorConfig = {
  enableFallback: true,
  maxFallbackDepth: 2,
  defaultToolMapping: {
    [KnowledgeGapType.REALTIME_INFO]: 'web_search',
    [KnowledgeGapType.WEB_SEARCH]: 'web_search',
    [KnowledgeGapType.FILE_CONTENT]: 'read_file',
    [KnowledgeGapType.COMMAND_EXEC]: 'run_bash',
    [KnowledgeGapType.CODE_ANALYSIS]: 'read_file',
  },
};

/**
 * 工具选择器
 * 
 * 根据检测到的知识缺口类型，自动选择最合适的工具
 */
export class ToolSelector {
  private config: ToolSelectorConfig;
  private customTools: Map<string, ToolMetadata>;

  constructor(config: Partial<ToolSelectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.customTools = new Map();
  }

  /**
   * 注册自定义工具
   */
  registerTool(tool: ToolMetadata): void {
    this.customTools.set(tool.name, tool);
  }

  /**
   * 为主类型注册工具
   */
  registerToolForType(gapType: KnowledgeGapType, tool: ToolMetadata): void {
    const existing = TOOL_REGISTRY[gapType] || [];
    TOOL_REGISTRY[gapType] = [...existing, tool];
  }

  /**
   * 根据知识缺口选择工具
   */
  select(gap: DetectedKnowledgeGap, context?: { availableTools?: string[] }): ToolSelection | null {
    const { type, suggestedTool, suggestedArgs, confidence } = gap;
    const availableToolsList = context?.availableTools;

    // 如果是无缺口类型，返回 null（不需要工具）
    if (type === KnowledgeGapType.NONE) {
      return null;
    }

    // 如果已有建议的工具，优先使用
    if (suggestedTool) {
      // 检查工具是否在可用列表中（如果提供了）
      const isToolAvailable = !availableToolsList || availableToolsList.includes(suggestedTool);
      
      if (isToolAvailable) {
        return {
          toolName: suggestedTool,
          args: suggestedArgs || {},
          reasoning: `基于知识缺口检测自动选择: ${gap.description}`,
          confidence,
        };
      } else {
        // 工具不可用，尝试 fallback
        const fallbackResult = this.tryFallback(gap, context);
        if (fallbackResult) {
          return fallbackResult;
        }
        // 没有 fallback，返回 null
        return null;
      }
    }

    // 从注册表中查找合适的工具
    const tools = TOOL_REGISTRY[type] || [];
    
    if (tools.length === 0) {
      // 使用默认映射
      const defaultTool = this.config.defaultToolMapping[type];
      if (defaultTool) {
        // 检查默认工具是否可用
        if (availableToolsList && !availableToolsList.includes(defaultTool)) {
          const fallbackResult = this.tryFallback(gap, context);
          if (fallbackResult) {
            return fallbackResult;
          }
          return null;
        }
        return {
          toolName: defaultTool,
          args: {},
          reasoning: `使用默认工具处理知识缺口: ${type}`,
          confidence: 0.5,
        };
      }
      return null;
    }

    // 过滤可用工具（如果提供了可用工具列表）
    let availableTools = tools;
    if (availableToolsList && availableToolsList.length > 0) {
      availableTools = tools.filter(t => 
        availableToolsList.includes(t.name)
      );
    }

    // 选择最佳工具
    const selectedTool = this.selectBestTool(availableTools, gap);
    
    if (!selectedTool) {
      // 尝试 fallback
      return this.tryFallback(gap, context);
    }

    return {
      toolName: selectedTool.name,
      args: this.buildToolArgs(selectedTool, gap),
      reasoning: `自动选择工具: ${selectedTool.name} (${selectedTool.description})`,
      confidence: gap.confidence * 0.9, // 稍微降低置信度
    };
  }

  /**
   * 选择最佳工具
   */
  private selectBestTool(tools: ToolMetadata[], gap: DetectedKnowledgeGap): ToolMetadata | null {
    if (tools.length === 0) return null;
    if (tools.length === 1) return tools[0];

    // 按关键词匹配度排序
    const scoredTools = tools.map(tool => {
      const matchCount = tool.keywords.filter(kw => 
        gap.triggerKeywords.some(tk => tk.toLowerCase().includes(kw.toLowerCase()))
      ).length;
      return { tool, score: matchCount };
    });

    // 排序并返回得分最高的
    scoredTools.sort((a, b) => b.score - a.score);
    return scoredTools[0].tool || tools[0];
  }

  /**
   * 构建工具参数
   */
  private buildToolArgs(tool: ToolMetadata, gap: DetectedKnowledgeGap): Record<string, unknown> {
    const args: Record<string, unknown> = {};

    switch (tool.name) {
      case 'web_search':
      case 'web_search_and_fetch':
        // 从用户输入中提取搜索查询
        args.query = gap.triggerKeywords.join(' ') || 'search query';
        args.limit = 5;
        break;
        
      case 'read_file':
        // 从建议参数中获取
        if (gap.suggestedArgs?.path) {
          args.path = gap.suggestedArgs.path;
        }
        break;
        
      case 'run_bash':
        // 从建议参数中获取命令
        if (gap.suggestedArgs?.command) {
          args.command = gap.suggestedArgs.command;
        }
        break;
        
      case 'grep':
        args.pattern = gap.triggerKeywords.join(' ') || '.';
        break;
        
      case 'glob':
        args.pattern = '**/*';
        break;
    }

    return args;
  }

  /**
   * 尝试 fallback - 当没有 suggestedTool 且注册表中没有可用工具时使用
   */
  private tryFallback(gap: DetectedKnowledgeGap, context?: { availableTools?: string[] }): ToolSelection | null {
    if (!this.config.enableFallback) {
      return null;
    }

    // 查找 fallback 工具
    const defaultTool = this.config.defaultToolMapping[gap.type];
    if (defaultTool) {
      // 检查工具是否可用
      // 如果没有提供 availableTools，默认工具都可用
      // 如果提供了 availableTools，检查 defaultTool 是否在其中
      if (context?.availableTools && context.availableTools.length > 0) {
        if (!context.availableTools.includes(defaultTool)) {
          return null; // 工具不可用且没有其他 fallback
        }
      }

      return {
        toolName: defaultTool,
        args: {},
        reasoning: `Fallback: 使用默认工具 ${defaultTool}`,
        confidence: 0.3,
        fallbackTool: defaultTool,
      };
    }

    return null;
  }

  /**
   * 批量选择工具（用于复杂任务）
   */
  selectMultiple(gaps: DetectedKnowledgeGap[], context?: { availableTools?: string[] }): ToolSelection[] {
    const selections: ToolSelection[] = [];
    
    for (const gap of gaps) {
      // 跳过低置信度的缺口
      if (gap.confidence < 0.5) continue;
      
      const selection = this.select(gap, context);
      if (selection) {
        // 避免重复选择相同工具
        if (!selections.some(s => s.toolName === selection.toolName)) {
          selections.push(selection);
        }
      }
    }

    return selections;
  }

  /**
   * 检查给定工具是否支持给定知识缺口类型
   */
  isToolCompatible(toolName: string, gapType: KnowledgeGapType): boolean {
    const tools = TOOL_REGISTRY[gapType] || [];
    return tools.some(t => t.name === toolName);
  }

  /**
   * 获取某知识缺口类型的所有可用工具
   */
  getToolsForType(gapType: KnowledgeGapType): ToolMetadata[] {
    return TOOL_REGISTRY[gapType] || [];
  }
}

/**
 * 单例实例
 */
let toolSelectorInstance: ToolSelector | null = null;

export function getToolSelector(config?: Partial<ToolSelectorConfig>): ToolSelector {
  if (!toolSelectorInstance) {
    toolSelectorInstance = new ToolSelector(config);
  }
  return toolSelectorInstance;
}

export function resetToolSelector(): void {
  toolSelectorInstance = null;
}
