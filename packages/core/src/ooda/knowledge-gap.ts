// packages/core/src/ooda/knowledge-gap.ts
// 知识缺口检测模块 - 检测用户问题是否需要外部信息

import { Observation, Intent } from '../types';
import { getLLMService } from '../llm/service';
import { ChatMessage } from '../llm/provider';

/**
 * 知识缺口类型枚举
 */
export enum KnowledgeGapType {
  /** 需要实时信息 - 天气、新闻、股价、时间等 */
  REALTIME_INFO = 'realtime_info',
  /** 需要网络搜索 - 查找资料、文档等 */
  WEB_SEARCH = 'web_search',
  /** 需要新闻摘要 - 总结新闻内容 */
  NEWS_SUMMARY = 'news_summary',
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
  /** 数据类型 (用于动态工具选择) */
  dataType?: string;
  /** 建议的工具名称 (可选，由动态路由器决定) */
  suggestedTool?: string;
  /** 建议的工具参数 (可选，由动态路由器决定) */
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
  /** 新闻摘要关键词 - 用于区分新闻内容 vs 新闻网站 */
  newsSummaryKeywords: {
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
 * LLM 增强配置
 */
export interface LLMEnhancementConfig {
  /** 是否启用 LLM 分析 */
  enableLLMAnalysis: boolean;
  /** LLM 置信度阈值 */
  confidenceThreshold: number;
  /** 最大缺口数 */
  maxGaps: number;
  /** 使用多源验证 */
  useMultiSourceValidation: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: KnowledgeGapDetectorConfig = {
  realtimeKeywords: {
    zh: ['现在', '今天', '明天', '昨天', '当前', '实时', '天气', '气温', '股价', '股票', '指数', '新闻', '最新', '2024', '2025', '2026', '今日', '金价', '黄金', '白银', '汇率', '利率', '油价'],
    en: ['now', 'today', 'tomorrow', 'yesterday', 'current', 'real-time', 'weather', 'temperature', 'stock', 'price', 'news', 'latest', '2024', '2025', '2026', 'gold', 'silver', 'oil', 'forex', 'rate', 'price'],
  },
  searchKeywords: {
    zh: ['搜索', '查找', '查询', '如何', '怎么', '什么', '教程', '方法', '解决', '原因', '哪个', '哪些'],
    en: ['search', 'find', 'how', 'what', 'why', 'where', 'which', 'tutorial', 'method', 'solution', 'explain'],
  },
  // 新增：新闻摘要关键词 - 区分用户是要新闻内容还是新闻网站
  newsSummaryKeywords: {
    zh: ['新闻摘要', '今日新闻', '国内新闻', '发生了什么', '有哪些新闻', '新闻汇总', '今日要闻', '要闻', '热点', '头条'],
    en: ['news summary', 'what happened', 'latest news', 'today news', 'top news', 'headlines', 'breaking news'],
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
  private llmConfig: LLMEnhancementConfig;

  // 领域特定查询模式库 - 高置信度、纯数据类型输出
  // 不再硬编码 site 参数，由动态路由器根据数据类型选择数据源
  private queryPatterns: Array<{
    pattern: RegExp;
    type: KnowledgeGapType;
    baseConfidence: number;
    dataType: string;  // 数据类型，用于动态工具选择
  }> = [
    // 金价相关模式 - 高置信度
    {
      pattern: /今日.*金价|金价.*今日|实时.*金价|黄金.*实时价/i,
      type: KnowledgeGapType.REALTIME_INFO,
      baseConfidence: 0.9,
      dataType: 'gold_price'  // 移除硬编码的 site 参数
    },
    // 汇率相关模式
    {
      pattern: /人民币.*对.*美元|美元.*对.*人民币|汇率.*实时|实时.*汇率/i,
      type: KnowledgeGapType.REALTIME_INFO,
      baseConfidence: 0.88,
      dataType: 'forex'
    },
    // 加密货币模式
    {
      pattern: /比特币|以太坊|加密货币.*价格|币价.*实时/i,
      type: KnowledgeGapType.REALTIME_INFO,
      baseConfidence: 0.85,
      dataType: 'crypto'
    },
    // 大盘指数模式
    {
      pattern: /道琼斯|纳斯达克|标普500|富时|日经.*指数|大盘.*点数/i,
      type: KnowledgeGapType.REALTIME_INFO,
      baseConfidence: 0.82,
      dataType: 'stock'
    },
    // 白银价格
    {
      pattern: /今日.*银价|银价.*今日|实时.*白银|白银.*实时价/i,
      type: KnowledgeGapType.REALTIME_INFO,
      baseConfidence: 0.9,
      dataType: 'silver_price'
    },
    // 油价
    {
      pattern: /今日.*油价|油价.*今日|实时.*原油|WTI|Brent/i,
      type: KnowledgeGapType.REALTIME_INFO,
      baseConfidence: 0.85,
      dataType: 'oil_price'
    },
    // 天气
    {
      pattern: /天气|气温|温度|下雨|晴天/i,
      type: KnowledgeGapType.REALTIME_INFO,
      baseConfidence: 0.8,
      dataType: 'weather'
    },
  ];

  constructor(config: Partial<KnowledgeGapDetectorConfig> = {}, llmConfig: Partial<LLMEnhancementConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.llmConfig = {
      enableLLMAnalysis: llmConfig.enableLLMAnalysis ?? true,
      confidenceThreshold: llmConfig.confidenceThreshold ?? 0.6,
      maxGaps: llmConfig.maxGaps ?? 3,
      useMultiSourceValidation: llmConfig.useMultiSourceValidation ?? true,
    };
  }

  /**
   * 使用 LLM 进行深度分析检测（增强版）
   */
  async detectWithLLM(userInput: string, observation: Observation): Promise<DetectedKnowledgeGap[]> {
    if (!this.llmConfig.enableLLMAnalysis) {
      return this.detect(userInput, observation);
    }

    try {
      const llm = getLLMService();
      const context = this.buildContext(observation);
      const prompt = this.buildLLMPrompt(userInput, context);
      const response = await llm.chat(prompt);
      const content = response.text || '';
      return this.parseLLMResponse(content);
    } catch (error) {
      console.error('[KnowledgeGapDetector] LLM analysis failed:', error);
      return this.detect(userInput, observation);
    }
  }

  private buildContext(observation: Observation): string {
    const parts: string[] = [];

    if (observation.toolResults && observation.toolResults.length > 0) {
      parts.push(`最近工具结果: ${observation.toolResults.length} 个`);
      for (const result of observation.toolResults.slice(0, 3)) {
        parts.push(`- ${result.toolName}: ${result.isError ? '失败' : '成功'}`);
      }
    }

    if (observation.anomalies && observation.anomalies.length > 0) {
      parts.push(`检测到异常: ${observation.anomalies.length} 个`);
    }

    if (observation.patterns && observation.patterns.length > 0) {
      parts.push(`识别模式: ${observation.patterns.length} 个`);
    }

    return parts.join('\n') || '无额外上下文';
  }

  private buildLLMPrompt(userInput: string, context: string): ChatMessage[] {
    return [
      {
        role: 'system',
        content: `你是一个专业的知识缺口分析助手。你的职责是分析用户输入，判断是否需要外部信息来回答用户问题。

## 知识缺口类型
1. realtime_info - 需要实时数据（天气、时间、股价、金价、汇率等）
2. web_search - 需要网络搜索获取信息
3. news_summary - 需要新闻摘要（区分新闻内容 vs 新闻网站）
4. file_content - 需要读取文件内容
5. command_exec - 需要执行系统命令
6. code_analysis - 需要分析代码
7. clarification - 需要用户澄清
8. none - 无缺口，可以直接回答

## 分析要求
1. 仔细分析用户输入的语义
2. 考虑上下文中的工具执行结果
3. 判断用户是否需要具体的实时数据
4. 区分"新闻内容"和"新闻网站链接"
5. 如果需要新闻内容，需要确保返回实际新闻摘要

## 输出格式（JSON数组）
[
  {
    "type": "缺口类型",
    "description": "简短描述",
    "confidence": 0.85,
    "dataType": "数据类型",
    "triggerKeywords": ["关键词1", "关键词2"]
  }
]

如果没有缺口，返回空数组 []。`,
      },
      {
        role: 'user',
        content: `用户输入: ${userInput}

上下文信息:
${context}

请分析并输出知识缺口（JSON数组）：`,
      },
    ];
  }

  private parseLLMResponse(content: string): DetectedKnowledgeGap[] {
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return [];
      }

      return parsed.slice(0, this.llmConfig.maxGaps).map((item: any) => ({
        type: this.normalizeGapType(item.type),
        description: item.description || '',
        confidence: Math.min(1, Math.max(0, item.confidence || 0.5)),
        dataType: item.dataType,
        suggestedTool: item.suggestedTool,
        suggestedArgs: item.suggestedArgs,
        triggerKeywords: item.triggerKeywords || [],
      }));
    } catch (error) {
      console.error('[KnowledgeGapDetector] Parse LLM response failed:', error);
      return [];
    }
  }

  private normalizeGapType(type: string): KnowledgeGapType {
    const typeMap: Record<string, KnowledgeGapType> = {
      realtime_info: KnowledgeGapType.REALTIME_INFO,
      realtime: KnowledgeGapType.REALTIME_INFO,
      realtimeinfo: KnowledgeGapType.REALTIME_INFO,
      web_search: KnowledgeGapType.WEB_SEARCH,
      websearch: KnowledgeGapType.WEB_SEARCH,
      search: KnowledgeGapType.WEB_SEARCH,
      news_summary: KnowledgeGapType.NEWS_SUMMARY,
      news: KnowledgeGapType.NEWS_SUMMARY,
      file_content: KnowledgeGapType.FILE_CONTENT,
      file: KnowledgeGapType.FILE_CONTENT,
      command_exec: KnowledgeGapType.COMMAND_EXEC,
      command: KnowledgeGapType.COMMAND_EXEC,
      code_analysis: KnowledgeGapType.CODE_ANALYSIS,
      code: KnowledgeGapType.CODE_ANALYSIS,
      clarification: KnowledgeGapType.CLARIFICATION,
      none: KnowledgeGapType.NONE,
    };

    const normalized = type.toLowerCase().replace(/[_-]/g, '_');
    return typeMap[normalized] || KnowledgeGapType.NONE;
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

    // 2. 检测是否需要新闻摘要（高优先级，需要区分新闻内容 vs 新闻网站）
    const newsSummaryGap = this.detectNewsSummary(userInput);
    if (newsSummaryGap) {
      gaps.push(newsSummaryGap);
    }

    // 3. 检测是否需要实时信息
    const realtimeGap = this.detectRealtimeInfo(userInput);
    if (realtimeGap) {
      gaps.push(realtimeGap);
    }

    // 4. 检测是否需要网络搜索
    const searchGap = this.detectWebSearch(userInput, observation);
    if (searchGap) {
      gaps.push(searchGap);
    }

    // 5. 检测是否需要文件内容（排在命令检测之后）
    const fileGap = this.detectFileContent(userInput);
    if (fileGap) {
      gaps.push(fileGap);
    }

    // 6. 检测是否需要代码分析
    const codeGap = this.detectCodeAnalysis(userInput);
    if (codeGap) {
      gaps.push(codeGap);
    }

    // 7. 如果没有任何缺口，返回 NONE
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
      [KnowledgeGapType.NEWS_SUMMARY]: 0.25,     // 新闻摘要高优先级
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
    
    // 1. 首先检查领域特定模式（最高优先级）
    for (const patternObj of this.queryPatterns) {
      if (patternObj.pattern.test(input)) {
        const confidence = this.calculateDynamicConfidence(
          patternObj.baseConfidence, 
          userInput, 
          [patternObj.pattern.toString()] // 简化的匹配词
        );
        
        // 关键改动: 不再硬编码工具参数，只输出数据类型
        // 工具选择由动态路由器根据 dataType 决定
        return {
          type: patternObj.type,
          description: `检测到${patternObj.type}领域实时查询（模式匹配）`,
          confidence,
          dataType: patternObj.dataType,  // 输出数据类型，由动态路由器决定工具
          triggerKeywords: this.extractKeywordsFromPattern(patternObj.pattern, input)
        };
      }
    }
    
    // 2. 回退到原有的关键词匹配逻辑（关键词匹配模式）
    const keywords = [...this.config.realtimeKeywords.zh, ...this.config.realtimeKeywords.en];
    const matchedKeywords = this.enhancedKeywordMatch(input, keywords);
    
    if (matchedKeywords.length > 0) {
      let confidence = Math.min(0.5 + matchedKeywords.length * 0.15, 1.0);
      confidence = this.calculateDynamicConfidence(confidence, userInput, matchedKeywords);
      
      // 尝试推断数据类型
      const inferredDataType = this.inferDataTypeFromKeywords(matchedKeywords);
      
      return {
        type: KnowledgeGapType.REALTIME_INFO,
        description: `需要实时/最新信息（检测到关键词: ${matchedKeywords.join(', ')}）`,
        confidence,
        dataType: inferredDataType,  // 输出推断的数据类型
        triggerKeywords: matchedKeywords,
      };
    }
    
    return null;
  }

  /**
   * 增强的关键词匹配 - 考虑短语和词序
   */
  private enhancedKeywordMatch(input: string, keywords: string[]): string[] {
    const matched: string[] = [];
    
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      
      // 精确短语匹配（优先级最高）
      if (input.includes(lowerKeyword)) {
        matched.push(keyword);
        continue;
      }
      
      // 分词匹配（对于中文）
      if (/[\u4e00-\u9fa5]/.test(keyword)) {
        const charMatches = keyword.split('').filter(char => 
          /[\u4e00-\u9fa5]/.test(char) && input.includes(char)
        ).length;
        
        // 如果匹配了超过60%的字符，认为是部分匹配
        if (charMatches >= keyword.length * 0.6) {
          matched.push(keyword);
        }
      }
    }
    
    return matched;
  }

  /**
   * 从关键词推断数据类型
   */
  private inferDataTypeFromKeywords(keywords: string[]): string {
    const keywordString = keywords.join(' ').toLowerCase();
    
    // 黄金/金价
    if (/金价|黄金|白银/.test(keywordString)) {
      if (/银/.test(keywordString)) return 'silver_price';
      return 'gold_price';
    }
    // 汇率
    if (/汇率|美元|人民币|欧元|日元/.test(keywordString)) {
      return 'forex';
    }
    // 加密货币
    if (/比特币|以太坊|加密|币价/.test(keywordString)) {
      return 'crypto';
    }
    // 股价/股票
    if (/股价|股票|指数|大盘/.test(keywordString)) {
      return 'stock';
    }
    // 天气
    if (/天气|气温|温度|下雨|晴天/.test(keywordString)) {
      return 'weather';
    }
    // 油价
    if (/油价|原油|WTI|Brent/.test(keywordString)) {
      return 'oil_price';
    }
    // 新闻
    if (/新闻|头条|热点/.test(keywordString)) {
      return 'news';
    }
    
    // 默认通用
    return 'general';
  }

   /**
    * 动态置信度调整
    */
   private calculateDynamicConfidence(
     baseConfidence: number, 
     userInput: string,
     matchedKeywords: string[]
   ): number {
     let confidence = baseConfidence;
     
     // 时间敏感查询提升置信度
     const timeSensitiveWords = ['今天', '现在', '实时', '最新', '当前', '今日'];
     const hasTimeSensitive = timeSensitiveWords.some(word => 
       userInput.includes(word)
     );
     if (hasTimeSensitive) confidence += 0.1;
     
     // 金融查询特别提升
     const financeWords = ['金价', '黄金', '白银', '股价', '汇率', '油价', '比特币', '利率'];
     const financeMatches = matchedKeywords.filter(kw => 
       financeWords.includes(kw)
     ).length;
     if (financeMatches > 0) confidence += 0.05 * financeMatches;
     
     // 查询长度适度调整（过长或过短可能不够精确）
     const lengthFactor = Math.min(userInput.length / 10, 1.2);
     confidence *= (0.8 + lengthFactor * 0.2); // 在0.8-1.2之间调整
     
     return Math.min(confidence, 1.0);
   }

   /**
    * 从模式中提取可能的关键词（用于日志和调试）
    */
   private extractKeywordsFromPattern(pattern: RegExp, input: string): string[] {
     // 简单实现：返回模式中包含的常见关键词（实际项目中可更复杂）
     const commonKeywords = ['今日', '金价', '黄金', '汇率', '比特币', '美元', '人民币', '实时', '最新'];
     return commonKeywords.filter(kw => input.includes(kw));
   }

  /**
   * 检测是否需要新闻摘要 - 区分新闻内容 vs 新闻网站
   * 这是关键改进：用户说"今天有什么新闻"时，应该返回新闻摘要而不是网站链接
   */
  private detectNewsSummary(userInput: string): DetectedKnowledgeGap | null {
    const input = userInput.toLowerCase();
    const keywords = [...this.config.newsSummaryKeywords.zh, ...this.config.newsSummaryKeywords.en];
    
    const matchedKeywords = keywords.filter(kw => input.includes(kw.toLowerCase()));
    
    // 检测新闻相关的意图模式
    const newsIntentPatterns = [
      // 中文模式
      /.*新闻.*/i,           // 任何包含"新闻"的请求
      /.*今天.*/i,           // "今天"相关
      /.*发生.*/i,          // "发生了什么"
      /.*热点.*/i,          // "热点"
      /.*头条.*/i,          // "头条"
      // 英文模式
      /.*news$/i,           // 以 news 结尾
      /.*today.*/i,         // today 相关
      /what happened/i,     // 发生了什么
      /latest.*/i,          // 最新
    ];
    
    const hasNewsIntent = newsIntentPatterns.some(pattern => pattern.test(input));
    
    // 检测是否明确要求获取内容（而不是网站列表）
    const contentIndicators = [
      '有哪些', '有什么', '汇总', '摘要', '总结', '内容', 
      'what happened', 'summary', 'headlines'
    ];
    const wantsContent = contentIndicators.some(indicator => input.includes(indicator));
    
    // 如果匹配新闻摘要关键词 或 有新闻意图且想要内容
    if (matchedKeywords.length > 0 || (hasNewsIntent && wantsContent)) {
      // 高置信度：因为明确是新闻摘要请求
      const confidence = matchedKeywords.length > 0 
        ? Math.min(0.7 + matchedKeywords.length * 0.1, 0.95)
        : 0.75;
      
      // 关键改进：使用 web_search_and_fetch 并启用内容抓取
      // 这样可以直接获取新闻实际内容，而不是网站链接
      return {
        type: KnowledgeGapType.NEWS_SUMMARY,
        description: `需要新闻摘要（检测到关键词: ${matchedKeywords.join(', ')}）`,
        confidence,
        suggestedTool: 'web_search_and_fetch',  // 改为带抓取的搜索
        suggestedArgs: { 
          query: userInput, 
          limit: 10,
          fetchContent: true,  // 启用内容抓取
          summarize: true,
        },
        triggerKeywords: matchedKeywords,
      };
    }
    
    // 如果只是简单的"新闻"关键词，但没有明确的内容需求
    if (hasNewsIntent && matchedKeywords.length === 0) {
      return {
        type: KnowledgeGapType.REALTIME_INFO,
        description: `需要实时新闻信息`,
        confidence: 0.65,
        suggestedTool: 'web_search_and_fetch',
        suggestedArgs: { 
          query: userInput, 
          limit: 5,
          fetchContent: true,
        },
        triggerKeywords: ['新闻'],
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
      
      // 关键改进：使用 web_search_and_fetch 获取实际网页内容
      return {
        type: KnowledgeGapType.WEB_SEARCH,
        description: `需要搜索网络获取信息（检测到关键词: ${matchedKeywords.join(', ')}）`,
        confidence,
        suggestedTool: 'web_search_and_fetch',
        suggestedArgs: { 
          query: userInput, 
          limit: 5,
          fetchContent: true,  // 获取实际内容
        },
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
