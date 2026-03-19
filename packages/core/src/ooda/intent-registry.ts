// packages/core/src/ooda/intent-registry.ts
// 意图注册表 - 可扩展的意图识别系统

export interface IntentMatcher {
  intentType: string;
  confidence: number;
  immediateResponse: string;
  needsDetailedProcessing: boolean;
  match(input: string): boolean;
}

export interface RecognitionResult {
  intentType: string;
  confidence: number;
  immediateResponse: string;
  needsDetailedProcessing: boolean;
}

export class IntentRegistry {
  private matchers: IntentMatcher[] = [];
  private defaultMatcher: IntentMatcher | null = null;

  register(matcher: IntentMatcher): void {
    this.matchers.push(matcher);
  }

  registerDefault(matcher: IntentMatcher): void {
    this.defaultMatcher = matcher;
  }

  recognize(input: string): RecognitionResult {
    const lowerInput = input.toLowerCase();

    for (const matcher of this.matchers) {
      try {
        if (matcher.match(lowerInput)) {
          return {
            intentType: matcher.intentType,
            confidence: matcher.confidence,
            immediateResponse: matcher.immediateResponse,
            needsDetailedProcessing: matcher.needsDetailedProcessing,
          };
        }
      } catch (e) {
        console.warn(`[IntentRegistry] Matcher error for ${matcher.intentType}:`, e);
      }
    }

    if (this.defaultMatcher) {
      return {
        intentType: this.defaultMatcher.intentType,
        confidence: this.defaultMatcher.confidence,
        immediateResponse: this.defaultMatcher.immediateResponse,
        needsDetailedProcessing: this.defaultMatcher.needsDetailedProcessing,
      };
    }

    return {
      intentType: 'general',
      confidence: 0.5,
      immediateResponse: '正在思考您的问题...',
      needsDetailedProcessing: true,
    };
  }

  getMatchers(): IntentMatcher[] {
    return [...this.matchers];
  }

  clear(): void {
    this.matchers = [];
    this.defaultMatcher = null;
  }
}

export function createDefaultIntentRegistry(): IntentRegistry {
  const registry = new IntentRegistry();

  // 文件操作类
  registry.register({
    intentType: 'file_read',
    confidence: 0.9,
    immediateResponse: '我来帮您读取文件内容...',
    needsDetailedProcessing: true,
    match: (input) => /读取|打开|查看.*文件|read|open.*file/i.test(input),
  });

  registry.register({
    intentType: 'file_write',
    confidence: 0.9,
    immediateResponse: '我来帮您处理文件写入...',
    needsDetailedProcessing: true,
    match: (input) => /写入|保存|创建.*文件|write|save/i.test(input),
  });

  // 搜索类
  registry.register({
    intentType: 'search',
    confidence: 0.85,
    immediateResponse: '正在为您搜索相关信息...',
    needsDetailedProcessing: true,
    match: (input) => /搜索|查询|查找|search|find|look for/i.test(input),
  });

  // 实时数据类 - 黄金
  registry.register({
    intentType: 'realtime_gold',
    confidence: 0.95,
    immediateResponse: '正在为您查询实时金价...',
    needsDetailedProcessing: true,
    match: (input) => /金价|黄金价格|gold price|xau/i.test(input),
  });

  // 实时数据类 - 股票
  registry.register({
    intentType: 'realtime_stock',
    confidence: 0.9,
    immediateResponse: '正在为您查询股票实时价格...',
    needsDetailedProcessing: true,
    match: (input) => /股价|股票价格|stock price|股票.*多少|AAPL|TSLA|苹果|特斯拉/i.test(input),
  });

  // 实时数据类 - 加密货币
  registry.register({
    intentType: 'realtime_crypto',
    confidence: 0.9,
    immediateResponse: '正在为您查询加密货币实时价格...',
    needsDetailedProcessing: true,
    match: (input) => /比特币|bitcoin|btc|以太坊|ethereum|eth|加密货币|crypto/i.test(input),
  });

  // 实时数据类 - 天气（必须在时间之前检查）
  registry.register({
    intentType: 'realtime_weather',
    confidence: 0.9,
    immediateResponse: '正在为您查询实时天气...',
    needsDetailedProcessing: true,
    match: (input) => /天气|温度|weather|气温.*多少|今天.*冷|今天.*热/i.test(input),
  });

  // 新闻类
  registry.register({
    intentType: 'realtime_news',
    confidence: 0.9,
    immediateResponse: '正在为您获取最新新闻...',
    needsDetailedProcessing: true,
    match: (input) => /最新.*新闻|最近.*新闻|今天.*新闻|热点|头条|latest news|breaking news|news today/i.test(input),
  });

  // 时间查询类（必须放在天气之后）
  registry.register({
    intentType: 'realtime_time',
    confidence: 0.95,
    immediateResponse: '正在为您查询当前时间...',
    needsDetailedProcessing: true,
    match: (input) => {
      const timePatterns = [
        /^几号$/,
        /^哪天$/,
        /^现在几点$/,
        /^几点了$/,
        /什么日期|哪一天/,
        /今天.*几号|今天.*星期|今天.*日期/,
        /现在.*几点|现在.*时间|当前.*时间/,
        /现在.*日期|当前.*日期/,
        /^时间.*$/,
        /几号呢|几号了今天|几号啊/,
      ];
      return timePatterns.some((pattern) => pattern.test(input));
    },
  });

  // 代码类
  registry.register({
    intentType: 'code',
    confidence: 0.8,
    immediateResponse: '我来帮您编写代码...',
    needsDetailedProcessing: true,
    match: (input) => /代码|编程|函数|class|function|def |import |return |if __name__|print\(|game|游戏|程序|写.*个|实现|python|java|javascript|js|ts|typescript|c\+\+|go|rust/i.test(input),
  });

  // 简单响应类
  registry.register({
    intentType: 'greeting',
    confidence: 0.95,
    immediateResponse: '您好！有什么我可以帮助您的吗？',
    needsDetailedProcessing: false,
    match: (input) => /^(你好|您好|hello|hi|hey)$/i.test(input),
  });

  registry.register({
    intentType: 'confirmation',
    confidence: 0.9,
    immediateResponse: '不客气！如果还有其他问题，随时告诉我。',
    needsDetailedProcessing: false,
    match: (input) => /^(ok|okay|好的|知道了|明白|了解|行|可以|谢谢|感谢|多谢|谢了)$/i.test(input),
  });

  registry.register({
    intentType: 'farewell',
    confidence: 0.9,
    immediateResponse: '再见！祝您有愉快的一天！',
    needsDetailedProcessing: false,
    match: (input) => /^(bye|goodbye|再见|拜拜|拜|再会)$/i.test(input),
  });

  // 默认处理器
  registry.registerDefault({
    intentType: 'general',
    confidence: 0.5,
    immediateResponse: '正在思考您的问题...',
    needsDetailedProcessing: true,
    match: () => true,
  });

  return registry;
}

// 全局注册表实例
let globalRegistry: IntentRegistry | null = null;

export function getIntentRegistry(): IntentRegistry {
  if (!globalRegistry) {
    globalRegistry = createDefaultIntentRegistry();
  }
  return globalRegistry;
}

export function resetIntentRegistry(): void {
  globalRegistry = null;
}
