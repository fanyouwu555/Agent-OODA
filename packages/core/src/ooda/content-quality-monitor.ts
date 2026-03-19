// 内容质量监控系统
// 监控内容完整率、准确率及错误恢复机制

import { EventEmitter } from 'events';

export interface ContentQualityMetrics {
  totalOutputs: number;
  completeOutputs: number;
  incompleteOutputs: number;
  validatedOutputs: number;
  failedValidations: number;
  averageCompleteness: number;
  averageAccuracy: number;
  truncationCount: number;
  errorRecoveryCount: number;
  errorRecoveryRate: number;
  lastUpdated: number;
}

export interface QualityRecord {
  id: string;
  timestamp: number;
  content: string;
  contentLength: number;
  isComplete: boolean;
  completenessScore: number;
  accuracyScore: number;
  validationPassed: boolean;
  errorType?: string;
  recoveryAttempted: boolean;
  recoverySuccess: boolean;
  sessionId: string;
  intent: string;
}

export interface QualityAlert {
  type: 'TRUNCATION' | 'LOW_COMPLETENESS' | 'LOW_ACCURACY' | 'HIGH_ERROR_RATE' | 'RECOVERY_FAILURE';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: number;
  metrics?: Partial<ContentQualityMetrics>;
}

export interface QualityThreshold {
  minCompleteness: number;
  minAccuracy: number;
  maxErrorRate: number;
  minRecoveryRate: number;
  alertCooldownMs: number;
}

const DEFAULT_THRESHOLD: QualityThreshold = {
  minCompleteness: 0.8,
  minAccuracy: 0.75,
  maxErrorRate: 0.15,
  minRecoveryRate: 0.6,
  alertCooldownMs: 60000
};

export class ContentQualityMonitor extends EventEmitter {
  private records: Map<string, QualityRecord> = new Map();
  private metrics: ContentQualityMetrics;
  private threshold: QualityThreshold;
  private lastAlertTime: Map<string, number> = new Map();
  private sessionRecords: Map<string, QualityRecord[]> = new Map();

  constructor(threshold: Partial<QualityThreshold> = {}) {
    super();
    this.threshold = { ...DEFAULT_THRESHOLD, ...threshold };
    this.metrics = this.initMetrics();
  }

  private initMetrics(): ContentQualityMetrics {
    return {
      totalOutputs: 0,
      completeOutputs: 0,
      incompleteOutputs: 0,
      validatedOutputs: 0,
      failedValidations: 0,
      averageCompleteness: 0,
      averageAccuracy: 0,
      truncationCount: 0,
      errorRecoveryCount: 0,
      errorRecoveryRate: 0,
      lastUpdated: Date.now()
    };
  }

  recordOutput(record: Omit<QualityRecord, 'id' | 'timestamp' | 'completenessScore' | 'accuracyScore' | 'validationPassed'>): string {
    const id = `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const qualityRecord: QualityRecord = {
      ...record,
      id,
      timestamp: Date.now(),
      completenessScore: this.calculateCompleteness(record.content),
      accuracyScore: this.evaluateAccuracy(record.content),
      validationPassed: record.content.length > 0 && !this.isTruncated(record.content)
    };

    this.records.set(id, qualityRecord);
    this.metrics.totalOutputs++;

    if (this.sessionRecords.has(record.sessionId)) {
      this.sessionRecords.get(record.sessionId)!.push(qualityRecord);
    } else {
      this.sessionRecords.set(record.sessionId, [qualityRecord]);
    }

    this.updateMetrics();
    this.checkThresholds(qualityRecord);

    return id;
  }

  recordValidation(id: string, passed: boolean): void {
    const record = this.records.get(id);
    if (record) {
      record.validationPassed = passed;
      this.metrics.validatedOutputs++;
      if (!passed) {
        this.metrics.failedValidations++;
      }
      this.updateMetrics();
    }
  }

  recordTruncation(id: string): void {
    const record = this.records.get(id);
    if (record) {
      record.isComplete = false;
      this.metrics.truncationCount++;
      this.updateMetrics();
    }
  }

  recordRecovery(id: string, success: boolean): void {
    const record = this.records.get(id);
    if (record) {
      record.recoveryAttempted = true;
      record.recoverySuccess = success;
      if (success) {
        this.metrics.errorRecoveryCount++;
      }
      this.updateMetrics();
    }
  }

  private calculateCompleteness(content: string): number {
    if (!content || content.length === 0) return 0;

    let score = 1.0;

    if (content.endsWith('...') || content.endsWith('…') || content.endsWith('...')) {
      score -= 0.3;
    }

    const bracketPairs: [string, string][] = [['{', '}'], ['[', ']'], ['(', ')'], ['<', '>']];
    for (const [open, close] of bracketPairs) {
      const openCount = (content.match(new RegExp(open, 'g')) || []).length;
      const closeCount = (content.match(new RegExp(close, 'g')) || []).length;
      if (openCount !== closeCount) {
        score -= Math.min(0.2, Math.abs(openCount - closeCount) * 0.1);
      }
    }

    if (content.length < 50) {
      score -= 0.2;
    }

    const structuralIndicators = ['。', '，', '\n', '；', '！', '？'];
    const hasStructure = structuralIndicators.some(ind => content.includes(ind));
    if (!hasStructure && content.length > 100) {
      score -= 0.15;
    }

    return Math.max(0, Math.min(1, score));
  }

  private evaluateAccuracy(content: string): number {
    if (!content || content.length === 0) return 0;

    let score = 1.0;

    const contradictionPatterns = [
      /但是.*然而/,
      /虽然.*但是.*又/,
      /既.*又.*矛盾/,
      /前面说.*后面说/
    ];

    for (const pattern of contradictionPatterns) {
      if (pattern.test(content)) {
        score -= 0.15;
      }
    }

    const nonsensePatterns = [
      /^[，。、；：]+$/,
      /(.)\1{5,}/,
      /^[\d\s]+$/
    ];

    for (const pattern of nonsensePatterns) {
      if (pattern.test(content)) {
        score -= 0.4;
      }
    }

    if (content.includes('[数据截断]') || content.includes('[内容丢失]')) {
      score -= 0.3;
    }

    return Math.max(0, Math.min(1, score));
  }

  private isTruncated(content: string): boolean {
    return content.endsWith('...') ||
           content.endsWith('…') ||
           content.includes('[截断]') ||
           content.includes('[truncated]') ||
           (content.length > 0 && !content.match(/[。！？.!?]$/));
  }

  private updateMetrics(): void {
    const records = Array.from(this.records.values());

    if (records.length === 0) {
      this.metrics = this.initMetrics();
      return;
    }

    const recentRecords = records.slice(-100);

    this.metrics.completeOutputs = recentRecords.filter(r => r.isComplete).length;
    this.metrics.incompleteOutputs = recentRecords.filter(r => !r.isComplete).length;
    this.metrics.averageCompleteness = recentRecords.reduce((sum, r) => sum + r.completenessScore, 0) / recentRecords.length;
    this.metrics.averageAccuracy = recentRecords.reduce((sum, r) => sum + r.accuracyScore, 0) / recentRecords.length;

    const errorRecords = recentRecords.filter(r => !r.validationPassed);
    this.metrics.failedValidations = errorRecords.length;

    if (this.metrics.truncationCount > 0 || this.metrics.errorRecoveryCount > 0) {
      this.metrics.errorRecoveryRate = this.metrics.errorRecoveryCount / (this.metrics.truncationCount + this.metrics.errorRecoveryCount);
    }

    this.metrics.lastUpdated = Date.now();
  }

  private checkThresholds(record: QualityRecord): void {
    const now = Date.now();
    if (record.completenessScore < this.threshold.minCompleteness) {
      this.emitAlert({
        type: 'LOW_COMPLETENESS',
        severity: 'warning',
        message: `内容完整率 ${Math.round(record.completenessScore * 100)}% 低于阈值 ${Math.round(this.threshold.minCompleteness * 100)}%`,
        timestamp: now
      });
    }

    if (record.accuracyScore < this.threshold.minAccuracy) {
      this.emitAlert({
        type: 'LOW_ACCURACY',
        severity: 'warning',
        message: `内容准确率 ${Math.round(record.accuracyScore * 100)}% 低于阈值 ${Math.round(this.threshold.minAccuracy * 100)}%`,
        timestamp: now
      });
    }

    if (record.isComplete === false) {
      this.emitAlert({
        type: 'TRUNCATION',
        severity: 'critical',
        message: '检测到输出被截断',
        timestamp: now
      });
    }

    const recentRecords = Array.from(this.records.values()).slice(-20);
    const recentErrorRate = recentRecords.filter(r => !r.validationPassed).length / recentRecords.length;

    if (recentErrorRate > this.threshold.maxErrorRate) {
      this.emitAlert({
        type: 'HIGH_ERROR_RATE',
        severity: 'critical',
        message: `错误率 ${Math.round(recentErrorRate * 100)}% 超过阈值 ${Math.round(this.threshold.maxErrorRate * 100)}%`,
        timestamp: now
      });
    }
  }

  private emitAlert(alert: QualityAlert): void {
    const alertKey = alert.type;
    const lastAlert = this.lastAlertTime.get(alertKey) || 0;

    if (Date.now() - lastAlert < this.threshold.alertCooldownMs) {
      return;
    }

    this.lastAlertTime.set(alertKey, Date.now());
    alert.timestamp = Date.now();
    alert.metrics = this.getMetrics();

    this.emit('alert', alert);
  }

  getMetrics(): ContentQualityMetrics {
    return { ...this.metrics };
  }

  getRecord(id: string): QualityRecord | undefined {
    return this.records.get(id);
  }

  getSessionRecords(sessionId: string): QualityRecord[] {
    return this.sessionRecords.get(sessionId) || [];
  }

  getRecentRecords(limit: number = 100): QualityRecord[] {
    return Array.from(this.records.values()).slice(-limit);
  }

  getQualityTrend(sessionId: string, windowSize: number = 10): {
    completenessTrend: number[];
    accuracyTrend: number[];
  } {
    const records = this.sessionRecords.get(sessionId) || [];
    const recentRecords = records.slice(-windowSize);

    return {
      completenessTrend: recentRecords.map(r => r.completenessScore),
      accuracyTrend: recentRecords.map(r => r.accuracyScore)
    };
  }

  reset(): void {
    this.records.clear();
    this.metrics = this.initMetrics();
    this.lastAlertTime.clear();
    this.sessionRecords.clear();
  }

  generateReport(): string {
    const metrics = this.getMetrics();
    const records = this.getRecentRecords(100);

    const completenessDist = {
      high: records.filter(r => r.completenessScore >= 0.9).length,
      medium: records.filter(r => r.completenessScore >= 0.7 && r.completenessScore < 0.9).length,
      low: records.filter(r => r.completenessScore < 0.7).length
    };

    const accuracyDist = {
      high: records.filter(r => r.accuracyScore >= 0.9).length,
      medium: records.filter(r => r.accuracyScore >= 0.7 && r.accuracyScore < 0.9).length,
      low: records.filter(r => r.accuracyScore < 0.7).length
    };

    return `
=== 内容质量监控报告 ===

【总体指标】
- 总输出数: ${metrics.totalOutputs}
- 完整输出: ${metrics.completeOutputs} (${Math.round((metrics.completeOutputs / Math.max(1, metrics.totalOutputs)) * 100)}%)
- 截断次数: ${metrics.truncationCount}
- 错误恢复次数: ${metrics.errorRecoveryCount}
- 错误恢复率: ${Math.round(metrics.errorRecoveryRate * 100)}%

【质量评分】
- 平均完整率: ${Math.round(metrics.averageCompleteness * 100)}%
- 平均准确率: ${Math.round(metrics.averageAccuracy * 100)}%

【完整率分布】
- 高 (>=90%): ${completenessDist.high} (${Math.round((completenessDist.high / Math.max(1, records.length)) * 100)}%)
- 中 (70-90%): ${completenessDist.medium} (${Math.round((completenessDist.medium / Math.max(1, records.length)) * 100)}%)
- 低 (<70%): ${completenessDist.low} (${Math.round((completenessDist.low / Math.max(1, records.length)) * 100)}%)

【准确率分布】
- 高 (>=90%): ${accuracyDist.high} (${Math.round((accuracyDist.high / Math.max(1, records.length)) * 100)}%)
- 中 (70-90%): ${accuracyDist.medium} (${Math.round((accuracyDist.medium / Math.max(1, records.length)) * 100)}%)
- 低 (<70%): ${accuracyDist.low} (${Math.round((accuracyDist.low / Math.max(1, records.length)) * 100)}%)

【阈值检查】
- 完整率阈值: ${Math.round(this.threshold.minCompleteness * 100)}% ${metrics.averageCompleteness >= this.threshold.minCompleteness ? '✓' : '✗'}
- 准确率阈值: ${Math.round(this.threshold.minAccuracy * 100)}% ${metrics.averageAccuracy >= this.threshold.minAccuracy ? '✓' : '✗'}
- 最大错误率: ${Math.round(this.threshold.maxErrorRate * 100)}%

最后更新: ${new Date(metrics.lastUpdated).toLocaleString()}
`;
  }
}

export const globalContentQualityMonitor = new ContentQualityMonitor();
