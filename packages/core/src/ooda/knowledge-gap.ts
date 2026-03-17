// packages/core/src/ooda/knowledge-gap.ts
// 知识缺口检测模块 - 检测用户问题是否需要外部信息

import { Observation, Intent } from '../types';

/**
 * 知识缺口类型枚举
 */
export enum KnowledgeGapType {
  /** 需要实时信息 - 天气、新闻、股价、时间等 */
  REALTIME_INFO = 'realtime_info',
  /** 需要网络搜索 - 查找资料、文档等 */
  WEB_SEARCH = 'web_search',
  /** 需要文件内容 - 读取代码、配置等 */
  FILE_CONTENT = 'file_content',
  /** 需要执行命令 - 运行脚本、获取系统信息等 */
  COMMAND_EXEC = 'command_exec',
  /** 需要代码分析 - 理解代码逻辑等 */
  CODE_ANALYSIS = 'code_analysis',
  /** 需要用户澄清 */
  CLARIFICATION = 'clarification',
  /** 无缺口 - 可以直接回答 */
  NONE = 'none',
}

/**
 * 检测到的知识缺口
 */
export interface DetectedKnowledgeGap {
  type: KnowledgeGapType;
  description: string;
  confidence: number;
  /** 建议的工具名称 */
  suggestedTool?: string;
  /** 建议的工具参数 */
  suggestedArgs?: Record<string, unknown>;
  /** 关键词触发器 */
  triggerKeywords: string[];
}

/**
 * 知识缺口检测器配置
 */
export interface KnowledgeGapDetectorConfig {
  /** 实时信息关键词（多语言） */
  realtimeKeywords: {
    zh: string[];
    en: string[];
  };
  /** 需要搜索的关键词 */
  searchKeywords: {
    zh: string[];
    en: string[];
  };
  /** 需要文件内容的关键词 */
  fileKeywords: {
    zh: string[];
    en: string[];
  };
  /** 需要执行命令的关键词 */
  commandKeywords: {
    zh: string[];
    en: string[];
  };
  /** 需要代码分析的关键词 */
  codeAnalysisKeywords: {
    zh: string[];
    en: string[];
  };
  /** 置信度阈值 */
  confidenceThreshold: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: KnowledgeGapDetectorConfig = {
  realtimeKeywords: {
    zh: ['现在', '今天', '明天', '昨天', '当前', '实时', '天气', '气温', '股价', '股票', '指数', '新闻', '最新', '2024', '2025', '2026'],
    en: ['now', 'today', 'tomorrow', 'yesterday', 'current', 'real-time', 'weather', 'temperature', 'stock', 'price', 'news', 'latest', '2024', '2025', '2026'],
  },
  searchKeywords: {
    zh: ['搜索', '查找', '查询', '如何', '怎么', '什么', '教程', '方法', '解决', '原因', '哪个', '哪些'],
    en: ['search', 'find', 'how', 'what', 'why', 'where', 'which', 'tutorial', 'method', 'solution', 'explain'],
  },
  fileKeywords: {
    zh: ['读取', '查看', '打开', '文件', '代码', '内容', '配置'],
    en: ['read', 'view', 'open', 'file', 'code', 'content', 'config'],
  },
  commandKeywords: {
    zh: ['运行', '执行', '命令', '脚本', '启动', '安装', '卸载'],
    en: ['run', 'execute', 'command', 'script', 'start', 'install', 'uninstall'],
  },
  codeAnalysisKeywords: {
    zh: ['分析', '解释', '理解', '代码', '函数', '类', '逻辑'],
    en: ['analyze', 'explain', 'understand', 'code', 'function', 'class', 'logic'],
  },
  confidenceThreshold: 0.6,
};

/**
 * 知识缺口检测器
 * 
 * 用于分析用户输入，检测是否需要外部工具来满足信息需求
 */
export class KnowledgeGapDetector {
  private config: KnowledgeGapDetectorConfig;

  constructor(config: Partial<KnowledgeGapDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 主检测方法 - 分析用户输入和观察结果，检测知识缺口
   */
  detect(userInput: string, observation: Observation): DetectedKnowledgeGap[] {
    const gaps: DetectedKnowledgeGap[] = [];
    const input = userInput.toLowerCase();

    // 1. 检测是否需要执行命令（优先级最高，因为命令更明确）
    const commandGap = this.detectCommandExec(userInput);
    if (commandGap) {
      gaps.push(commandGap);
    }

    // 2. 检测是否需要实时信息
    const realtimeGap = this.detectRealtimeInfo(userInput);
    if (realtimeGap) {
      gaps.push(realtimeGap);
    }

    // 3. 检测是否需要网络搜索
    const searchGap = this.detectWebSearch(userInput, observation);
    if (searchGap) {
      gaps.push(searchGap);
    }

    // 4. 检测是否需要文件内容（排在命令检测之后）
    const fileGap = this.detectFileContent(userInput);
    if (fileGap) {
      gaps.push(fileGap);
    }

    // 5. 检测是否需要代码分析
    const codeGap = this.detectCodeAnalysis(userInput);
    if (codeGap) {
      gaps.push(codeGap);
    }

    // 6. 如果没有任何缺口，返回 NONE
    if (gaps.length === 0) {
      gaps.push({
        type: KnowledgeGapType.NONE,
        description: '可以直接基于已有知识回答',
        confidence: 0.9,
        triggerKeywords: [],
      });
    }

    // 应用优先级权重并排序
    return this.applyPriorityAndSort(gaps);
  }

  /**
   * 应用优先级权重并排序
   */
  private applyPriorityAndSort(gaps: DetectedKnowledgeGap[]): DetectedKnowledgeGap[] {
    // 优先级权重
    const priorityWeight: Record<KnowledgeGapType, number> = {
      [KnowledgeGapType.COMMAND_EXEC]: 0.3,      // 最高优先级
      [KnowledgeGapType.REALTIME_INFO]: 0.2,
      [KnowledgeGapType.FILE_CONTENT]: 0.15,
      [KnowledgeGapType.WEB_SEARCH]: 0.1,
      [KnowledgeGapType.CODE_ANALYSIS]: 0.05,
      [KnowledgeGapType.CLARIFICATION]: 0,
      [KnowledgeGapType.NONE]: 0,
    };

    // 计算最终得分 = 置信度 + 优先级权重
    const scoredGaps = gaps.map(gap => ({
      gap,
      score: gap.confidence + (priorityWeight[gap.type] || 0),
    }));

    // 按得分排序
    scoredGaps.sort((a, b) => b.score - a.score);

    return scoredGaps.map(s => s.gap);
  }

  /**
   * 检测是否需要实时信息
   */
  private detectRealtimeInfo(userInput: string): DetectedKnowledgeGap | null {
    const input = userInput.toLowerCase();
    const keywords = [...this.config.realtimeKeywords.zh, ...this.config.realtimeKeywords.en];
    
    const matchedKeywords = keywords.filter(kw => input.includes(kw.toLowerCase()));
    
    if (matchedKeywords.length > 0) {
      // 计算置信度：匹配越多，置信度越高
      const confidence = Math.min(0.5 + matchedKeywords.length * 0.15, 1.0);
      
      return {
        type: KnowledgeGapType.REALTIME_INFO,
        description: `需要实时/最新信息（检测到关键词: ${matchedKeywords.join(', ')}）`,
        confidence,
        suggestedTool: 'web_search',
        suggestedArgs: { query: userInput, limit: 5 },
        triggerKeywords: matchedKeywords,
      };
    }

    return null;
  }

  /**
   * 检测是否需要网络搜索
   */
  private detectWebSearch(userInput: string, observation: Observation): DetectedKnowledgeGap | null {
    const input = userInput.toLowerCase();
    const keywords = [...this.config.searchKeywords.zh, ...this.config.searchKeywords.en];
    
    const matchedKeywords = keywords.filter(kw => input.includes(kw.toLowerCase()));
    
    // 如果已经有工具结果，说明已经在处理，不需要再搜索
    const hasRecentToolResults = observation.toolResults && observation.toolResults.length > 0;
    
    // 检查是否是问问题的场景（没有明确指定文件或命令）
    const isQuestion = matchedKeywords.length >= 1 && !this.hasExplicitTarget(userInput);
    
    if (isQuestion && !hasRecentToolResults) {
      const confidence = Math.min(0.4 + matchedKeywords.length * 0.15, 0.9);
      
      return {
        type: KnowledgeGapType.WEB_SEARCH,
        description: `需要搜索网络获取信息（检测到关键词: ${matchedKeywords.join(', ')}）`,
        confidence,
        suggestedTool: 'web_search',
        suggestedArgs: { query: userInput, limit: 5 },
        triggerKeywords: matchedKeywords,
      };
    }

    return null;
  }

  /**
   * 检测是否需要文件内容
   */
  private detectFileContent(userInput: string): DetectedKnowledgeGap | null {
    const input = userInput.toLowerCase();
    const keywords = [...this.config.fileKeywords.zh, ...this.config.fileKeywords.en];
    
    const matchedKeywords = keywords.filter(kw => input.includes(kw.toLowerCase()));
    
    // 检测文件路径模式
    const filePathPattern = /[\/\\]?[a-zA-Z]:[\\\/]?[a-zA-Z0-9_\-\.\/\\]+|(\.\.?\/[a-zA-Z0-9_\-\.\/\\]+)|([a-zA-Z0-9_\-\.]+\.(ts|js|tsx|jsx|py|go|rs|java|cpp|c|h|json|yaml|yml|md|txt)$)/i;
    const hasFilePath = filePathPattern.test(userInput);
    
    if (matchedKeywords.length > 0 || hasFilePath) {
      // 提取可能的文件路径
      const pathMatch = userInput.match(/['"`]([^'"`]+)['"`]|([a-zA-Z]:[\\\/]?[^\s]+)|(\.\.?\/[^\s]+)/);
      const filePath = pathMatch ? (pathMatch[1] || pathMatch[2] || pathMatch[3]) : undefined;
      
      const confidence = hasFilePath ? 0.95 : Math.min(0.5 + matchedKeywords.length * 0.15, 0.9);
      
      return {
        type: KnowledgeGapType.FILE_CONTENT,
        description: `需要读取文件内容（检测到文件路径: ${filePath || '未知'}）`,
        confidence,
        suggestedTool: 'read_file',
        suggestedArgs: filePath ? { path: filePath } : {},
        triggerKeywords: matchedKeywords,
      };
    }

    return null;
  }

  /**
   * 检测是否需要执行命令
   */
  private detectCommandExec(userInput: string): DetectedKnowledgeGap | null {
    const input = userInput.toLowerCase();
    const keywords = [...this.config.commandKeywords.zh, ...this.config.commandKeywords.en];
    
    const matchedKeywords = keywords.filter(kw => input.includes(kw.toLowerCase()));
    
    // 检测命令模式 - 行首模式
    const commandStartPatterns = [
      /^(npm|npx|yarn|pnpm|brew|apt|apt-get|yum|dnf|pip|cargo|go|rustc|java|javac|node|python|python3)\s+/i,
      /^git\s+/i,
      /^[a-zA-Z]:\\\>.+/i,
      /^\/.+\/.+/i,
    ];
    const hasCommandStartPattern = commandStartPatterns.some(pattern => pattern.test(userInput.trim()));
    
    // 检测命令模式 - 行内模式（如 "运行 python xxx"）
    const commandInlinePatterns = [
      /(?:^|\s)(npm|npx|yarn|pnpm|brew|apt|apt-get|yum|dnf|pip|cargo|go|rustc|java|javac|node|python|python3)\s+[\w\-\.]+/i,
      /(?:^|\s)git\s+\w+/i,
    ];
    const hasCommandInlinePattern = commandInlinePatterns.some(pattern => pattern.test(userInput));
    
    const hasCommandPattern = hasCommandStartPattern || hasCommandInlinePattern;
    
    if (matchedKeywords.length > 0 || hasCommandPattern) {
      // 提取可能的命令
      const commandMatch = userInput.match(/(?:npm|npx|yarn|pnpm|git|brew|apt|pip|cargo|go|java|node|python|python3)[\s\S]+$/i);
      const command = commandMatch ? commandMatch[0] : userInput;
      
      const confidence = hasCommandPattern ? 0.95 : Math.min(0.4 + matchedKeywords.length * 0.15, 0.85);
      
      return {
        type: KnowledgeGapType.COMMAND_EXEC,
        description: `需要执行命令: ${command.slice(0, 50)}`,
        confidence,
        suggestedTool: 'run_bash',
        suggestedArgs: { command },
        triggerKeywords: matchedKeywords,
      };
    }

    return null;
  }

  /**
   * 检测是否需要代码分析
   */
  private detectCodeAnalysis(userInput: string): DetectedKnowledgeGap | null {
    const input = userInput.toLowerCase();
    const keywords = [...this.config.codeAnalysisKeywords.zh, ...this.config.codeAnalysisKeywords.en];
    
    const matchedKeywords = keywords.filter(kw => input.includes(kw.toLowerCase()));
    
    // 检测是否有代码片段
    const hasCodeSnippet = /```[\s\S]+```|`[^`]+`/.test(userInput);
    
    if (matchedKeywords.length > 0 || hasCodeSnippet) {
      const confidence = hasCodeSnippet ? 0.9 : Math.min(0.4 + matchedKeywords.length * 0.15, 0.8);
      
      return {
        type: KnowledgeGapType.CODE_ANALYSIS,
        description: `需要分析代码逻辑`,
        confidence,
        suggestedTool: 'code_analysis',
        suggestedArgs: { code: userInput },
        triggerKeywords: matchedKeywords,
      };
    }

    return null;
  }

  /**
   * 检查用户输入是否有明确的目标（文件路径、命令等）
   */
  private hasExplicitTarget(userInput: string): boolean {
    // 文件路径
    if (/[\/\\]?[a-zA-Z]:[\\\/]|[.\/]?[a-zA-Z0-9_\-]+\.(ts|js|tsx|jsx|py|go|rs|java)/i.test(userInput)) {
      return true;
    }
    // 命令
    if (/^(npm|npx|yarn|git|brew|apt|pip|cargo|go|java|node|python)[\s]/i.test(userInput.trim())) {
      return true;
    }
    return false;
  }

  /**
   * 获取最高置信度的知识缺口
   */
  getPrimaryGap(userInput: string, observation: Observation): DetectedKnowledgeGap | null {
    const gaps = this.detect(userInput, observation);
    return gaps.length > 0 ? gaps[0] : null;
  }

  /**
   * 检查是否需要工具调用
   */
  needsToolCall(userInput: string, observation: Observation): boolean {
    const gaps = this.detect(userInput, observation);
    if (gaps.length === 0) return false;
    
    const primaryGap = gaps[0];
    return primaryGap.type !== KnowledgeGapType.NONE && 
           primaryGap.confidence >= this.config.confidenceThreshold;
  }
}

/**
 * 单例实例
 */
let knowledgeGapDetectorInstance: KnowledgeGapDetector | null = null;

export function getKnowledgeGapDetector(config?: Partial<KnowledgeGapDetectorConfig>): KnowledgeGapDetector {
  if (!knowledgeGapDetectorInstance) {
    knowledgeGapDetectorInstance = new KnowledgeGapDetector(config);
  }
  return knowledgeGapDetectorInstance;
}

export function resetKnowledgeGapDetector(): void {
  knowledgeGapDetectorInstance = null;
}
