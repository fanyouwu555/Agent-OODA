// packages/core/src/monitoring/index.ts

export interface PerformanceMetrics {
  timestamp: number;
  cpuUsage: number;
  memoryUsage: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  eventLoopLag: number;
  activeHandles: number;
  activeRequests: number;
}

export interface OODAMetrics {
  timestamp: number;
  sessionId: string;
  observeTime: number;
  orientTime: number;
  decideTime: number;
  actTime: number;
  totalTime: number;
  toolCalls: number;
  tokensUsed: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  checks: {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    responseTime: number;
  }[];
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsInterval: number;
  healthCheckInterval: number;
  retentionPeriod: number;
  alertThresholds: {
    cpuUsage: number;
    memoryUsage: number;
    eventLoopLag: number;
    errorRate: number;
  };
}

export class MonitoringService {
  private config: MonitoringConfig;
  private metricsBuffer: PerformanceMetrics[] = [];
  private oodaMetricsBuffer: OODAMetrics[] = [];
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  private healthChecks: Map<string, () => Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }>> = new Map();

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = {
      enabled: true,
      metricsInterval: 30000, // 30秒
      healthCheckInterval: 60000, // 60秒
      retentionPeriod: 24 * 60 * 60 * 1000, // 24小时
      alertThresholds: {
        cpuUsage: 80,
        memoryUsage: 85,
        eventLoopLag: 100,
        errorRate: 5,
      },
      ...config,
    };

    if (this.config.enabled) {
      this.start();
    }
  }

  start(): void {
    this.startMetricsCollection();
    this.startHealthChecks();
  }

  stop(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.metricsInterval);
  }

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.runHealthChecks();
    }, this.config.healthCheckInterval);
  }

  private async collectMetrics(): Promise<void> {
    try {
      const metrics: PerformanceMetrics = {
        timestamp: Date.now(),
        cpuUsage: await this.getCPUUsage(),
        memoryUsage: this.getMemoryUsage(),
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external || 0,
        arrayBuffers: process.memoryUsage().arrayBuffers || 0,
        eventLoopLag: await this.getEventLoopLag(),
        activeHandles: 0, // process._getActiveHandles is not available in all Node versions
        activeRequests: 0, // process._getActiveRequests is not available in all Node versions
      };

      this.metricsBuffer.push(metrics);
      this.cleanupOldMetrics();

      // 检查阈值并发出警告
      this.checkThresholds(metrics);
    } catch (error) {
      console.error('[Monitoring] Failed to collect metrics:', error);
    }
  }

  private async getCPUUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const totalUsage = (endUsage.user + endUsage.system) / 1000000; // Convert to seconds
        const percentage = (totalUsage / 0.1) * 100; // 0.1s interval
        resolve(Math.min(percentage, 100));
      }, 100);
    });
  }

  private getMemoryUsage(): number {
    const used = process.memoryUsage().rss;
    const total = require('os').totalmem();
    return (used / total) * 100;
  }

  private async getEventLoopLag(): Promise<number> {
    return new Promise((resolve) => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
        resolve(lag);
      });
    });
  }

  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.config.retentionPeriod;
    this.metricsBuffer = this.metricsBuffer.filter(m => m.timestamp > cutoff);
    this.oodaMetricsBuffer = this.oodaMetricsBuffer.filter(m => m.timestamp > cutoff);
  }

  private checkThresholds(metrics: PerformanceMetrics): void {
    if (metrics.cpuUsage > this.config.alertThresholds.cpuUsage) {
      console.warn(`[Monitoring] High CPU usage: ${metrics.cpuUsage.toFixed(2)}%`);
    }
    if (metrics.memoryUsage > this.config.alertThresholds.memoryUsage) {
      console.warn(`[Monitoring] High memory usage: ${metrics.memoryUsage.toFixed(2)}%`);
    }
    if (metrics.eventLoopLag > this.config.alertThresholds.eventLoopLag) {
      console.warn(`[Monitoring] High event loop lag: ${metrics.eventLoopLag.toFixed(2)}ms`);
    }
  }

  private async runHealthChecks(): Promise<void> {
    const checks: HealthStatus['checks'] = [];
    
    for (const [name, checkFn] of this.healthChecks) {
      const start = Date.now();
      try {
        const result = await checkFn();
        checks.push({
          name,
          status: result.status,
          message: result.message,
          responseTime: Date.now() - start,
        });
      } catch (error) {
        checks.push({
          name,
          status: 'fail',
          message: error instanceof Error ? error.message : 'Unknown error',
          responseTime: Date.now() - start,
        });
      }
    }

    const failedChecks = checks.filter(c => c.status === 'fail').length;
    const warningChecks = checks.filter(c => c.status === 'warn').length;

    const status: HealthStatus = {
      status: failedChecks > 0 ? 'unhealthy' : warningChecks > 0 ? 'degraded' : 'healthy',
      timestamp: Date.now(),
      checks,
    };

    // 发布健康状态
    this.emitHealthStatus(status);
  }

  private emitHealthStatus(status: HealthStatus): void {
    // 可以通过事件总线或回调通知外部
    if (status.status !== 'healthy') {
      console.warn(`[Monitoring] Health status: ${status.status}`, status.checks);
    }
  }

  // 注册健康检查
  registerHealthCheck(
    name: string,
    checkFn: () => Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }>
  ): void {
    this.healthChecks.set(name, checkFn);
  }

  // 记录 OODA 指标
  recordOODAMetrics(metrics: OODAMetrics): void {
    this.oodaMetricsBuffer.push(metrics);
    this.cleanupOldMetrics();
  }

  // 获取性能指标
  getPerformanceMetrics(timeRange?: { start: number; end: number }): PerformanceMetrics[] {
    if (timeRange) {
      return this.metricsBuffer.filter(
        m => m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }
    return [...this.metricsBuffer];
  }

  // 获取 OODA 指标
  getOODAMetrics(timeRange?: { start: number; end: number }): OODAMetrics[] {
    if (timeRange) {
      return this.oodaMetricsBuffer.filter(
        m => m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }
    return [...this.oodaMetricsBuffer];
  }

  // 获取统计信息
  getStatistics(): {
    avgResponseTime: number;
    maxResponseTime: number;
    minResponseTime: number;
    totalRequests: number;
    errorRate: number;
  } {
    const metrics = this.oodaMetricsBuffer;
    if (metrics.length === 0) {
      return {
        avgResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: 0,
        totalRequests: 0,
        errorRate: 0,
      };
    }

    const times = metrics.map(m => m.totalTime);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    const min = Math.min(...times);

    return {
      avgResponseTime: avg,
      maxResponseTime: max,
      minResponseTime: min,
      totalRequests: metrics.length,
      errorRate: 0, // 需要错误计数
    };
  }

  // 获取当前健康状态
  async getHealthStatus(): Promise<HealthStatus> {
    const checks: HealthStatus['checks'] = [];
    
    for (const [name, checkFn] of this.healthChecks) {
      const start = Date.now();
      try {
        const result = await checkFn();
        checks.push({
          name,
          status: result.status,
          message: result.message,
          responseTime: Date.now() - start,
        });
      } catch (error) {
        checks.push({
          name,
          status: 'fail',
          message: error instanceof Error ? error.message : 'Unknown error',
          responseTime: Date.now() - start,
        });
      }
    }

    const failedChecks = checks.filter(c => c.status === 'fail').length;
    const warningChecks = checks.filter(c => c.status === 'warn').length;

    return {
      status: failedChecks > 0 ? 'unhealthy' : warningChecks > 0 ? 'degraded' : 'healthy',
      timestamp: Date.now(),
      checks,
    };
  }
}

// 默认实例
let defaultMonitoringService: MonitoringService | null = null;

export function getMonitoringService(config?: Partial<MonitoringConfig>): MonitoringService {
  if (!defaultMonitoringService) {
    defaultMonitoringService = new MonitoringService(config);
  }
  return defaultMonitoringService;
}

export function resetMonitoringService(): void {
  if (defaultMonitoringService) {
    defaultMonitoringService.stop();
    defaultMonitoringService = null;
  }
}
