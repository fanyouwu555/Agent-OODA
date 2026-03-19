// OODA系统集成测试
// 运行: npx vitest run packages/core/src/ooda/__tests__/ooda-integration.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ========================================
// Mock 依赖
// ========================================

vi.mock('../../llm/service', () => ({
  getLLMService: vi.fn(() => ({
    generate: vi.fn().mockResolvedValue({ text: 'Mocked response' }),
    chat: vi.fn().mockResolvedValue({ text: 'Mocked response' }),
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
          yield { type: 'content', content: 'Test response content' };
        })
      })),
      release: vi.fn()
    })
  }))
}));

vi.mock('../../tool/registry', () => ({
  getToolRegistry: vi.fn(() => ({
    get: vi.fn((name: string) => {
      if (name === 'get_time') {
        return {
          execute: vi.fn().mockResolvedValue({
            time: '12:00:00',
            date: '2026/03/19',
            weekday: '星期四',
            timezone: 'Asia/Shanghai'
          })
        };
      }
      if (name === 'get_weather') {
        return {
          execute: vi.fn().mockResolvedValue({
            location: '北京',
            weather: '晴',
            temp: '20',
            tempHigh: '25',
            tempLow: '15',
            wind: '东南风2级',
            aqi: '良'
          })
        };
      }
      return null;
    })
  }))
}));

// ========================================
// 测试: 意图注册表
// ========================================

describe('【集成测试】意图注册表', () => {
  it('应该正确注册和识别所有内置意图', async () => {
    const { getIntentRegistry } = await import('../intent-registry');
    const registry = getIntentRegistry();

    const testCases = [
      { input: '今天天气怎么样', expected: 'realtime_weather' },
      { input: '现在几点了', expected: 'realtime_time' },
      { input: '你好', expected: 'greeting' },
      { input: '再见', expected: 'farewell' },
      { input: '帮我写个排序算法', expected: 'code' },
      { input: '读取config.json', expected: 'file_read' },
    ];

    for (const { input, expected } of testCases) {
      const result = registry.recognize(input);
      expect(result.intentType).toBe(expected);
    }
  });

  it('应该支持动态注册新意图', async () => {
    const { getIntentRegistry, IntentRegistry } = await import('../intent-registry');
    const registry = new IntentRegistry();

    registry.register({
      intentType: 'custom_intent',
      confidence: 0.9,
      immediateResponse: 'Custom response',
      needsDetailedProcessing: true,
      match: (input) => input.includes('custom_keyword')
    });

    const result = registry.recognize('this has custom_keyword in it');
    expect(result.intentType).toBe('custom_intent');
  });
});

// ========================================
// 测试: 工具执行器注册表
// ========================================

describe('【集成测试】工具执行器注册表', () => {
  it('应该正确提取时间工具参数', async () => {
    const { getToolExecutorRegistry } = await import('../tool-executor-registry');
    const registry = getToolExecutorRegistry();

    const executor = registry.getExecutor('realtime_time');
    expect(executor).not.toBeNull();
    expect(executor?.toolName).toBe('get_time');

    const params = executor?.extractParams('现在几点了', {
      workingDirectory: '.',
      sessionId: 'test',
      maxExecutionTime: 30000,
      resources: { memory: 0, cpu: 0 }
    });

    expect(params).toEqual({});
  });

  it('应该正确提取天气工具参数', async () => {
    const { getToolExecutorRegistry } = await import('../tool-executor-registry');
    const registry = getToolExecutorRegistry();

    const executor = registry.getExecutor('realtime_weather');
    expect(executor).not.toBeNull();
    expect(executor?.toolName).toBe('get_weather');

    const params = executor?.extractParams('今天北京天气怎么样', {
      workingDirectory: '.',
      sessionId: 'test',
      maxExecutionTime: 30000,
      resources: { memory: 0, cpu: 0 }
    });

    expect(params?.location).toBe('北京');
  });

  it('应该正确格式化工具结果', async () => {
    const { getToolExecutorRegistry } = await import('../tool-executor-registry');
    const registry = getToolExecutorRegistry();

    const executor = registry.getExecutor('realtime_time');
    const formatted = executor?.formatResult({
      time: '12:00:00',
      date: '2026/03/19',
      weekday: '星期四',
      timezone: 'Asia/Shanghai'
    });

    expect(formatted).toContain('12:00:00');
    expect(formatted).toContain('2026/03/19');
    expect(formatted).toContain('星期四');
  });
});

// ========================================
// 测试: Prompt模板注册表
// ========================================

describe('【集成测试】Prompt模板注册表', () => {
  it('应该正确构建消息', async () => {
    const { getPromptRegistry } = await import('../prompt-registry');
    const registry = getPromptRegistry();

    const result = registry.buildPrompt('greeting', {
      input: '你好',
      history: [],
    });

    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.maxTokens).toBe(100);
  });

  it('应该包含正确的系统提示', async () => {
    const { getPromptRegistry } = await import('../prompt-registry');
    const registry = getPromptRegistry();

    const result = registry.buildPrompt('greeting', {
      input: '你好',
      history: [],
    });

    const systemMessage = result.messages.find(m => m.role === 'system');
    expect(systemMessage).toBeDefined();
    expect(systemMessage?.content).toContain('AI助手');
  });

  it('应该支持模板注册和获取', async () => {
    const { getPromptRegistry, PromptTemplateRegistry } = await import('../prompt-registry');
    const registry = new PromptTemplateRegistry();

    registry.register({
      name: 'test_template',
      systemPrompt: 'Test system prompt',
      userPromptTemplate: 'Test user: {input}',
      maxTokens: 100
    });

    expect(registry.has('test_template')).toBe(true);
    expect(registry.get('test_template')?.systemPrompt).toBe('Test system prompt');
  });
});

// ========================================
// 测试: 性能监控
// ========================================

describe('【集成测试】性能监控', () => {
  it('应该记录和统计性能指标', async () => {
    const { getPerformanceMonitor, resetPerformanceMonitor } = await import('../performance-monitor');
    resetPerformanceMonitor();

    const monitor = getPerformanceMonitor();

    monitor.startTimer('intentRecognitionTime');
    monitor.endTimer('intentRecognitionTime');
    monitor.setIntentType('test_intent');
    monitor.setOptimization('direct');
    monitor.setUsedTools(false);
    monitor.setOutputLength(100);
    monitor.finalize();

    const summary = monitor.getMetricsSummary();
    expect(summary.totalRequests).toBe(1);
    expect(summary.avgResponseTime).toBeGreaterThanOrEqual(0);
  });

  it('应该计算P95和P99延迟', async () => {
    const { getPerformanceMonitor, resetPerformanceMonitor } = await import('../performance-monitor');
    resetPerformanceMonitor();

    const monitor = getPerformanceMonitor();

    for (let i = 0; i < 20; i++) {
      monitor.startTimer('intentRecognitionTime');
      monitor.endTimer('intentRecognitionTime');
      monitor.setIntentType('test');
      monitor.setOutputLength(i * 10);
      monitor.finalize();
    }

    const summary = monitor.getMetricsSummary();
    expect(summary.p95ResponseTime).toBeGreaterThanOrEqual(0);
    expect(summary.p99ResponseTime).toBeGreaterThanOrEqual(summary.p95ResponseTime);
  });

  it('应该追踪系统健康状态', async () => {
    const { getPerformanceMonitor, resetPerformanceMonitor } = await import('../performance-monitor');
    resetPerformanceMonitor();

    const monitor = getPerformanceMonitor();
    const health = monitor.getSystemHealth();

    expect(health).toHaveProperty('uptime');
    expect(health).toHaveProperty('totalRequests');
    expect(health).toHaveProperty('avgResponseTime');
    expect(health).toHaveProperty('errorRate');
  });
});

// ========================================
// 测试: 意图追踪
// ========================================

describe('【集成测试】意图追踪', () => {
  it('应该记录意图识别结果', async () => {
    const { getIntentTracker, resetIntentTracker } = await import('../intent-tracker');
    resetIntentTracker();

    const tracker = getIntentTracker();

    const id1 = tracker.recordRecognition('今天天气怎么样', {
      intentType: 'realtime_weather',
      confidence: 0.9,
      immediateResponse: '查询天气...',
      needsDetailedProcessing: true
    });

    const id2 = tracker.recordRecognition('现在几点了', {
      intentType: 'realtime_time',
      confidence: 0.95,
      immediateResponse: '查询时间...',
      needsDetailedProcessing: true
    });

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();

    const stats = tracker.getStats();
    expect(stats.length).toBeGreaterThan(0);
  });

  it('应该计算识别准确率', async () => {
    const { getIntentTracker, resetIntentTracker } = await import('../intent-tracker');
    resetIntentTracker();

    const tracker = getIntentTracker();

    tracker.recordRecognition('天气', { intentType: 'realtime_weather', confidence: 0.9, immediateResponse: '', needsDetailedProcessing: true });
    tracker.recordRecognition('时间', { intentType: 'realtime_time', confidence: 0.9, immediateResponse: '', needsDetailedProcessing: true });
    tracker.recordRecognition('测试', { intentType: 'general', confidence: 0.5, immediateResponse: '', needsDetailedProcessing: true });

    const accuracy = tracker.getAccuracy();
    expect(accuracy).toBeGreaterThanOrEqual(0);
    expect(accuracy).toBeLessThanOrEqual(1);
  });

  it('应该记录纠正并更新混淆矩阵', async () => {
    const { getIntentTracker, resetIntentTracker } = await import('../intent-tracker');
    resetIntentTracker();

    const tracker = getIntentTracker();

    const id = tracker.recordRecognition('苹果', {
      intentType: 'realtime_time',
      confidence: 0.5,
      immediateResponse: '',
      needsDetailedProcessing: true
    });

    tracker.recordCorrection(id, 'realtime_stock', '错误识别为时间');

    const confusion = tracker.getMostConfusedIntents();
    expect(confusion.length).toBeGreaterThan(0);
    expect(confusion[0].from).toBe('realtime_time');
    expect(confusion[0].to).toBe('realtime_stock');
  });
});

// ========================================
// 测试: A/B测试框架
// ========================================

describe('【集成测试】A/B测试框架', () => {
  it('应该创建和运行A/B测试', async () => {
    const { getABTestingFramework, resetABTestingFramework } = await import('../ab-testing');
    resetABTestingFramework();

    const framework = getABTestingFramework();

    const testId = framework.createTest('test_experiment', [
      { name: 'control', config: { prompt: 'v1' }, weight: 50 },
      { name: 'variant', config: { prompt: 'v2' }, weight: 50 },
    ]);

    expect(testId).toBeTruthy();

    const variant = framework.getVariant(testId, { userId: 'test_user' });
    expect(variant).not.toBeNull();
    expect(['control', 'variant']).toContain(variant?.name);
  });

  it('应该记录和统计测试结果', async () => {
    const { getABTestingFramework, resetABTestingFramework } = await import('../ab-testing');
    resetABTestingFramework();

    const framework = getABTestingFramework();

    const testId = framework.createTest('conversion_test', [
      { name: 'a', config: {}, weight: 50 },
      { name: 'b', config: {}, weight: 50 },
    ]);

    framework.recordImpression(testId, 'a');
    framework.recordImpression(testId, 'b');
    framework.recordSuccess(testId, 'a', 100, 0.8);
    framework.recordSuccess(testId, 'b', 150, 0.9);

    const stats = framework.getStats(testId);
    expect(stats).not.toBeNull();
    expect(stats?.results.length).toBe(2);
  });

  it('应该正确计算胜者', async () => {
    const { getABTestingFramework, resetABTestingFramework } = await import('../ab-testing');
    resetABTestingFramework();

    const framework = getABTestingFramework();

    const testId = framework.createTest('winner_test', [
      { name: 'loser', config: {}, weight: 50 },
      { name: 'winner', config: {}, weight: 50 },
    ]);

    for (let i = 0; i < 10; i++) {
      framework.recordImpression(testId, 'loser');
      framework.recordSuccess(testId, 'loser', 200, 0.3);
    }

    for (let i = 0; i < 10; i++) {
      framework.recordImpression(testId, 'winner');
      framework.recordSuccess(testId, 'winner', 100, 0.9);
    }

    const stats = framework.getStats(testId);
    expect(stats?.winner).toBe('winner');
  });
});

// ========================================
// 测试: 记忆集成
// ========================================

describe('【集成测试】记忆集成', () => {
  it('应该获取记忆整合器实例', async () => {
    const { getMemoryIntegrator } = await import('../memory-integrator');
    const integrator = getMemoryIntegrator();
    expect(integrator).not.toBeNull();
  });

  it('应该构建记忆提示', async () => {
    const { getMemoryIntegrator } = await import('../memory-integrator');
    const integrator = getMemoryIntegrator();

    const memories = [
      {
        id: '1',
        content: '用户喜欢中国菜',
        embedding: [],
        metadata: { type: 'preference', source: 'chat', tags: [], related: [] },
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        importance: 0.8
      }
    ];

    const prompt = integrator.buildMemoryPrompt(memories);
    expect(prompt).toContain('[相关记忆]');
    expect(prompt).toContain('用户喜欢中国菜');
  });

  it('应该处理空记忆列表', async () => {
    const { getMemoryIntegrator } = await import('../memory-integrator');
    const integrator = getMemoryIntegrator();

    const prompt = integrator.buildMemoryPrompt([]);
    expect(prompt).toBe('');
  });

  it('应该提取用户事实', async () => {
    const { getMemoryIntegrator } = await import('../memory-integrator');
    const integrator = getMemoryIntegrator();

    integrator.extractAndStoreFacts('我的名字是张三', '好的，张三。', 'session-123');
  });
});

// ========================================
// 测试: 系统初始化
// ========================================

describe('【集成测试】系统初始化', () => {
  it('应该检查系统初始化状态', async () => {
    const { isSystemInitialized, getSystemStatus } = await import('../system-initializer');

    const initialized = isSystemInitialized();
    const status = getSystemStatus();

    expect(typeof initialized).toBe('boolean');
    expect(status).toHaveProperty('initialized');
    expect(status).toHaveProperty('hasLongTermMemory');
    expect(status).toHaveProperty('hasSessionMemory');
  });
});

// ========================================
// 测试: 端到端流程
// ========================================

describe('【端到端】OODA完整流程', () => {
  it('意图识别 → 工具调用 → 格式化输出的完整流程', async () => {
    const { getIntentRegistry } = await import('../intent-registry');
    const { getToolExecutorRegistry } = await import('../tool-executor-registry');
    const { getPromptRegistry } = await import('../prompt-registry');

    const intentRegistry = getIntentRegistry();
    const toolRegistry = getToolExecutorRegistry();
    const promptRegistry = getPromptRegistry();

    const input = '今天天气怎么样';

    const intent = intentRegistry.recognize(input);
    expect(intent.intentType).toBe('realtime_weather');

    const executor = toolRegistry.getExecutor(intent.intentType);
    expect(executor).not.toBeNull();

    const context = {
      workingDirectory: '.',
      sessionId: 'test-session',
      maxExecutionTime: 30000,
      resources: { memory: 0, cpu: 0 }
    };

    const params = executor!.extractParams(input, context);
    expect(params.location).toBeTruthy();

    const promptResult = promptRegistry.buildPrompt('realtime_weather', {
      input,
      toolResult: { weather: '晴', tempHigh: '25', tempLow: '15' },
      formattedToolResult: '北京今天晴，气温15°C~25°C'
    });

    expect(promptResult.messages.length).toBeGreaterThan(0);
    expect(promptResult.maxTokens).toBeGreaterThan(0);
  });

  it('时间查询的完整流程', async () => {
    const { getIntentRegistry } = await import('../intent-registry');
    const { getToolExecutorRegistry } = await import('../tool-executor-registry');

    const intentRegistry = getIntentRegistry();
    const toolRegistry = getToolExecutorRegistry();

    const input = '现在几点了';

    const intent = intentRegistry.recognize(input);
    expect(intent.intentType).toBe('realtime_time');

    const executor = toolRegistry.getExecutor('realtime_time');
    expect(executor).not.toBeNull();

    const formatted = executor!.formatResult({
      time: '14:30:00',
      date: '2026/03/19',
      weekday: '星期四',
      timezone: 'Asia/Shanghai'
    });

    expect(formatted).toContain('14:30:00');
  });

  it('代码生成的完整流程', async () => {
    const { getIntentRegistry } = await import('../intent-registry');
    const { getPromptRegistry } = await import('../prompt-registry');

    const intentRegistry = getIntentRegistry();
    const promptRegistry = getPromptRegistry();

    const input = '帮我写一个快速排序算法';

    const intent = intentRegistry.recognize(input);
    expect(intent.intentType).toBe('code');

    const result = promptRegistry.buildPrompt('code', { input, history: [] });
    expect(result.maxTokens).toBe(2000);

    const systemPrompt = result.messages.find(m => m.role === 'system');
    expect(systemPrompt?.content).toContain('编程助手');
  });
});
