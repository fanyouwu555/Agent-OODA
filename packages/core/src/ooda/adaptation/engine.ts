import {
  AdaptationStrategy,
  AdaptationResult,
  PerformanceMetrics,
  AdaptationRuleOptions,
} from './types';

export class AdaptationEngine {
  private strategies: Map<string, AdaptationStrategy> = new Map();
  private history: AdaptationResult[] = [];
  private metricsWindow: PerformanceMetrics[] = [];
  private maxHistorySize = 100;
  private maxMetricsWindow = 20;
  private cooldownPeriod = 60000;
  private lastAdaptationTime = 0;

  constructor(initialStrategies?: AdaptationRuleOptions[]) {
    if (initialStrategies) {
      for (const strategy of initialStrategies) {
        this.registerStrategy(strategy);
      }
    }
  }

  async analyzeAndAdapt(
    currentMetrics: PerformanceMetrics
  ): Promise<AdaptationResult | null> {
    this.addToMetricsWindow(currentMetrics);

    if (this.isInCooldown()) {
      return null;
    }

    for (const [id, strategy] of this.strategies) {
      if (!strategy.enabled) continue;

      if (this.shouldTrigger(strategy)) {
        const result = await this.applyStrategy(strategy, currentMetrics);
        this.lastAdaptationTime = Date.now();
        return result;
      }
    }

    return null;
  }

  private isInCooldown(): boolean {
    return Date.now() - this.lastAdaptationTime < this.cooldownPeriod;
  }

  private shouldTrigger(strategy: AdaptationStrategy): boolean {
    switch (strategy.trigger) {
      case 'threshold':
        return this.checkThreshold(strategy);
      case 'pattern':
        return this.checkPattern(strategy);
      case 'manual':
        return false;
      default:
        return false;
    }
  }

  private checkThreshold(strategy: AdaptationStrategy): boolean {
    if (!strategy.threshold) return false;

    const currentMetrics = this.getAggregatedMetrics();
    const metricValue = currentMetrics[
      strategy.threshold.metric as keyof PerformanceMetrics
    ] as number;

    if (metricValue === undefined) return false;

    const { operator, value } = strategy.threshold;

    switch (operator) {
      case '>':
        return metricValue > value;
      case '<':
        return metricValue < value;
      case '>=':
        return metricValue >= value;
      case '<=':
        return metricValue <= value;
      default:
        return false;
    }
  }

  private checkPattern(strategy: AdaptationStrategy): boolean {
    if (this.metricsWindow.length < 3) return false;

    const recent = this.metricsWindow.slice(-3);
    let increasing = true;
    let decreasing = true;

    for (let i = 1; i < recent.length; i++) {
      if (recent[i].latency <= recent[i - 1].latency) {
        increasing = false;
      }
      if (recent[i].latency >= recent[i - 1].latency) {
        decreasing = false;
      }
    }

    if (strategy.type === 'cache' && increasing) {
      return true;
    }
    if (strategy.type === 'retry' && decreasing) {
      return true;
    }

    return false;
  }

  private async applyStrategy(
    strategy: AdaptationStrategy,
    beforeMetrics: PerformanceMetrics
  ): Promise<AdaptationResult> {
    const result: AdaptationResult = {
      applied: true,
      strategy,
      effect: 'neutral',
      metrics: {
        before: { ...beforeMetrics },
        after: { ...beforeMetrics },
      },
      timestamp: Date.now(),
    };

    this.history.push(result);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    console.log(
      `[AdaptationEngine] Applied strategy: ${strategy.name} (${strategy.type})`
    );

    return result;
  }

  private addToMetricsWindow(metrics: PerformanceMetrics): void {
    this.metricsWindow.push(metrics);
    if (this.metricsWindow.length > this.maxMetricsWindow) {
      this.metricsWindow.shift();
    }
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
        toolUsage: {} as Record<string, number>,
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

  evaluateResult(result: AdaptationResult): void {
    const index = this.history.findIndex(
      (h) => h.timestamp === result.timestamp
    );
    if (index < 0) return;

    const window = this.metricsWindow.slice(-5);
    if (window.length < 2) return;

    const avgLatency =
      window.reduce((sum, m) => sum + m.latency, 0) / window.length;
    const beforeLatency = result.metrics.before.latency;

    if (avgLatency < beforeLatency * 0.9) {
      result.effect = 'positive';
    } else if (avgLatency > beforeLatency * 1.1) {
      result.effect = 'negative';
    }
  }

  registerStrategy(strategy: AdaptationRuleOptions): void {
    const fullStrategy: AdaptationStrategy = {
      id: strategy.id,
      name: strategy.name,
      type: strategy.type,
      trigger: strategy.trigger || 'threshold',
      enabled: strategy.enabled ?? true,
      config: strategy.config || {},
      threshold: strategy.threshold,
    };

    this.strategies.set(strategy.id, fullStrategy);
  }

  unregisterStrategy(id: string): boolean {
    return this.strategies.delete(id);
  }

  enableStrategy(id: string): boolean {
    const strategy = this.strategies.get(id);
    if (strategy) {
      strategy.enabled = true;
      return true;
    }
    return false;
  }

  disableStrategy(id: string): boolean {
    const strategy = this.strategies.get(id);
    if (strategy) {
      strategy.enabled = false;
      return true;
    }
    return false;
  }

  getStrategies(): AdaptationStrategy[] {
    return Array.from(this.strategies.values());
  }

  getStrategy(id: string): AdaptationStrategy | undefined {
    return this.strategies.get(id);
  }

  getHistory(): AdaptationResult[] {
    return [...this.history];
  }

  getAggregatedMetricsSnapshot(): PerformanceMetrics {
    return this.getAggregatedMetrics();
  }

  setCooldownPeriod(ms: number): void {
    this.cooldownPeriod = ms;
  }

  reset(): void {
    this.strategies.clear();
    this.history = [];
    this.metricsWindow = [];
    this.lastAdaptationTime = 0;
  }
}

export default AdaptationEngine;
