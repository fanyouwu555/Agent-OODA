// 时间查询和天气查询修复验证测试
// 运行: npx vitest run packages/core/src/ooda/__tests__/smart-response-time.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 依赖
vi.mock('../../llm/service', () => ({
  getLLMService: vi.fn(() => ({
    generate: vi.fn().mockResolvedValue({ text: '' }),
    chat: vi.fn().mockResolvedValue({ text: '' }),
    stream: vi.fn(function* () { })
  })),
  setLLMService: vi.fn(),
  resetLLMService: vi.fn()
}));

vi.mock('../../llm/connection-pool', () => ({
  getLLMConnectionPool: vi.fn(() => ({
    acquire: vi.fn().mockResolvedValue({
      getProvider: vi.fn(() => ({
        stream: vi.fn(function* () { })
      })),
      release: vi.fn()
    })
  }))
}));

vi.mock('../../tool/registry', () => ({
  getToolRegistry: vi.fn(() => ({
    get: vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue({
        time: '12:00:00',
        date: '2026/03/19',
        weekday: '星期四',
        timezone: 'Asia/Shanghai'
      })
    })
  }))
}));

describe('时间查询意图识别测试', () => {
  let quickIntentRecognition: (input: string) => any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../fast-response');
    quickIntentRecognition = mod.quickIntentRecognition;
  });

  describe('时间查询模式匹配', () => {
    const timeQueryCases = [
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
      { input: '几号了今天', expected: 'realtime_time' },
      { input: '今天日期', expected: 'realtime_time' },
      { input: '现在几点', expected: 'realtime_time' },
    ];

    timeQueryCases.forEach(({ input, expected }) => {
      it(`"${input}" 应该识别为 ${expected}`, () => {
        const result = quickIntentRecognition(input);
        expect(result.intentType).toBe(expected);
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });
  });

  describe('天气查询应该正确识别为 realtime_weather', () => {
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
      it(`"${input}" 应该识别为 ${expected}`, () => {
        const result = quickIntentRecognition(input);
        expect(result.intentType).toBe(expected);
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });
  });

  describe('非时间查询应该不匹配', () => {
    const nonTimeCases = [
      '今天天气怎么样',
      '帮我写代码',
      '你好',
      '再见',
      '谢谢',
      '苹果股价',
      '黄金价格',
      '合肥天气',
    ];

    nonTimeCases.forEach((input) => {
      it(`"${input}" 不应该识别为 realtime_time`, () => {
        const result = quickIntentRecognition(input);
        expect(result.intentType).not.toBe('realtime_time');
      });
    });
  });
});

describe('时间格式化测试', () => {
  it('应该正确解析工具结果字符串', () => {
    const toolResult = '当前时间：12:00:00，日期：2026/03/19 星期四，时区：Asia/Shanghai';

    const timeMatch = toolResult.match(/(\d{2}:\d{2}:\d{2})/);
    const dateMatch = toolResult.match(/(\d{4}\/\d{2}\/\d{2})/);
    const weekdayMatch = toolResult.match(/(星期[一二三四五六日])/);

    expect(dateMatch).toBeTruthy();
    expect(timeMatch).toBeTruthy();
    expect(weekdayMatch).toBeTruthy();

    if (dateMatch && timeMatch && weekdayMatch) {
      const [year, month, day] = dateMatch[1].split('/');
      expect(year).toBe('2026');
      expect(month).toBe('03');
      expect(day).toBe('19');

      expect(weekdayMatch[1]).toBe('星期四');

      const [hour, minute] = timeMatch[1].split(':');
      expect(hour).toBe('12');
      expect(minute).toBe('00');
    }
  });

  it('应该正确格式化12小时制时间', () => {
    const testCases = [
      { hour: '00', expected: '12', period: '上午' },
      { hour: '01', expected: '1', period: '上午' },
      { hour: '11', expected: '11', period: '上午' },
      { hour: '12', expected: '12', period: '下午' },
      { hour: '13', expected: '1', period: '下午' },
      { hour: '23', expected: '11', period: '下午' },
    ];

    testCases.forEach(({ hour, expected, period }) => {
      const h = parseInt(hour);
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const p = h < 12 ? '上午' : '下午';

      expect(h12.toString()).toBe(expected);
      expect(p).toBe(period);
    });
  });

  it('应该正确处理月份和日期的数字转换', () => {
    const testCases = [
      { input: '03', expected: '3' },
      { input: '09', expected: '9' },
      { input: '12', expected: '12' },
    ];

    testCases.forEach(({ input, expected }) => {
      expect(parseInt(input).toString()).toBe(expected);
    });
  });
});

describe('直接格式化输出逻辑测试', () => {
  function formatTimeOutput(toolResult: string): string {
    let output = '';
    if (typeof toolResult === 'string') {
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
    }
    return output;
  }

  it('应该输出正确的格式化时间', () => {
    const toolResult = '当前时间：12:08:36，日期：2026/03/19 星期四，时区：Asia/Shanghai';
    const output = formatTimeOutput(toolResult);

    expect(output).toBe('2026年3月19日 星期四 下午12:08');
  });

  it('应该处理上午时间', () => {
    const toolResult = '当前时间：09:30:00，日期：2026/03/19 星期四，时区：Asia/Shanghai';
    const output = formatTimeOutput(toolResult);

    expect(output).toBe('2026年3月19日 星期四 上午9:30');
  });

  it('应该处理午夜的格式', () => {
    const toolResult = '当前时间：00:15:00，日期：2026/03/19 星期四，时区：Asia/Shanghai';
    const output = formatTimeOutput(toolResult);

    expect(output).toBe('2026年3月19日 星期四 上午12:15');
  });
});

describe('天气格式化输出测试', () => {
  function formatWeatherOutput(toolResult: any): string {
    let output = '';
    try {
      const weatherData = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
      const { location, weather, temp, tempHigh, tempLow, wind, aqi, suggestion } = weatherData;

      output = `${location}今天${weather}，气温${tempLow}°C~${tempHigh}°C`;
      if (wind) {
        output += `，${wind}`;
      }
      if (aqi) {
        output += `，空气质量${aqi}`;
      }
      if (suggestion) {
        output += `，${suggestion}`;
      }
    } catch (e) {
      output = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
    }
    return output;
  }

  it('应该正确格式化天气数据', () => {
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

  it('应该处理缺少可选字段的天气数据', () => {
    const weatherData = {
      location: '北京',
      weather: '晴',
      temp: '20',
      tempHigh: '25',
      tempLow: '15'
    };
    const output = formatWeatherOutput(weatherData);

    expect(output).toBe('北京今天晴，气温15°C~25°C');
  });

  it('应该处理字符串类型的天气数据', () => {
    const toolResult = '{"location":"上海","weather":"小雨","temp":"18","tempHigh":"20","tempLow":"16"}';
    const output = formatWeatherOutput(toolResult);

    expect(output).toBe('上海今天小雨，气温16°C~20°C');
  });
});

describe('SmartResponse 优化类型测试', () => {
  it('SmartResponseResult 应该支持 direct 优化类型', () => {
    interface SmartResponseResult {
      output: string;
      usedTools: boolean;
      executionTime: number;
      optimization: 'simple-prompt' | 'parallel' | 'standard' | 'direct';
    }

    const result: SmartResponseResult = {
      output: '测试',
      usedTools: true,
      executionTime: 100,
      optimization: 'direct'
    };

    expect(result.optimization).toBe('direct');
  });
});
