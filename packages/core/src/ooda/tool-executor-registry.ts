// packages/core/src/ooda/tool-executor-registry.ts
// 工具执行器注册表 - 可扩展的工具调用系统

import { getToolRegistry } from '../tool/registry.js';

export interface ToolContext {
  workingDirectory: string;
  sessionId: string;
  maxExecutionTime: number;
  resources: {
    memory: number;
    cpu: number;
  };
}

export interface ToolExecutor {
  readonly intentType: string;
  readonly toolName: string;
  extractParams(input: string, context: ToolContext): Record<string, any>;
  formatResult(result: any): string;
}

export class ToolExecutorRegistry {
  private executors: Map<string, ToolExecutor> = new Map();

  register(executor: ToolExecutor): void {
    this.executors.set(executor.intentType, executor);
  }

  getExecutor(intentType: string): ToolExecutor | null {
    return this.executors.get(intentType) || null;
  }

  hasExecutor(intentType: string): boolean {
    return this.executors.has(intentType);
  }

  getAllIntentTypes(): string[] {
    return Array.from(this.executors.keys());
  }

  clear(): void {
    this.executors.clear();
  }
}

// 时间工具执行器
const timeToolExecutor: ToolExecutor = {
  get intentType() { return 'realtime_time'; },
  get toolName() { return 'get_time'; },

  extractParams(input: string, context: ToolContext): Record<string, any> {
    return {};
  },

  formatResult(result: any): string {
    if (typeof result === 'string') {
      return result;
    }
    const { time, date, weekday, timezone } = result;
    return `当前时间：${time}，日期：${date} ${weekday}，时区：${timezone}`;
  },
};

// 天气工具执行器
const weatherToolExecutor: ToolExecutor = {
  get intentType() { return 'realtime_weather'; },
  get toolName() { return 'get_weather'; },

  extractParams(input: string, context: ToolContext): Record<string, any> {
    const cityPatterns = [
      /([^\s天气温度冷热]+)\s*天气/,
      /天气\s*([^\s冷热温度]+)/,
      /([^\s]+)\s*(?:今天|明天|后天)?\s*天气/,
    ];

    let city = '北京';
    for (const pattern of cityPatterns) {
      const match = input.match(pattern);
      if (match && match[1] && !/怎么|怎么样|如何|好吗|啥/i.test(match[1])) {
        city = match[1];
        break;
      }
    }

    const knownCities = [
      '北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '武汉', '西安', '南京',
      '合肥', '天津', '苏州', '郑州', '长沙', '沈阳', '青岛', '济南', '大连',
      '哈尔滨', '长春', '昆明', '福州', '厦门', '宁波', '石家庄', '兰州',
      '太原', '呼和浩特', '乌鲁木齐', '拉萨', '海口', '三亚'
    ];

    if (!knownCities.includes(city)) {
      city = '北京';
    }

    return { location: city };
  },

  formatResult(result: any): string {
    if (typeof result === 'string') {
      return result;
    }
    const { location, weather, tempHigh, tempLow, wind, aqi, suggestion } = result;
    let output = `${location}今天${weather}，气温${tempLow}°C~${tempHigh}°C`;
    if (wind) output += `，${wind}`;
    if (aqi) output += `，空气质量${aqi}`;
    if (suggestion) output += `，${suggestion}`;
    return output;
  },
};

// 黄金工具执行器
const goldToolExecutor: ToolExecutor = {
  get intentType() { return 'realtime_gold'; },
  get toolName() { return 'get_gold_price'; },

  extractParams(input: string, context: ToolContext): Record<string, any> {
    return {};
  },

  formatResult(result: any): string {
    if (typeof result === 'string') {
      return result;
    }
    return `当前黄金价格是${result.price}${result.unit}`;
  },
};

// 股票工具执行器
const stockToolExecutor: ToolExecutor = {
  get intentType() { return 'realtime_stock'; },
  get toolName() { return 'get_stock_price'; },

  extractParams(input: string, context: ToolContext): Record<string, any> {
    const stockMatch = input.match(/([A-Z]{1,5})/) || input.match(/(\d{6})/);
    return stockMatch ? { symbol: stockMatch[1] } : { symbol: 'AAPL' };
  },

  formatResult(result: any): string {
    if (typeof result === 'string') {
      return result;
    }
    return `${result.symbol}当前股价是${result.price}${result.currency}`;
  },
};

// 加密货币工具执行器
const cryptoToolExecutor: ToolExecutor = {
  get intentType() { return 'realtime_crypto'; },
  get toolName() { return 'get_crypto_price'; },

  extractParams(input: string, context: ToolContext): Record<string, any> {
    let symbol = 'bitcoin';
    if (/比特币|btc/i.test(input)) symbol = 'bitcoin';
    else if (/以太坊|eth/i.test(input)) symbol = 'ethereum';
    return { symbol };
  },

  formatResult(result: any): string {
    if (typeof result === 'string') {
      return result;
    }
    return `${result.symbol}当前价格是${result.price}${result.currency}`;
  },
};

// 新闻工具执行器
const newsToolExecutor: ToolExecutor = {
  get intentType() { return 'realtime_news'; },
  get toolName() { return 'get_latest_news'; },

  extractParams(input: string, context: ToolContext): Record<string, any> {
    return { category: 'general' };
  },

  formatResult(result: any): string {
    if (typeof result === 'string') {
      return result;
    }
    return result.title ? `${result.title}\n${result.content}` : JSON.stringify(result);
  },
};

// 文件读取执行器
const fileReadExecutor: ToolExecutor = {
  get intentType() { return 'file_read'; },
  get toolName() { return 'read_file'; },

  extractParams(input: string, context: ToolContext): Record<string, any> {
    const readMatch = input.match(/读取\s*["']?([^"']+)["']?/i);
    return readMatch ? { path: readMatch[1] } : { path: '' };
  },

  formatResult(result: any): string {
    if (typeof result === 'string') {
      return result;
    }
    return result.content ? `文件内容：\n${result.content}` : JSON.stringify(result);
  },
};

// 文件写入执行器
const fileWriteExecutor: ToolExecutor = {
  get intentType() { return 'file_write'; },
  get toolName() { return 'write_file'; },

  extractParams(input: string, context: ToolContext): Record<string, any> {
    const writeMatch = input.match(/写入\s*["']?([^"']+)["']?\s*[:\n]([\s\S]+)/i);
    if (writeMatch) {
      return { path: writeMatch[1], content: writeMatch[2].trim() };
    }
    return { path: '', content: '' };
  },

  formatResult(result: any): string {
    if (typeof result === 'string') {
      return result;
    }
    return result.success
      ? `文件已成功写入：${result.path}`
      : `文件写入失败：${JSON.stringify(result)}`;
  },
};

// 搜索执行器
const searchExecutor: ToolExecutor = {
  get intentType() { return 'search'; },
  get toolName() { return 'web_search'; },

  extractParams(input: string, context: ToolContext): Record<string, any> {
    const searchMatch = input.match(/搜索\s*["']?([^"']+)["']?/i);
    return searchMatch ? { query: searchMatch[1] } : { query: input };
  },

  formatResult(result: any): string {
    if (typeof result === 'string') {
      return result;
    }
    if (Array.isArray(result.results)) {
      return result.results.join('\n');
    }
    return JSON.stringify(result);
  },
};

// 创建默认的工具执行器注册表
export function createDefaultToolExecutorRegistry(): ToolExecutorRegistry {
  const registry = new ToolExecutorRegistry();

  registry.register(timeToolExecutor);
  registry.register(weatherToolExecutor);
  registry.register(goldToolExecutor);
  registry.register(stockToolExecutor);
  registry.register(cryptoToolExecutor);
  registry.register(newsToolExecutor);
  registry.register(fileReadExecutor);
  registry.register(fileWriteExecutor);
  registry.register(searchExecutor);

  return registry;
}

// 执行工具调用的便捷函数
export async function executeToolByIntentType(
  intentType: string,
  input: string,
  sessionId: string
): Promise<any> {
  const registry = createDefaultToolExecutorRegistry();
  const executor = registry.getExecutor(intentType);

  if (!executor) {
    console.warn(`[ToolExecutorRegistry] No executor found for intent: ${intentType}`);
    return null;
  }

  const toolRegistry = getToolRegistry();
  const tool = toolRegistry.get(executor.toolName);

  if (!tool) {
    console.warn(`[ToolExecutorRegistry] Tool not found: ${executor.toolName}`);
    return null;
  }

  const context: ToolContext = {
    workingDirectory: process.cwd(),
    sessionId,
    maxExecutionTime: 30000,
    resources: { memory: 1024 * 1024 * 100, cpu: 1 },
  };

  const params = executor.extractParams(input, context);
  const result = await tool.execute(params, context);

  return {
    raw: result,
    formatted: executor.formatResult(result),
  };
}

// 全局注册表实例
let globalRegistry: ToolExecutorRegistry | null = null;

export function getToolExecutorRegistry(): ToolExecutorRegistry {
  if (!globalRegistry) {
    globalRegistry = createDefaultToolExecutorRegistry();
  }
  return globalRegistry;
}

export function resetToolExecutorRegistry(): void {
  globalRegistry = null;
}
