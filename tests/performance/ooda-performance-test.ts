// tests/performance/ooda-performance-test.ts
// OODA Loop 性能分析测试工具

import { performance } from 'perf_hooks';
import { OODALoop, OODAEvent } from '../../packages/core/dist/ooda/loop';
import { initializeMemorySystem } from '../../packages/core/dist/memory';

// 模拟内存存储库
const mockMemoryRepository = {
  store: async () => 'memory-id',
  search: async () => [],
  get: async () => null,
  update: async () => {},
  delete: async () => {},
  list: async () => [],
  clear: async () => {},
};

// 性能指标接口
interface PhaseMetrics {
  phase: string;
  count: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  times: number[];
}

interface PerformanceReport {
  testName: string;
  totalDuration: number;
  iterations: number;
  phaseMetrics: PhaseMetrics[];
  bottlenecks: string[];
  recommendations: string[];
}

// 性能测试类
class OODAPerformanceTester {
  private sessionId: string;
  private phaseTimers: Map<string, number> = new Map();
  private phaseMetrics: Map<string, PhaseMetrics> = new Map();
  private events: OODAEvent[] = [];

  constructor(sessionId: string = 'perf-test-session') {
    this.sessionId = sessionId;
    initializeMemorySystem(mockMemoryRepository as any, false);
  }

  // 性能测试回调
  private async performanceCallback(event: OODAEvent): Promise<void> {
    const timestamp = performance.now();
    
    switch (event.phase) {
      case 'observe':
      case 'orient':
      case 'decide':
      case 'act':
        this.phaseTimers.set(event.phase, timestamp);
        break;
      case 'complete':
      case 'feedback':
      case 'adaptation':
        // 记录事件但不计时
        break;
      case 'tool_result':
        // 工具执行完成，记录Act阶段结束
        const actStart = this.phaseTimers.get('act');
        if (actStart) {
          this.recordPhaseTime('act', timestamp - actStart);
        }
        break;
    }

    // 当进入下一阶段时，记录上一阶段的结束时间
    const phaseOrder = ['observe', 'orient', 'decide', 'act'];
    const currentIndex = phaseOrder.indexOf(event.phase);
    if (currentIndex > 0) {
      const prevPhase = phaseOrder[currentIndex - 1];
      const prevStart = this.phaseTimers.get(prevPhase);
      if (prevStart && !this.phaseMetrics.has(`${prevPhase}_recorded`)) {
        this.recordPhaseTime(prevPhase, timestamp - prevStart);
        this.phaseMetrics.set(`${prevPhase}_recorded`, true as any);
      }
    }

    this.events.push(event);
  }

  private recordPhaseTime(phase: string, duration: number): void {
    let metrics = this.phaseMetrics.get(phase);
    if (!metrics) {
      metrics = {
        phase,
        count: 0,
        totalTime: 0,
        avgTime: 0,
        minTime: Infinity,
        maxTime: 0,
        times: [],
      };
      this.phaseMetrics.set(phase, metrics);
    }

    metrics.count++;
    metrics.totalTime += duration;
    metrics.times.push(duration);
    metrics.minTime = Math.min(metrics.minTime, duration);
    metrics.maxTime = Math.max(metrics.maxTime, duration);
    metrics.avgTime = metrics.totalTime / metrics.count;
  }

  // 运行单次测试
  async runTest(testName: string, input: string, iterations: number = 1): Promise<PerformanceReport> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`开始性能测试: ${testName}`);
    console.log(`输入: ${input}`);
    console.log(`迭代次数: ${iterations}`);
    console.log(`${'='.repeat(60)}\n`);

    const startTime = performance.now();
    this.phaseMetrics.clear();
    this.phaseTimers.clear();
    this.events = [];

    const oodaLoop = new OODALoop(this.sessionId);

    for (let i = 0; i < iterations; i++) {
      console.log(`  迭代 ${i + 1}/${iterations}...`);
      
      // 重置记录标记
      this.phaseMetrics.delete('observe_recorded');
      this.phaseMetrics.delete('orient_recorded');
      this.phaseMetrics.delete('decide_recorded');
      
      const iterationStart = performance.now();
      
      try {
        await oodaLoop.runWithCallback(
          input,
          (event) => this.performanceCallback(event),
          []
        );
      } catch (error) {
        console.error(`  迭代 ${i + 1} 出错:`, error);
      }

      const iterationDuration = performance.now() - iterationStart;
      console.log(`  迭代 ${i + 1} 完成，耗时: ${iterationDuration.toFixed(2)}ms`);
    }

    const totalDuration = performance.now() - startTime;

    // 生成报告
    const report = this.generateReport(testName, totalDuration, iterations);
    this.printReport(report);

    return report;
  }

  // 生成性能报告
  private generateReport(testName: string, totalDuration: number, iterations: number): PerformanceReport {
    const phases: PhaseMetrics[] = [];
    const bottlenecks: string[] = [];
    const recommendations: string[] = [];

    // 收集各阶段指标
    ['observe', 'orient', 'decide', 'act'].forEach(phase => {
      const metrics = this.phaseMetrics.get(phase);
      if (metrics && metrics.count > 0) {
        phases.push({ ...metrics });

        // 识别瓶颈
        if (metrics.avgTime > 2000) {
          bottlenecks.push(`${phase} 阶段平均耗时过长 (${metrics.avgTime.toFixed(2)}ms)`);
        }
        if (metrics.maxTime > metrics.avgTime * 3) {
          bottlenecks.push(`${phase} 阶段存在异常峰值 (${metrics.maxTime.toFixed(2)}ms)`);
        }
      }
    });

    // 生成建议
    const totalPhaseTime = phases.reduce((sum, p) => sum + p.totalTime, 0);
    phases.forEach(phase => {
      const percentage = (phase.totalTime / totalPhaseTime) * 100;
      if (percentage > 40) {
        recommendations.push(`${phase.phase} 阶段占用 ${percentage.toFixed(1)}% 时间，建议优化`);
      }
    });

    if (iterations > 1) {
      // 分析迭代间差异
      phases.forEach(phase => {
        if (phase.times.length > 1) {
          const variance = this.calculateVariance(phase.times);
          if (variance > phase.avgTime * 0.5) {
            recommendations.push(`${phase.phase} 阶段时间波动较大 (方差: ${variance.toFixed(2)})，建议检查稳定性`);
          }
        }
      });
    }

    return {
      testName,
      totalDuration,
      iterations,
      phaseMetrics: phases,
      bottlenecks,
      recommendations,
    };
  }

  private calculateVariance(times: number[]): number {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const squareDiffs = times.map(time => Math.pow(time - avg, 2));
    return squareDiffs.reduce((a, b) => a + b, 0) / times.length;
  }

  // 打印报告
  private printReport(report: PerformanceReport): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log('性能测试报告');
    console.log(`${'='.repeat(60)}`);
    console.log(`测试名称: ${report.testName}`);
    console.log(`总耗时: ${report.totalDuration.toFixed(2)}ms`);
    console.log(`迭代次数: ${report.iterations}`);
    console.log(`平均每次: ${(report.totalDuration / report.iterations).toFixed(2)}ms`);
    console.log(`\n各阶段耗时分析:`);
    console.log('-'.repeat(60));

    const totalPhaseTime = report.phaseMetrics.reduce((sum, p) => sum + p.totalTime, 0);

    report.phaseMetrics.forEach(phase => {
      const percentage = (phase.totalTime / totalPhaseTime) * 100;
      console.log(`\n${phase.phase.toUpperCase()} 阶段:`);
      console.log(`  调用次数: ${phase.count}`);
      console.log(`  总时间: ${phase.totalTime.toFixed(2)}ms (${percentage.toFixed(1)}%)`);
      console.log(`  平均时间: ${phase.avgTime.toFixed(2)}ms`);
      console.log(`  最短时间: ${phase.minTime.toFixed(2)}ms`);
      console.log(`  最长时间: ${phase.maxTime.toFixed(2)}ms`);
      
      if (phase.times.length > 1) {
        const variance = this.calculateVariance(phase.times);
        console.log(`  标准差: ${Math.sqrt(variance).toFixed(2)}ms`);
      }
    });

    if (report.bottlenecks.length > 0) {
      console.log(`\n⚠️  发现的瓶颈:`);
      report.bottlenecks.forEach(b => console.log(`  - ${b}`));
    }

    if (report.recommendations.length > 0) {
      console.log(`\n💡 优化建议:`);
      report.recommendations.forEach(r => console.log(`  - ${r}`));
    }

    console.log(`\n${'='.repeat(60)}\n`);
  }

  // 对比测试
  async runComparisonTest(testCases: { name: string; input: string }[]): Promise<void> {
    console.log(`\n${'='.repeat(60)}`);
    console.log('OODA Loop 性能对比测试');
    console.log(`${'='.repeat(60)}\n`);

    const results: PerformanceReport[] = [];

    for (const testCase of testCases) {
      const report = await this.runTest(testCase.name, testCase.input, 3);
      results.push(report);
    }

    // 生成对比报告
    console.log(`\n${'='.repeat(60)}`);
    console.log('对比分析');
    console.log(`${'='.repeat(60)}\n`);

    console.log('测试用例平均耗时排名:');
    results
      .sort((a, b) => (a.totalDuration / a.iterations) - (b.totalDuration / b.iterations))
      .forEach((report, index) => {
        const avgTime = report.totalDuration / report.iterations;
        console.log(`  ${index + 1}. ${report.testName}: ${avgTime.toFixed(2)}ms`);
      });

    // 找出最慢的阶段
    const phaseTotals: Map<string, number> = new Map();
    results.forEach(report => {
      report.phaseMetrics.forEach(phase => {
        const current = phaseTotals.get(phase.phase) || 0;
        phaseTotals.set(phase.phase, current + phase.totalTime);
      });
    });

    console.log('\n各阶段总耗时排名:');
    Array.from(phaseTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([phase, total], index) => {
        console.log(`  ${index + 1}. ${phase}: ${total.toFixed(2)}ms`);
      });

    console.log(`\n${'='.repeat(60)}\n`);
  }
}

// 测试用例
const testCases = [
  {
    name: '简单问候',
    input: '你好',
  },
  {
    name: '文件读取请求',
    input: '请读取 README.md 文件的内容',
  },
  {
    name: '代码分析请求',
    input: '分析 packages/core/src/ooda/loop.ts 文件的结构',
  },
  {
    name: '多步骤任务',
    input: '帮我创建一个测试文件，写入一些内容，然后读取验证',
  },
  {
    name: '复杂查询',
    input: '搜索关于 OODA 循环的最佳实践，然后总结关键点',
  },
];

// 运行测试
async function main() {
  const tester = new OODAPerformanceTester();

  // 运行单个详细测试
  console.log('开始详细性能测试...\n');
  
  for (const testCase of testCases) {
    await tester.runTest(testCase.name, testCase.input, 3);
  }

  // 运行对比测试
  await tester.runComparisonTest(testCases);
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { OODAPerformanceTester, PerformanceReport, PhaseMetrics };
