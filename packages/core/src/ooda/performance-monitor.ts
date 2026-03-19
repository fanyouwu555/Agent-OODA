// packages/core/src/ooda/performance-monitor.ts
// 性能监控模块 - 追踪OODA系统各阶段性能指标

export interface PerformanceMetrics {
  intentRecognitionTime: number;
  toolExecutionTime: number;
  promptBuildTime: number;
  llmResponseTime: number;
  totalTime: number;
  intentType: string;
  optimization: string;
  usedTools: boolean;
  outputLength: number;
  timestamp: number;
}

export interface AggregatedMetrics {
  intentType: string;
  count: number;
  avgTotalTime: number;
  avgIntentRecognitionTime: number;
  avgToolExecutionTime: number;
  avgLlmResponseTime: number;
  successRate: number;
  errorRate: number;
}

export interface SystemHealth {
  uptime: number;
  totalRequests: number;
  avgResponseTime: number;
  errorRate: number;
  requestsPerMinute: number;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private errors: { timestamp: number; error: string; context?: any }[] = [];
  private startTime: number = Date.now();
  private requestCount: number = 0;
  private errorCount: number = 0;

  private currentMetrics: Partial<PerformanceMetrics> = {};

  startTimer(stage: keyof Omit<PerformanceMetrics, 'timestamp' | 'intentType' | 'optimization' | 'usedTools' | 'outputLength' | 'totalTime'>): void {
    this.currentMetrics[stage] = Date.now();
  }

  endTimer(stage: keyof Omit<PerformanceMetrics, 'timestamp' | 'intentType' | 'optimization' | 'usedTools' | 'outputLength' | 'totalTime'>): number {
    const start = this.currentMetrics[stage];
    if (typeof start === 'number') {
      const duration = Date.now() - start;
      this.currentMetrics[stage] = duration;
      return duration;
    }
    return 0;
  }

  setIntentType(intentType: string): void {
    this.currentMetrics.intentType = intentType;
  }

  setOptimization(optimization: string): void {
    this.currentMetrics.optimization = optimization;
  }

  setUsedTools(usedTools: boolean): void {
    this.currentMetrics.usedTools = usedTools;
  }

  setOutputLength(length: number): void {
    this.currentMetrics.outputLength = length;
  }

  recordError(error: string, context?: any): void {
    this.errors.push({
      timestamp: Date.now(),
      error,
      context,
    });
    this.errorCount++;
  }

  finalize(): PerformanceMetrics {
    const now = Date.now();
    const start = this.currentMetrics.intentRecognitionTime as number || now;

    const metrics: PerformanceMetrics = {
      intentRecognitionTime: this.currentMetrics.intentRecognitionTime as number || 0,
      toolExecutionTime: this.currentMetrics.toolExecutionTime as number || 0,
      promptBuildTime: this.currentMetrics.promptBuildTime as number || 0,
      llmResponseTime: this.currentMetrics.llmResponseTime as number || 0,
      totalTime: now - start,
      intentType: this.currentMetrics.intentType || 'unknown',
      optimization: this.currentMetrics.optimization || 'unknown',
      usedTools: this.currentMetrics.usedTools || false,
      outputLength: this.currentMetrics.outputLength || 0,
      timestamp: now,
    };

    this.metrics.push(metrics);
    this.requestCount++;
    this.currentMetrics = {};

    return metrics;
  }

  getMetrics(limit: number = 100): PerformanceMetrics[] {
    return this.metrics.slice(-limit);
  }

  getMetricsByIntent(intentType: string): PerformanceMetrics[] {
    return this.metrics.filter(m => m.intentType === intentType);
  }

  getAggregatedMetrics(): AggregatedMetrics[] {
    const grouped = new Map<string, PerformanceMetrics[]>();

    for (const metric of this.metrics) {
      const list = grouped.get(metric.intentType) || [];
      list.push(metric);
      grouped.set(metric.intentType, list);
    }

    const result: AggregatedMetrics[] = [];

    for (const [intentType, list] of grouped) {
      const count = list.length;
      const sum = (key: keyof PerformanceMetrics) =>
        list.reduce((acc, m) => acc + (m[key] as number || 0), 0);

      result.push({
        intentType,
        count,
        avgTotalTime: sum('totalTime') / count,
        avgIntentRecognitionTime: sum('intentRecognitionTime') / count,
        avgToolExecutionTime: sum('toolExecutionTime') / count,
        avgLlmResponseTime: sum('llmResponseTime') / count,
        successRate: (count - this.errors.filter(e => e.context?.intentType === intentType).length) / count,
        errorRate: this.errors.filter(e => e.context?.intentType === intentType).length / count,
      });
    }

    return result.sort((a, b) => b.count - a.count);
  }

  getSystemHealth(): SystemHealth {
    const now = Date.now();
    const uptime = now - this.startTime;
    const uptimeMinutes = uptime / 60000;

    return {
      uptime,
      totalRequests: this.requestCount,
      avgResponseTime: this.metrics.length > 0
        ? this.metrics.reduce((acc, m) => acc + m.totalTime, 0) / this.metrics.length
        : 0,
      errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
      requestsPerMinute: uptimeMinutes > 0 ? this.requestCount / uptimeMinutes : 0,
    };
  }

  getRecentErrors(limit: number = 10): { timestamp: number; error: string; context?: any }[] {
    return this.errors.slice(-limit);
  }

  reset(): void {
    this.metrics = [];
    this.errors = [];
    this.startTime = Date.now();
    this.requestCount = 0;
    this.errorCount = 0;
    this.currentMetrics = {};
  }

  getMetricsSummary(): {
    totalRequests: number;
    totalErrors: number;
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    topIntents: { intentType: string; count: number }[];
  } {
    if (this.metrics.length === 0) {
      return {
        totalRequests: 0,
        totalErrors: this.errorCount,
        avgResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        topIntents: [],
      };
    }

    const sorted = [...this.metrics].sort((a, b) => a.totalTime - b.totalTime);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    const intentCounts = new Map<string, number>();
    for (const m of this.metrics) {
      intentCounts.set(m.intentType, (intentCounts.get(m.intentType) || 0) + 1);
    }

    const topIntents = Array.from(intentCounts.entries())
      .map(([intentType, count]) => ({ intentType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalRequests: this.requestCount,
      totalErrors: this.errorCount,
      avgResponseTime: sorted.reduce((acc, m) => acc + m.totalTime, 0) / sorted.length,
      p95ResponseTime: sorted[p95Index]?.totalTime || 0,
      p99ResponseTime: sorted[p99Index]?.totalTime || 0,
      topIntents,
    };
  }
}

// 全局性能监控实例
const globalMonitor = new PerformanceMonitor();

export function getPerformanceMonitor(): PerformanceMonitor {
  return globalMonitor;
}

export function resetPerformanceMonitor(): void {
  globalMonitor.reset();
}
