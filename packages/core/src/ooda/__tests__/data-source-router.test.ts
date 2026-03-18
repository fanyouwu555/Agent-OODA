// packages/core/src/ooda/__tests__/data-source-router.test.ts
// 功能测试: 数据源管理和动态工具路由

import { DataType, DataSourceType, DataSourceManager, getDataSourceManager, initializeDataSourceManager } from '../data-source';
import { DynamicToolRouter, getDynamicToolRouter } from '../dynamic-tool-router';
import { ErrorClassifier, getErrorClassifier, ErrorCategory } from '../error-classifier';
import { ErrorStrategyMapper, getErrorStrategyMapper, RecoveryActionType } from '../error-strategy-mapper';

// 模拟 DatabaseManager
class MockDatabaseManager {
  private data: Map<string, any[]> = new Map();
  
  run(sql: string, params: any[]): { changes: number } {
    // 模拟插入
    return { changes: 1 };
  }
  
  get(sql: string, params: any[]): any {
    return null;
  }
  
  all(sql: string, params: any[]): any[] {
    return [];
  }
}

// 测试结果
const testResults: { passed: number; failed: number; errors: string[] } = { 
  passed: 0, 
  failed: 0, 
  errors: [] 
};

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    testResults.passed++;
  } catch (error) {
    console.log(`  ✗ ${name}: ${error.message}`);
    testResults.failed++;
    testResults.errors.push(`${name}: ${error.message}`);
  }
}

function expect(actual: any) {
  return {
    toBe: (expected: any) => {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy: () => {
      if (!actual) {
        throw new Error(`Expected truthy, but got ${JSON.stringify(actual)}`);
      }
    },
    toBeFalsy: () => {
      if (actual) {
        throw new Error(`Expected falsy, but got ${JSON.stringify(actual)}`);
      }
    },
    toContain: (substring: string) => {
      if (!actual.includes(substring)) {
        throw new Error(`Expected "${actual}" to contain "${substring}"`);
      }
    },
    notToBe: (expected: any) => {
      if (actual === expected) {
        throw new Error(`Expected not ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan: (expected: number) => {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
  };
}

async function runTests() {
  console.log('\n=== OODA 数据源和路由功能测试 ===\n');

  // 初始化
  const mockDb = new MockDatabaseManager();
  initializeDataSourceManager(mockDb as any);
  
  const dataSourceManager = getDataSourceManager();
  const router = getDynamicToolRouter();
  const classifier = getErrorClassifier();
  const strategyMapper = getErrorStrategyMapper();

  // 测试 1: DataSourceManager 初始化
  console.log('1. DataSourceManager 初始化测试');
  test('DataSourceManager 应该已初始化', () => {
    expect(dataSourceManager).toBeTruthy();
  });

  test('getBestSource 应该返回默认数据源', () => {
    const source = dataSourceManager.getBestSource(DataType.GOLD_PRICE);
    expect(source).toBeTruthy();
    expect(source?.type).toBe(DataType.GOLD_PRICE);
  });

  test('获取所有 GOLD_PRICE 数据源', () => {
    const sources = dataSourceManager.getSourcesByType(DataType.GOLD_PRICE);
    expect(sources.length).toBeGreaterThan(1);
  });

  // 测试 2: 策略记录
  console.log('\n2. 策略记录测试');
  test('记录策略结果', () => {
    dataSourceManager.recordStrategyResult({
      intent: '今日金价',
      dataType: DataType.GOLD_PRICE,
      toolName: 'web_search',
      args: JSON.stringify({ query: '今日金价' }),
      success: true,
      executionTime: 1500,
    });
    // 记录成功不抛错即可
    expect(true).toBe(true);
  });

  test('获取工具成功率 (默认)', () => {
    const rate = dataSourceManager.getToolSuccessRate('web_search');
    // 首次调用返回默认值 0.5
    expect(rate).toBe(0.5);
  });

  // 测试 3: ErrorClassifier
  console.log('\n3. 错误分类测试');
  test('分类 403 错误', () => {
    const error = new Error('HTTP 403 Forbidden');
    const result = classifier.classify(error);
    expect(result.category).toBe(ErrorCategory.ACCESS_DENIED_403);
  });

  test('分类 404 错误', () => {
    const error = new Error('HTTP 404 Not Found');
    const result = classifier.classify(error);
    expect(result.category).toBe(ErrorCategory.CONTENT_NOT_FOUND_404);
  });

  test('分类网络错误', () => {
    const error = new Error('ECONNREFUSED Connection refused');
    const result = classifier.classify(error);
    expect(result.category).toBe(ErrorCategory.NETWORK_CONNECTION_ERROR);
  });

  test('分类速率限制错误', () => {
    const error = new Error('Rate limit exceeded. Please wait.');
    const result = classifier.classify(error);
    expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
  });

  // 测试 4: ErrorStrategyMapper
  console.log('\n4. 错误策略映射测试');
  test('403 错误应建议切换数据源', () => {
    const recovery = strategyMapper.generateNextAction(
      ErrorCategory.ACCESS_DENIED_403,
      0,
      []
    );
    expect(recovery).toBeTruthy();
    expect(recovery?.type).toBe(RecoveryActionType.SWITCH_DATA_SOURCE);
  });

  test('网络错误应建议重试', () => {
    const recovery = strategyMapper.generateNextAction(
      ErrorCategory.NETWORK_CONNECTION_ERROR,
      0,
      []
    );
    expect(recovery).toBeTruthy();
    expect(recovery?.type).toBe(RecoveryActionType.RETRY_WITH_BACKOFF);
  });

  test('速率限制应建议退避重试', () => {
    const recovery = strategyMapper.generateNextAction(
      ErrorCategory.RATE_LIMIT,
      0,
      []
    );
    expect(recovery).toBeTruthy();
    expect(recovery?.type).toBe(RecoveryActionType.RETRY_WITH_BACKOFF);
  });

  // 测试 5: DynamicToolRouter
  console.log('\n5. 动态工具路由测试');
  test('生成 403 错误的替代工具', () => {
    const error = new Error('HTTP 403 Forbidden');
    const alternative = router.generateAlternativeTool(
      'web_search',
      error,
      {
        sessionId: 'test-session',
        userInput: '今日金价',
        availableTools: ['web_search', 'web_fetch'],
        retryCount: 0,
        previousErrors: [],
        previousActions: [],
      },
      0
    );
    
    expect(alternative).toBeTruthy();
    expect(alternative?.toolName).notToBe('web_search');
  });

  test('生成网络错误的替代工具', () => {
    const error = new Error('ECONNREFUSED');
    const alternative = router.generateAlternativeTool(
      'web_search',
      error,
      {
        sessionId: 'test-session',
        userInput: '今日天气',
        availableTools: ['web_search', 'api_call'],
        retryCount: 1,
        previousErrors: [],
        previousActions: [],
      },
      1
    );
    
    expect(alternative).toBeTruthy();
  });

  // 测试 6: 策略学习统计
  console.log('\n6. 策略学习统计测试');
  test('获取学习统计', () => {
    const stats = dataSourceManager.getLearningStats();
    expect(stats).toBeTruthy();
    expect(Array.isArray(stats)).toBeTruthy();
  });

  // 输出结果
  console.log('\n=== 测试结果 ===');
  console.log(`通过: ${testResults.passed}`);
  console.log(`失败: ${testResults.failed}`);
  
  if (testResults.errors.length > 0) {
    console.log('\n失败详情:');
    testResults.errors.forEach(e => console.log(`  - ${e}`));
  }

  return testResults.failed === 0;
}

// 运行测试
runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
