// 自测自修自检引擎

import { DiagnosticCheck, DiagnosticReport, DiagnosticsHealthStatus, CheckResult, FixResult } from './types';
import { ConfigCheck } from './checks/config-check';
import { LLMCheck } from './checks/llm-check';
import { StorageCheck } from './checks/storage-check';

export class DiagnosticsEngine {
  private checks: DiagnosticCheck[] = [];
  private startTime: number = Date.now();
  private version: string = '0.1.0';

  constructor() {
    this.registerDefaultChecks();
  }

  private registerDefaultChecks() {
    this.checks.push(new ConfigCheck());
    this.checks.push(new LLMCheck());
    this.checks.push(new StorageCheck());
  }

  registerCheck(check: DiagnosticCheck) {
    this.checks.push(check);
  }

  async runDiagnostics(options: { autoFix?: boolean } = {}): Promise<DiagnosticReport> {
    console.log('🔍 开始运行诊断检查...');

    const checks: CheckResult[] = [];
    const fixes: FixResult[] = [];
    const recommendations: string[] = [];

    for (const check of this.checks) {
      console.log(`  📋 ${check.name}...`);
      const startTime = Date.now();

      try {
        const result = await check.check();
        checks.push(result);

        const duration = Date.now() - startTime;
        console.log(`     ${this.getStatusIcon(result.status)} ${result.message} (${duration}ms)`);

        // 自动修复
        if (options.autoFix && result.status !== 'pass' && check.fix) {
          console.log(`     🔧 尝试自动修复...`);
          const fixResult = await check.fix();
          fixes.push(fixResult);
          console.log(`     ${this.getFixIcon(fixResult.status)} ${fixResult.message}`);
        }

        // 生成建议
        if (result.status === 'fail') {
          recommendations.push(`[${check.name}] ${result.message}`);
        }
      } catch (error) {
        console.error(`     ❌ 检查失败: ${error}`);
        checks.push({
          status: 'fail',
          message: `检查执行失败: ${error}`,
          error: error as Error,
        });
      }
    }

    // 计算整体状态
    const overallStatus = this.calculateOverallStatus(checks);

    const report: DiagnosticReport = {
      timestamp: Date.now(),
      overallStatus,
      checks,
      fixes,
      recommendations,
    };

    this.printReport(report);
    return report;
  }

  async getHealthStatus(): Promise<DiagnosticsHealthStatus> {
    const checks: DiagnosticsHealthStatus['checks'] = [];

    for (const check of this.checks) {
      const startTime = Date.now();
      try {
        const result = await check.check();
        checks.push({
          name: check.name,
          status: result.status,
          responseTime: Date.now() - startTime,
        });
      } catch (error) {
        checks.push({
          name: check.name,
          status: 'fail',
          responseTime: Date.now() - startTime,
        });
      }
    }

    return {
      status: this.calculateOverallStatus(checks.map(c => ({ status: c.status, message: '', details: {} }))),
      uptime: Date.now() - this.startTime,
      version: this.version,
      checks,
    };
  }

  private calculateOverallStatus(checks: CheckResult[]): 'healthy' | 'degraded' | 'critical' {
    const failCount = checks.filter(c => c.status === 'fail').length;
    const warningCount = checks.filter(c => c.status === 'warning').length;

    if (failCount > 0) return 'critical';
    if (warningCount > 0) return 'degraded';
    return 'healthy';
  }

  private getStatusIcon(status: CheckResult['status']): string {
    switch (status) {
      case 'pass': return '✅';
      case 'warning': return '⚠️';
      case 'fail': return '❌';
    }
  }

  private getFixIcon(status: FixResult['status']): string {
    switch (status) {
      case 'fixed': return '✅';
      case 'failed': return '❌';
      case 'skipped': return '⏭️';
    }
  }

  private printReport(report: DiagnosticReport) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 诊断报告');
    console.log('='.repeat(60));
    console.log(`整体状态: ${report.overallStatus.toUpperCase()}`);
    console.log(`检查时间: ${new Date(report.timestamp).toLocaleString()}`);
    console.log(`检查项数: ${report.checks.length}`);
    console.log(`修复项数: ${report.fixes.length}`);

    if (report.recommendations.length > 0) {
      console.log('\n💡 建议:');
      report.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });
    }

    console.log('='.repeat(60));
  }
}

// 单例实例
let diagnosticsEngine: DiagnosticsEngine | null = null;

export function getDiagnosticsEngine(): DiagnosticsEngine {
  if (!diagnosticsEngine) {
    diagnosticsEngine = new DiagnosticsEngine();
  }
  return diagnosticsEngine;
}

export function resetDiagnosticsEngine(): void {
  diagnosticsEngine = null;
}
