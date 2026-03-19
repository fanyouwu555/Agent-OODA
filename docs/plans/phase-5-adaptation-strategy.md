# Phase 5: 适应策略实现

> 所属项目：OODA Agent 系统重构
> 阶段序号：5/5
> 设计文档：docs/plans/2026-03-20-ooda-system-refactoring-design.md

---

## 1. 任务概述

### 1.1 目标
实现基于性能指标的自动适应策略调整机制，使 OODA 循环能够根据执行效果自动优化行为。

### 1.2 当前问题
- `adaptationStrategies` 仅记录日志
- 无实际策略调整机制
- 无法根据反馈优化

### 1.3 验收标准
- [ ] 定义 `AdaptationStrategy` 接口
- [ ] 实现 `AdaptationEngine`
- [ ] 支持缓存/重试/工具选择/模型策略
- [ ] 集成到 OODA Loop
- [ ] 策略效果评估机制

---

## 2. 文件清单

### 2.1 新增文件

| 文件路径 | 描述 | 优先级 |
|----------|------|--------|
| `packages/core/src/ooda/adaptation/types.ts` | 适应策略类型定义 | 🔴 高 |
| `packages/core/src/ooda/adaptation/engine.ts` | 适应引擎 | 🔴 高 |
| `packages/core/src/ooda/adaptation/strategies.ts` | 内置策略实现 | 🔴 高 |
| `packages/core/src/ooda/adaptation/__tests__/engine.test.ts` | 测试 | 🟡 中 |

### 2.2 修改文件

| 文件路径 | 修改内容 | 优先级 |
|----------|----------|--------|
| `packages/core/src/ooda/loop.ts` | 集成适应引擎 | 🔴 高 |
| `packages/core/src/types/index.ts` | 添加适应相关类型 | 🟡 中 |

---

## 3. 详细实施步骤

### 3.1 Step 1: 定义适应策略类型

**文件**: `packages/core/src/ooda/adaptation/types.ts`

```typescript
// 策略类型
type AdaptationStrategyType = 'cache' | 'retry' | 'tool_selection' | 'model';

// 策略触发条件
type TriggerType = 'threshold' | 'pattern' | 'manual';

// 策略配置
interface AdaptationStrategy {
  id: string;
  name: string;
  type: AdaptationStrategyType;
  trigger: TriggerType;
  enabled: boolean;
  config: {
    // Cache 策略
    cacheTTL?: number;
    cacheMaxSize?: number;

    // Retry 策略
    maxRetries?: number;
    retryDelay?: number;
    retryBackoff?: 'linear' | 'exponential';

    // Tool Selection 策略
    preferredTools?: string[];
    fallbackTools?: string[];

    // Model 策略
    modelName?: string;
    temperature?: number;
  };
  threshold?: {
    metric: string;       // 'latency' | 'error_rate' | 'success_rate'
    operator: '>' | '<' | '>=' | '<=';
    value: number;
  };
}

// 适应结果
interface AdaptationResult {
  applied: boolean;
  strategy: AdaptationStrategy;
  effect: 'positive' | 'negative' | 'neutral';
  metrics: {
    before: PerformanceMetrics;
    after: PerformanceMetrics;
  };
  timestamp: number;
}

// 性能指标
interface PerformanceMetrics {
  latency: number;          // 平均响应时间 ms
  errorRate: number;         // 错误率 0-1
  successRate: number;      // 成功率 0-1
  cacheHitRate: number;     // 缓存命中率 0-1
  retryCount: number;       // 平均重试次数
  toolUsage: Record<string, number>;  // 工具使用统计
}
```

### 3.2 Step 2: 实现适应引擎

**文件**: `packages/core/src/ooda/adaptation/engine.ts`

```typescript
export class AdaptationEngine {
  private strategies: Map<string, AdaptationStrategy> = new Map();
  private history: AdaptationResult[] = [];
  private metricsWindow: PerformanceMetrics[] = [];
  private maxHistorySize = 100;

  constructor(initialStrategies?: AdaptationStrategy[]) {
    if (initialStrategies) {
      for (const strategy of initialStrategies) {
        this.strategies.set(strategy.id, strategy);
      }
    }
  }

  async analyzeAndAdapt(
    currentMetrics: PerformanceMetrics
  ): Promise<AdaptationResult | null> {
    // 添加到历史窗口
    this.metricsWindow.push(currentMetrics);
    if (this.metricsWindow.length > 10) {
      this.metricsWindow.shift();
    }

    // 检查每个策略的触发条件
    for (const [id, strategy] of this.strategies) {
      if (!strategy.enabled) continue;

      if (this.shouldTrigger(strategy)) {
        return this.applyStrategy(strategy);
      }
    }

    return null;
  }

  private shouldTrigger(strategy: AdaptationStrategy): boolean {
    switch (strategy.trigger) {
      case 'threshold':
        return this.checkThreshold(strategy);
      case 'pattern':
        return this.checkPattern(strategy);
      case 'manual':
        return false; // 手动触发需要显式调用
      default:
        return false;
    }
  }

  private checkThreshold(strategy: AdaptationStrategy): boolean {
    if (!strategy.threshold || !strategy.threshold) return false;

    const currentMetrics = this.getAggregatedMetrics();
    const metricValue = currentMetrics[
      strategy.threshold.metric as keyof PerformanceMetrics
    ] as number;

    const { operator, value } = strategy.threshold;

    switch (operator) {
      case '>': return metricValue > value;
      case '<': return metricValue < value;
      case '>=': return metricValue >= value;
      case '<=': return metricValue <= value;
      default: return false;
    }
  }

  private checkPattern(strategy: AdaptationStrategy): boolean {
    // 模式检测逻辑
    // 例如：连续 3 次延迟增加
    const window = this.metricsWindow.slice(-3);
    if (window.length < 3) return false;

    let increasing = true;
    for (let i = 1; i < window.length; i++) {
      if (window[i].latency <= window[i - 1].latency) {
        increasing = false;
        break;
      }
    }
    return increasing;
  }

  private async applyStrategy(
    strategy: AdaptationStrategy
  ): Promise<AdaptationResult> {
    const beforeMetrics = this.getAggregatedMetrics();

    // 应用策略（这里只是记录，实际应用由调用者处理）
    const result: AdaptationResult = {
      applied: true,
      strategy,
      effect: 'neutral',
      metrics: { before: beforeMetrics, after: beforeMetrics },
      timestamp: Date.now(),
    };

    this.history.push(result);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    return result;
  }

  private getAggregatedMetrics(): PerformanceMetrics {
    if (this.metricsWindow.length === 0) {
      return {
        latency: 0,
        errorRate: 0,
        successRate: 1,
        cacheHitRate: 0,
        retryCount: 0,
        toolUsage: {},
      };
    }

    const sum = this.metricsWindow.reduce(
      (acc, m) => ({
        latency: acc.latency + m.latency,
        errorRate: acc.errorRate + m.errorRate,
        successRate: acc.successRate + m.successRate,
        cacheHitRate: acc.cacheHitRate + m.cacheHitRate,
        retryCount: acc.retryCount + m.retryCount,
        toolUsage: { ...acc.toolUsage, ...m.toolUsage },
      }),
      {
        latency: 0,
        errorRate: 0,
        successRate: 0,
        cacheHitRate: 0,
        retryCount: 0,
        toolUsage: {},
      }
    );

    const count = this.metricsWindow.length;
    return {
      latency: sum.latency / count,
      errorRate: sum.errorRate / count,
      successRate: sum.successRate / count,
      cacheHitRate: sum.cacheHitRate / count,
      retryCount: sum.retryCount / count,
      toolUsage: sum.toolUsage,
    };
  }

  // 评估策略效果
  evaluateResult(result: AdaptationResult): void {
    // 在下一次迭代后调用，对比应用前后的指标
    const index = this.history.findIndex(
      (h) => h.timestamp === result.timestamp
    );
    if (index >= 0) {
      const recent = this.metricsWindow.slice(-5);
      const avgLatency = recent.reduce((s, m) => s + m.latency, 0) / recent.length;

      if (avgLatency < result.metrics.before.latency * 0.9) {
        result.effect = 'positive';
      } else if (avgLatency > result.metrics.before.latency * 1.1) {
        result.effect = 'negative';
      }
    }
  }

  // 策略管理
  registerStrategy(strategy: AdaptationStrategy): void;
  unregisterStrategy(id: string): void;
  enableStrategy(id: string): void;
  disableStrategy(id: string): void;
  getStrategies(): AdaptationStrategy[];
  getRecommendedStrategy(intent: string): AdaptationStrategy | null;
}
```

### 3.3 Step 3: 定义内置策略

**文件**: `packages/core/src/ooda/adaptation/strategies.ts`

```typescript
export const DEFAULT_ADAPTATION_STRATEGIES: AdaptationStrategy[] = [
  {
    id: 'cache-when-slow',
    name: 'Cache When Slow',
    type: 'cache',
    trigger: 'threshold',
    enabled: true,
    threshold: {
      metric: 'latency',
      operator: '>',
      value: 2000, // 2 秒
    },
    config: {
      cacheTTL: 120000,
      cacheMaxSize: 150,
    },
  },
  {
    id: 'increase-retry-on-error',
    name: 'Increase Retry On Error',
    type: 'retry',
    trigger: 'threshold',
    enabled: true,
    threshold: {
      metric: 'error_rate',
      operator: '>',
      value: 0.1, // 10% 错误率
    },
    config: {
      maxRetries: 5,
      retryDelay: 1000,
      retryBackoff: 'exponential',
    },
  },
  {
    id: 'prefer-fast-tools',
    name: 'Prefer Fast Tools',
    type: 'tool_selection',
    trigger: 'pattern',
    enabled: false, // 默认禁用
    config: {
      preferredTools: ['read_file', 'grep'],
      fallbackTools: ['search_code', 'search_web'],
    },
  },
];

export function getDefaultAdaptationStrategies(): AdaptationStrategy[] {
  return JSON.parse(JSON.stringify(DEFAULT_ADAPTATION_STRATEGIES));
}
```

### 3.4 Step 4: 集成到 OODA Loop

**文件**: `packages/core/src/ooda/loop.ts`

```typescript
import { AdaptationEngine } from './adaptation/engine';
import { getDefaultAdaptationStrategies } from './adaptation/strategies';

export class OODALoop {
  private adaptationEngine: AdaptationEngine;
  private adaptationEnabled = true;

  constructor(config: OODAConfig) {
    // ... 现有初始化

    // 初始化适应引擎
    this.adaptationEngine = new AdaptationEngine(
      getDefaultAdaptationStrategies()
    );
  }

  // 在循环结束后评估是否需要调整
  private async evaluateAndAdapt(state: AgentState): Promise<void> {
    if (!this.adaptationEnabled) return;

    const metrics = this.computeMetrics(state);
    const result = await this.adaptationEngine.analyzeAndAdapt(metrics);

    if (result && result.applied) {
      await this.applyStrategy(result.strategy);
      console.log(`[Adaptation] Applied strategy: ${result.strategy.name}`);
    }
  }

  private computeMetrics(state: AgentState): PerformanceMetrics {
    // 计算当前性能指标
    const iterations = state.iteration || 1;
    const totalTime = state.totalTime || 0;

    return {
      latency: totalTime / iterations,
      errorRate: state.errorCount / iterations,
      successRate: (iterations - state.errorCount) / iterations,
      cacheHitRate: this.calculateCacheHitRate(),
      retryCount: state.retryCount / iterations,
      toolUsage: state.toolUsage || {},
    };
  }

  private async applyStrategy(strategy: AdaptationStrategy): Promise<void> {
    switch (strategy.type) {
      case 'cache':
        this.adjustCacheStrategy(strategy.config);
        break;
      case 'retry':
        this.adjustRetryPolicy(strategy.config);
        break;
      case 'tool_selection':
        this.adjustToolSelection(strategy.config);
        break;
      case 'model':
        this.adjustModel(strategy.config);
        break;
    }
  }

  private adjustCacheStrategy(config: {
    cacheTTL?: number;
    cacheMaxSize?: number;
  }): void {
    if (config.cacheTTL) {
      this.config.cacheTTL = config.cacheTTL;
    }
    if (config.cacheMaxSize) {
      this.config.cacheMaxSize = config.cacheMaxSize;
    }
    console.log(`[Adaptation] Cache adjusted: TTL=${this.config.cacheTTL}, MaxSize=${this.config.cacheMaxSize}`);
  }

  private adjustRetryPolicy(config: {
    maxRetries?: number;
    retryDelay?: number;
  }): void {
    if (config.maxRetries) {
      this.config.maxRetries = config.maxRetries;
    }
    if (config.retryDelay) {
      this.config.retryDelay = config.retryDelay;
    }
  }

  // ... 其他 adjust 方法
}
```

---

## 4. 测试计划

### 4.1 单元测试

```typescript
describe('AdaptationEngine', () => {
  describe('Threshold trigger', () => {
    it('should trigger when latency exceeds threshold');
    it('should not trigger when latency below threshold');
  });

  describe('Pattern trigger', () => {
    it('should detect increasing latency pattern');
  });

  describe('Strategy application', () => {
    it('should apply cache strategy');
    it('should apply retry strategy');
  });

  describe('Metrics aggregation', () => {
    it('should aggregate multiple metrics correctly');
  });
});
```

### 4.2 集成测试

```bash
# 测试完整的适应流程
npm test -- --testPathPattern="ooda.test.ts"
```

---

## 5. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 策略误判 | 中 | 中 | 添加人工审核 |
| 震荡调整 | 中 | 中 | 添加冷却期 |
| 指标采集不准确 | 低 | 高 | 多次采样 |

---

## 6. 时间估算

| 步骤 | 预估时间 |
|------|----------|
| Step 1: 类型定义 | 1h |
| Step 2: 引擎实现 | 3h |
| Step 3: 内置策略 | 1h |
| Step 4: 集成到 OODA Loop | 2h |
| 测试与修复 | 2h |
| **总计** | **9h** |

---

## 7. 依赖项

- Phase 1 的 LRUCache（影响缓存策略）
- Phase 2 的结果验证（影响效果评估）
- 现有 PerformanceMetrics

---

## 8. 重构完成后的系统

Phase 5 完成后，所有 5 个阶段的重构工作将完成：
- ✅ LRU 缓存
- ✅ 可配置验证
- ✅ 配置持久化
- ✅ 记忆过期
- ✅ 适应策略

---

*阶段负责人：待定*
*创建日期：2026-03-20*
