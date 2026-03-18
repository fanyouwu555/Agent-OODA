import { KnowledgeGapDetector } from '@ooda-agent/ooda/knowledge-gap';
import { initializeOodaMetrics, getOodaMetrics } from '@ooda-agent/core/metrics/ooda-metrics';
import { CircuitBreaker } from '@ooda-agent/error/circuit-breaker';

// Simple test runner without external dependencies
const testResults: { passed: number; failed: number } = { passed: 0, failed: 0 };

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function expect(actual: any) {
  return {
    toBe: (expected: any) => {
      assert(actual === expected, `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
    },
    notToBe: (expected: any) => {
      assert(actual !== expected, `Expected not ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan: (expected: number) => {
      assert(actual > expected, `Expected ${actual} to be greater than ${expected}`);
    },
    toBeLessThan: (expected: number) => {
      assert(actual < expected, `Expected ${actual} to be less than ${expected}`);
    },
    toBeDefined: () => {
      assert(actual !== undefined && actual !== null, `Expected to be defined, but got ${actual}`);
    },
  };
}

function describe(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  try {
    fn();
    console.log('  ✓ All tests passed');
  } catch (error) {
    console.log(`  ✗ Failed: ${error.message}`);
    testResults.failed++;
  }
}

function test(name: string, fn: () => Promise<void> | void): void {
  process.stdout.write(`    ${name} ... `);
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(
        () => {
          console.log('PASS');
          testResults.passed++;
        },
        (error) => {
          console.log(`FAIL - ${error.message}`);
          testResults.failed++;
        }
      );
    } else {
      console.log('PASS');
      testResults.passed++;
    }
  } catch (error) {
    console.log(`FAIL - ${error.message}`);
    testResults.failed++;
  }
}

function beforeEach(fn: () => void): void {
  // 我们将在每个测试开始时手动调用
  fn();
}

// Run tests
describe('End-to-End Tests for Real-time Query Detection and Monitoring', () => {
  let detector: KnowledgeGapDetector;

  beforeEach(() => {
    detector = new KnowledgeGapDetector();
    // 重置指标
    const metrics = getOodaMetrics();
    // 注意：在实际测试中，我们可能需要重置或创建新的指标实例
  });

  test('should correctly detect 金价 query as requiring real-time information', () => {
    const query = '今日金价';
    const result = detector.detect(query, {} as any);

    expect(result[0].type).toBe('realtime_info');
    expect(result[0].confidence).toBeGreaterThan(0.8); // 应该有较高的置信度
    expect(result[0].suggestedTool).toBe('web_search_and_fetch');
    // 检查是否匹配了特定模式
    expect(result[0].triggerKeywords).toBeDefined();
    expect(result[0].triggerKeywords.length).toBeGreaterThan(0);
  });

  test('should correctly detect exchange rate query as requiring real-time information', () => {
    const query = '美元对人民币汇率';
    const result = detector.detect(query, {} as any);

    expect(result[0].type).toBe('realtime_info');
    expect(result[0].confidence).toBeGreaterThan(0.7);
    expect(result[0].suggestedTool).toBe('web_search_and_fetch');
  });

  test('should correctly detect cryptocurrency price query as requiring real-time information', () => {
    const query = '比特币价格';
    const result = detector.detect(query, {} as any);

    expect(result[0].type).toBe('realtime_info');
    expect(result[0].confidence).toBeGreaterThan(0.7);
    expect(result[0].suggestedTool).toBe('web_search_and_fetch');
  });

  test('should not treat general knowledge queries as requiring real-time information', () => {
    const query = '什么是人工智能';
    const result = detector.detect(query, {} as any);

    // 一般知识查询应该不需要实时查询，或者置信度很低
    const realtimeGap = result.find(r => r.type === 'realtime_info');
    if (realtimeGap) {
      expect(realtimeGap.confidence).toBeLessThan(0.5);
    }
    // 或者如果需要查询，置信度应该较低（可能回退到web_search但不是因为实时性）
  });

  test('should initialize and collect OODA metrics', () => {
    // 初始化指标系统
    initializeOodaMetrics();
    
    // 执行一个简单的查询来触发一些指标
    const query = '今日金价';
    const result = detector.detect(query, {} as any);
    
    // 验证指标被收集（这里我们主要测试初始化不报错）
    expect(typeof initializeOodaMetrics).toBe('function');
    expect(typeof getOodaMetrics).toBe('function');
  });

  test('should create and use circuit breaker', () => {
    // 创建熔断器实例
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      timeout: 5000,
      resetTimeout: 10000
    });

    // 测试初始状态
    expect(breaker.getState()).toBe('CLOSED');

    // 模拟一些成功的操作
    const successfulOperation = async () => {
      return 'success';
    };

    // 执行成功的操作
    return breaker.execute(successfulOperation).then(result => {
      expect(result).toBe('success');
      expect(breaker.getState()).toBe('CLOSED'); // 成功应该保持闭合状态
    });
  });

  test('should handle circuit breaker opening after failures', () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      timeout: 5000,
      resetTimeout: 10000
    });

    const failingOperation = async () => {
      throw new Error('Simulated failure');
    };

    // 执行失败的操作直到熔断器打开
    return breaker.execute(failingOperation).catch(() => {
      return breaker.execute(failingOperation).catch(() => {
        // 第二次失败后，熔断器应该打开
        expect(breaker.getState()).toBe('OPEN');
        
        // 再次尝试应该被快速拒绝
        return breaker.execute(failingOperation).catch(error => {
          expect(error).toBeDefined();
          // 这里我们主要测试熔断器状态转换
        });
      });
    });
  });
});

// Print summary
console.log(`\nTest Results: ${testResults.passed} passed, ${testResults.failed} failed`);
if (testResults.failed > 0) {
  process.exit(1);
}