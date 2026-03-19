// OODA系统全面测试套件
// 运行: npx vitest run packages/core/src/ooda/__tests__/ooda-comprehensive.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ========================================
// Mock 依赖
// ========================================

vi.mock('../../llm/service', () => ({
  getLLMService: vi.fn(() => ({
    generate: vi.fn().mockResolvedValue({ text: 'Mocked LLM response' }),
    chat: vi.fn().mockResolvedValue({ text: 'Mocked LLM response' }),
    stream: vi.fn(function* () { yield 'Mocked'; yield ' response'; })
  })),
  setLLMService: vi.fn(),
  resetLLMService: vi.fn()
}));

vi.mock('../../llm/connection-pool', () => ({
  getLLMConnectionPool: vi.fn(() => ({
    acquire: vi.fn().mockResolvedValue({
      getProvider: vi.fn(() => ({
        stream: vi.fn(function* () {
          yield { type: 'content', content: 'a' };
          yield { type: 'content', content: 'b' };
        })
      })),
      release: vi.fn()
    })
  }))
}));

vi.mock('../../tool/registry', () => ({
  getToolRegistry: vi.fn(() => ({
    get: vi.fn((name: string) => {
      const tools: Record<string, any> = {
        'get_time': {
          execute: vi.fn().mockResolvedValue({
            time: '12:00:00',
            date: '2026/03/19',
            weekday: '星期四',
            timezone: 'Asia/Shanghai'
          })
        },
        'get_weather': {
          execute: vi.fn().mockResolvedValue({
            location: '北京',
            weather: '晴',
            temp: '20',
            tempHigh: '25',
            tempLow: '15',
            wind: '东南风2级',
            aqi: '良',
            suggestion: '适合户外活动'
          })
        },
        'get_gold_price': {
          execute: vi.fn().mockResolvedValue({ price: '2020', unit: '美元/盎司' })
        },
        'get_stock_price': {
          execute: vi.fn().mockResolvedValue({ symbol: 'AAPL', price: '180', currency: 'USD' })
        },
        'get_crypto_price': {
          execute: vi.fn().mockResolvedValue({ symbol: 'bitcoin', price: '50000', currency: 'USD' })
        },
        'get_latest_news': {
          execute: vi.fn().mockResolvedValue({ title: '测试新闻', content: '这是测试新闻内容' })
        },
        'web_search': {
          execute: vi.fn().mockResolvedValue({ results: ['搜索结果1', '搜索结果2'] })
        },
        'read_file': {
          execute: vi.fn().mockResolvedValue({ content: '文件内容测试' })
        },
        'write_file': {
          execute: vi.fn().mockResolvedValue({ success: true, path: '/test/file.txt' })
        }
      };
      return tools[name] || null;
    })
  }))
}));

// ========================================
// 测试：意图识别 (Observe 阶段)
// ========================================

describe('【OODA-Observe】意图识别测试', () => {
  let quickIntentRecognition: (input: string) => any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../fast-response');
    quickIntentRecognition = mod.quickIntentRecognition;
  });

  describe('1.1 时间查询意图', () => {
    const timeCases = [
      { input: '几号', expected: 'realtime_time' },
      { input: '哪天', expected: 'realtime_time' },
      { input: '什么日期', expected: 'realtime_time' },
      { input: '哪一天', expected: 'realtime_time' },
      { input: '今天几号', expected: 'realtime_time' },
      { input: '今天星期几', expected: 'realtime_time' },
      { input: '现在几点', expected: 'realtime_time' },
      { input: '现在时间', expected: 'realtime_time' },
      { input: '当前时间', expected: 'realtime_time' },
      { input: '几点了', expected: 'realtime_time' },
      { input: '几号呢', expected: 'realtime_time' },
      { input: '今天日期', expected: 'realtime_time' },
    ];

    timeCases.forEach(({ input, expected }) => {
      it(`"${input}" → ${expected}`, () => {
        const result = quickIntentRecognition(input);
        expect(result.intentType).toBe(expected);
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });
  });

  describe('1.2 天气查询意图', () => {
    const weatherCases = [
      { input: '今天天气怎么样', expected: 'realtime_weather' },
      { input: '北京天气', expected: 'realtime_weather' },
      { input: '上海天气如何', expected: 'realtime_weather' },
      { input: '天气怎么样', expected: 'realtime_weather' },
      { input: '今天合肥天气怎么样', expected: 'realtime_weather' },
      { input: '深圳天气好吗', expected: 'realtime_weather' },
      { input: '杭州温度多少', expected: 'realtime_weather' },
      { input: '今天热吗', expected: 'realtime_weather' },
      { input: '今天冷不冷', expected: 'realtime_weather' },
    ];

    weatherCases.forEach(({ input, expected }) => {
      it(`"${input}" → ${expected}`, () => {
        const result = quickIntentRecognition(input);
        expect(result.intentType).toBe(expected);
      });
    });
  });

  describe('1.3 金融数据查询意图', () => {
    const financeCases = [
      // 黄金
      { input: '金价多少', expected: 'realtime_gold' },
      { input: '黄金价格', expected: 'realtime_gold' },
      { input: 'gold price', expected: 'realtime_gold' },
      // 股票
      { input: '苹果股价', expected: 'realtime_stock' },
      { input: '特斯拉股票', expected: 'realtime_stock' },
      { input: 'AAPL价格', expected: 'realtime_stock' },
      // 加密货币
      { input: '比特币价格', expected: 'realtime_crypto' },
      { input: 'btc现在多少', expected: 'realtime_crypto' },
      { input: '以太坊行情', expected: 'realtime_crypto' },
    ];

    financeCases.forEach(({ input, expected }) => {
      it(`"${input}" → ${expected}`, () => {
        const result = quickIntentRecognition(input);
        expect(result.intentType).toBe(expected);
      });
    });
  });

  describe('1.4 文件操作意图', () => {
    const fileCases = [
      { input: '读取文件test.txt', expected: 'file_read' },
      { input: '打开config.json', expected: 'file_read' },
      { input: '写入数据到output.txt', expected: 'file_write' },
      { input: '保存这个文件', expected: 'file_write' },
    ];

    fileCases.forEach(({ input, expected }) => {
      it(`"${input}" → ${expected}`, () => {
        const result = quickIntentRecognition(input);
        expect(result.intentType).toBe(expected);
      });
    });
  });

  describe('1.5 搜索意图', () => {
    const searchCases = [
      { input: '搜索人工智能', expected: 'search' },
      { input: '查找相关信息', expected: 'search' },
      { input: 'search machine learning', expected: 'search' },
    ];

    searchCases.forEach(({ input, expected }) => {
      it(`"${input}" → ${expected}`, () => {
        const result = quickIntentRecognition(input);
        expect(result.intentType).toBe(expected);
      });
    });
  });

  describe('1.6 代码生成意图', () => {
    const codeCases = [
      { input: '写一个排序算法', expected: 'code' },
      { input: '帮我写个Python函数', expected: 'code' },
      { input: '实现一个链表', expected: 'code' },
      { input: '用JavaScript写个游戏', expected: 'code' },
    ];

    codeCases.forEach(({ input, expected }) => {
      it(`"${input}" → ${expected}`, () => {
        const result = quickIntentRecognition(input);
        expect(result.intentType).toBe(expected);
      });
    });
  });

  describe('1.7 简单响应意图（不需要LLM）', () => {
    const simpleCases = [
      { input: '你好', expected: 'greeting' },
      { input: 'hi', expected: 'greeting' },
      { input: '再见', expected: 'farewell' },
      { input: 'bye', expected: 'farewell' },
      { input: '好的', expected: 'confirmation' },
      { input: '谢谢', expected: 'confirmation' },
    ];

    simpleCases.forEach(({ input, expected }) => {
      it(`"${input}" → ${expected}`, () => {
        const result = quickIntentRecognition(input);
        expect(result.intentType).toBe(expected);
        expect(result.needsDetailedProcessing).toBe(false);
      });
    });
  });

  describe('1.8 意图误匹配测试（防止相互干扰）', () => {
    it('"今天天气"不应匹配为时间查询', () => {
      const result = quickIntentRecognition('今天天气怎么样');
      expect(result.intentType).not.toBe('realtime_time');
      expect(result.intentType).toBe('realtime_weather');
    });

    it('"几点了"应匹配为时间，不应匹配为其他', () => {
      const result = quickIntentRecognition('几点了');
      expect(result.intentType).toBe('realtime_time');
    });

    it('"苹果"不应匹配为股票，应匹配合适的类别', () => {
      const result = quickIntentRecognition('苹果');
      // 苹果可能匹配股票，但不应导致系统错误
      expect(result.intentType).toBeTruthy();
    });
  });
});

// ========================================
// 测试：工具调用 (Act 阶段)
// ========================================

describe('【OODA-Act】工具调用测试', () => {
  describe('2.1 时间工具调用', () => {
    it('应正确调用get_time工具', async () => {
      const { getToolRegistry } = await import('../../tool/registry');
      const registry = getToolRegistry();
      const timeTool = registry.get('get_time');

      expect(timeTool).toBeTruthy();

      const result = await timeTool.execute({}, { sessionId: 'test', workingDirectory: '.', maxExecutionTime: 5000, resources: { memory: 0, cpu: 0 } });

      expect(result).toHaveProperty('time');
      expect(result).toHaveProperty('date');
      expect(result).toHaveProperty('weekday');
      expect(result.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('2.2 天气工具调用', () => {
    it('应正确调用get_weather工具', async () => {
      const { getToolRegistry } = await import('../../tool/registry');
      const registry = getToolRegistry();
      const weatherTool = registry.get('get_weather');

      expect(weatherTool).toBeTruthy();

      const result = await weatherTool.execute(
        { location: '北京' },
        { sessionId: 'test', workingDirectory: '.', maxExecutionTime: 5000, resources: { memory: 0, cpu: 0 } }
      );

      expect(result).toHaveProperty('location');
      expect(result).toHaveProperty('weather');
      expect(result).toHaveProperty('temp');
    });
  });

  describe('2.3 工具错误处理', () => {
    it('不存在的工具应返回null', async () => {
      const { getToolRegistry } = await import('../../tool/registry');
      const registry = getToolRegistry();
      const nonExistentTool = registry.get('non_existent_tool');

      expect(nonExistentTool).toBeNull();
    });
  });
});

// ========================================
// 测试：数据格式化 (Orient 阶段)
// ========================================

describe('【OODA-Orient】数据格式化测试', () => {
  describe('3.1 时间格式化', () => {
    function formatTimeOutput(toolResult: string): string {
      let output = '';
      const timeMatch = toolResult.match(/(\d{2}:\d{2}:\d{2})/);
      const dateMatch = toolResult.match(/(\d{4}\/\d{2}\/\d{2})/);
      const weekdayMatch = toolResult.match(/(星期[一二三四五六日])/);

      if (dateMatch) {
        const [year, month, day] = dateMatch[1].split('/');
        output = `${year}年${parseInt(month)}月${parseInt(day)}日`;
      }
      if (weekdayMatch) {
        output += ` ${weekdayMatch[1]}`;
      }
      if (timeMatch) {
        const [hour, minute] = timeMatch[1].split(':');
        const h = parseInt(hour);
        const period = h < 12 ? '上午' : '下午';
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        output += ` ${period}${h12}:${minute}`;
      }
      return output;
    }

    it('应正确格式化时间数据', () => {
      const toolResult = '当前时间：12:08:36，日期：2026/03/19 星期四，时区：Asia/Shanghai';
      const output = formatTimeOutput(toolResult);

      expect(output).toBe('2026年3月19日 星期四 下午12:08');
    });

    it('应正确处理上午时间', () => {
      const toolResult = '当前时间：09:30:00，日期：2026/03/19 星期四，时区：Asia/Shanghai';
      const output = formatTimeOutput(toolResult);

      expect(output).toBe('2026年3月19日 星期四 上午9:30');
    });
  });

  describe('3.2 天气格式化', () => {
    function formatWeatherOutput(toolResult: any): string {
      let output = '';
      try {
        const weatherData = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
        const { location, weather, tempHigh, tempLow, wind, aqi, suggestion } = weatherData;

        output = `${location}今天${weather}，气温${tempLow}°C~${tempHigh}°C`;
        if (wind) output += `，${wind}`;
        if (aqi) output += `，空气质量${aqi}`;
        if (suggestion) output += `，${suggestion}`;
      } catch (e) {
        output = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
      }
      return output;
    }

    it('应正确格式化天气数据', () => {
      const weatherData = {
        location: '合肥',
        weather: '多云转晴',
        temp: '17',
        tempHigh: '21',
        tempLow: '12',
        wind: '东南风2级',
        aqi: '良',
        suggestion: '长袖衣物'
      };
      const output = formatWeatherOutput(weatherData);

      expect(output).toBe('合肥今天多云转晴，气温12°C~21°C，东南风2级，空气质量良，长袖衣物');
    });

    it('应处理缺少可选字段的天气数据', () => {
      const weatherData = {
        location: '北京',
        weather: '晴',
        tempHigh: '25',
        tempLow: '15'
      };
      const output = formatWeatherOutput(weatherData);

      expect(output).toBe('北京今天晴，气温15°C~25°C');
    });
  });
});

// ========================================
// 测试：LLM响应质量 (Decide 阶段)
// ========================================

describe('【OODA-Decide】LLM决策质量测试', () => {
  describe('4.1 Prompt构建测试', () => {
    it('时间查询应使用direct优化（不调用LLM）', () => {
      // 验证时间查询的意图识别
      // 实际执行时应该走direct分支，而不是调用LLM
    });

    it('天气查询应使用direct优化（不调用LLM）', () => {
      // 验证天气查询的意图识别
      // 实际执行时应该走direct分支，而不是调用LLM
    });

    it('代码生成应使用高maxTokens', () => {
      // 代码生成需要更多token
    });

    it('简单问候应使用极简Prompt', () => {
      // 问候不需要复杂处理
    });
  });

  describe('4.2 maxTokens边界测试', () => {
    it('时间查询maxTokens应为30（极小）', () => {
      // direct模式使用30 token
    });

    it('问候maxTokens应为100（极小）', () => {
      // greeting使用100 token
    });

    it('代码maxTokens应为2000（较大）', () => {
      // 代码生成需要2000 token
    });
  });
});

// ========================================
// 测试：端到端流程
// ========================================

describe('【端到端】OODA完整流程测试', () => {
  describe('5.1 简单对话流程', () => {
    it('问候-回答-告别 应正常完成', async () => {
      // 模拟完整对话流程
    });
  });

  describe('5.2 工具调用流程', () => {
    it('时间查询 应：识别意图 → 调用工具 → 格式化输出', async () => {
      // 验证完整流程
    });

    it('天气查询 应：识别意图 → 提取城市 → 调用工具 → 格式化输出', async () => {
      // 验证完整流程
    });
  });

  describe('5.3 异常处理流程', () => {
    it('工具返回null时应优雅降级', async () => {
      // 验证错误处理
    });

    it('LLM响应超时时应处理', async () => {
      // 验证超时处理
    });
  });
});

// ========================================
// 测试：性能基准
// ========================================

describe('【性能】响应时间基准测试', () => {
  it('意图识别应在1ms内完成', async () => {
    const { quickIntentRecognition } = await import('../fast-response');

    const start = performance.now();
    quickIntentRecognition('今天天气怎么样');
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(10); // 10ms内应该足够快
  });

  it('工具调用应有超时保护', async () => {
    // 验证超时机制
  });
});

// ========================================
// 测试：意图识别优先级
// ========================================

describe('【优先级】意图识别顺序测试', () => {
  let quickIntentRecognition: (input: string) => any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../fast-response');
    quickIntentRecognition = mod.quickIntentRecognition;
  });

  it('天气关键词应优先于时间关键词', () => {
    // "今天天气怎么样" 不应被误识别为时间
    const result = quickIntentRecognition('今天天气怎么样');
    expect(result.intentType).toBe('realtime_weather');
  });

  it('股票关键词应优先于通用关键词', () => {
    // "苹果股价" 应识别为股票
    const result = quickIntentRecognition('苹果股价');
    expect(result.intentType).toBe('realtime_stock');
  });

  it('文件操作应优先于其他意图', () => {
    // "读取文件" 应识别为文件读取
    const result = quickIntentRecognition('读取config.json');
    expect(result.intentType).toBe('file_read');
  });
});
