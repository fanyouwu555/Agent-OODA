// packages/core/src/ooda/fast-response.ts
// 快速响应策略 - 先响应，后完善

import { LLMService } from '../llm/service.js';
import { getLLMConnectionPool } from '../llm/connection-pool.js';
import { ChatMessage } from '../llm/provider.js';

export interface FastResponseResult {
  /** 立即响应的内容 */
  immediateResponse: string;
  /** 是否需要后台详细处理 */
  needsDetailedProcessing: boolean;
  /** 意图类型 */
  intentType: string;
  /** 置信度 */
  confidence: number;
}

/**
 * 快速意图识别 - 基于关键词和简单规则，无需LLM
 */
export function quickIntentRecognition(input: string): {
  intentType: string;
  confidence: number;
  immediateResponse: string;
  needsDetailedProcessing: boolean;
} {
  const lowerInput = input.toLowerCase();
  
  // 文件操作类
  if (/读取|打开|查看.*文件|read|open.*file/i.test(lowerInput)) {
    return {
      intentType: 'file_read',
      confidence: 0.9,
      immediateResponse: '我来帮您读取文件内容...',
      needsDetailedProcessing: true,
    };
  }
  
  if (/写入|保存|创建.*文件|write|save/i.test(lowerInput)) {
    return {
      intentType: 'file_write',
      confidence: 0.9,
      immediateResponse: '我来帮您处理文件写入...',
      needsDetailedProcessing: true,
    };
  }
  
  // 搜索类
  if (/搜索|查询|查找|search|find|look for/i.test(lowerInput)) {
    return {
      intentType: 'search',
      confidence: 0.85,
      immediateResponse: '正在为您搜索相关信息...',
      needsDetailedProcessing: true,
    };
  }

  // 实时数据类 - 金价、股价、加密货币、天气等
  if (/金价|黄金价格|gold price|xau/i.test(lowerInput)) {
    return {
      intentType: 'realtime_gold',
      confidence: 0.95,
      immediateResponse: '正在为您查询实时金价...',
      needsDetailedProcessing: true,
    };
  }

  if (/股价|股票价格|stock price|股票.*多少|AAPL|TSLA|苹果|特斯拉/i.test(lowerInput)) {
    return {
      intentType: 'realtime_stock',
      confidence: 0.9,
      immediateResponse: '正在为您查询股票实时价格...',
      needsDetailedProcessing: true,
    };
  }

  if (/比特币|bitcoin|btc|以太坊|ethereum|eth|加密货币|crypto/i.test(lowerInput)) {
    return {
      intentType: 'realtime_crypto',
      confidence: 0.9,
      immediateResponse: '正在为您查询加密货币实时价格...',
      needsDetailedProcessing: true,
    };
  }

  if (/天气|温度|weather|气温.*多少|今天.*冷|今天.*热/i.test(lowerInput)) {
    return {
      intentType: 'realtime_weather',
      confidence: 0.9,
      immediateResponse: '正在为您查询实时天气...',
      needsDetailedProcessing: true,
    };
  }

  // 新闻事实类 - 最新新闻、热点事件
  if (/最新.*新闻|最近.*新闻|今天.*新闻|热点|头条|latest news|breaking news|news today/i.test(lowerInput)) {
    return {
      intentType: 'realtime_news',
      confidence: 0.9,
      immediateResponse: '正在为您获取最新新闻...',
      needsDetailedProcessing: true,
    };
  }

  // 时间查询类 - 当前时间、日期
  if (/现在.*几点|现在.*时间|当前.*时间|几点了|时间.*多少|今天.*几号|今天.*日期|现在.*日期/i.test(lowerInput)) {
    return {
      intentType: 'realtime_time',
      confidence: 0.95,
      immediateResponse: '正在为您查询当前时间...',
      needsDetailedProcessing: true,
    };
  }

  // 代码类 - 扩展匹配关键词
  if (/代码|编程|函数|class|function|def |import |return |if __name__|print\(|game|游戏|程序|写.*个|实现|python|java|javascript|js|ts|typescript|c\+\+|go|rust/i.test(lowerInput)) {
    return {
      intentType: 'code',
      confidence: 0.8,
      immediateResponse: '我来帮您编写代码...',
      needsDetailedProcessing: true,
    };
  }
  
  // 问候类 - 不需要详细处理
  if (/^(你好|您好|hello|hi|hey)$/i.test(lowerInput)) {
    return {
      intentType: 'greeting',
      confidence: 0.95,
      immediateResponse: '您好！有什么我可以帮助您的吗？',
      needsDetailedProcessing: false,
    };
  }

  // 确认/感谢类 - 不需要详细处理
  if (/^(ok|okay|好的|知道了|明白|了解|行|可以)$/i.test(lowerInput) ||
      /^(谢谢|感谢|多谢|谢了|谢谢帮助)$/i.test(lowerInput)) {
    return {
      intentType: 'confirmation',
      confidence: 0.9,
      immediateResponse: '不客气！如果还有其他问题，随时告诉我。',
      needsDetailedProcessing: false,
    };
  }

  // 告别类 - 不需要详细处理
  if (/^(bye|goodbye|再见|拜拜|拜|再会)$/i.test(lowerInput)) {
    return {
      intentType: 'farewell',
      confidence: 0.9,
      immediateResponse: '再见！祝您有愉快的一天！',
      needsDetailedProcessing: false,
    };
  }

  // 默认 - 需要详细处理
  return {
    intentType: 'general',
    confidence: 0.5,
    immediateResponse: '正在思考您的问题...',
    needsDetailedProcessing: true,
  };
}

/**
 * 快速流式响应 - 先发送部分内容，再逐步完善
 */
export async function* streamFastResponse(
  input: string,
  history: ChatMessage[]
): AsyncGenerator<string, void, unknown> {
  const pool = getLLMConnectionPool();
  const llm = await pool.acquire();
  
  try {
    // 1. 首先快速识别意图
    const quickResult = quickIntentRecognition(input);
    
    // 2. 立即返回初步响应
    yield quickResult.immediateResponse;
    
    // 3. 如果不需要详细处理，直接结束
    if (!quickResult.needsDetailedProcessing) {
      return;
    }
    
    // 4. 构建简化版提示，要求LLM快速响应
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是一个高效的AI助手。用户意图：${quickResult.intentType}。
请直接给出简洁的回答，不要过多解释。如果需要工具调用，请明确说明。`,
      },
      ...history.slice(-3), // 只保留最近3条历史，减少上下文
      {
        role: 'user',
        content: input,
      },
    ];
    
    // 5. 流式获取完整响应
    const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    for await (const chunk of llm.stream(prompt, { maxTokens: 800 })) {
      yield chunk;
    }
  } finally {
    pool.release(llm);
  }
}

/**
 * 并行意图分析 - 同时进行快速识别和LLM分析
 */
export async function parallelIntentAnalysis(
  input: string,
  onQuickResult?: (result: FastResponseResult) => void
): Promise<FastResponseResult> {
  // 立即返回快速识别结果
  const quickResult = quickIntentRecognition(input);
  
  if (onQuickResult) {
    onQuickResult(quickResult);
  }
  
  return quickResult;
}
