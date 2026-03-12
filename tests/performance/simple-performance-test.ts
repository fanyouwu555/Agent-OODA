// tests/performance/simple-performance-test.ts
// 简化的 OODA Loop 性能分析测试工具

import { performance } from 'perf_hooks';

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

// 模拟 OODA 各阶段
class MockOODALoop {
  async observe(input: string): Promise<any> {
    // 模拟观察阶段：信息收集、模式识别
    const delay = 50 + Math.random() * 100;
    await this.sleep(delay);
    return {
      userInput: input,
      toolResults: [],
      patterns: [],
      anomalies: [],
    };
  }

  async orient(observation: any): Promise<any> {
    // 模拟判断阶段：分析、约束识别
    const delay = 100 + Math.random() * 200;
    await this.sleep(delay);
    return {
      primaryIntent: { type: 'general', confidence: 0.8 },
      constraints: [],
      patterns: observation.patterns,
    };
  }

  async decide(orientation: any): Promise<any> {
    // 模拟决策阶段：选项生成、计划制定
    const delay = 80 + Math.random() * 150;
    await this.sleep(delay);
    return {
      problemStatement: '处理用户请求',
      options: [],
      plan: { subtasks: [], dependencies: { nodes: [], edges: [] } },
      nextAction: { type: 'response' },
    };
  }

  async act(decision: any): Promise<any> {
    // 模拟行动阶段：执行操作
    const delay = 30 + Math.random() * 70;
    await this.sleep(delay);
    return {
      success: true,
      result: '完成',
      feedback: { observations: [], issues: [], suggestions: [] },
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 性能测试类
class OODAPerformanceTester {
  private phaseMetrics: Map<string, PhaseMetrics> = new Map();
  private mockLoop: MockOODALoop;

  constructor() {
    this.mockLoop = new MockOODALoop();
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

  // 运行单次 OODA 循环
  async runOODACycle(input: string): Promise<void> {
    // Observe 阶段
    const observeStart = performance.now();
    const observation = await this.mockLoop.observe(input);
    this.recordPhaseTime('observe', performance.now() - observeStart);

    // Orient 阶段
    const orientStart = performance.now();
    const orientation = await this.mockLoop.orient(observation);
    this.recordPhaseTime('orient', performance.now() - orientStart);

    // Decide 阶段
    const decideStart = performance.now();
    const decision = await this.mockLoop.decide(orientation);
    this.recordPhaseTime('decide', performance.now() - decideStart);

    // Act 阶段
    const actStart = performance.now();
    await this.mockLoop.act(decision);
    this.recordPhaseTime('act', performance.now() - actStart);
  }

  // 运行测试
  async runTest(testName: string, input: string, iterations: number = 1): Promise<PerformanceReport> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`开始性能测试: ${testName}`);
    console.log(`输入: ${input}`);
    console.log(`迭代次数: ${iterations}`);
    console.log(`${'='.repeat(60)}\n`);

    const startTime = performance.now();
    this.phaseMetrics.clear();

    for (let i = 0; i < iterations; i++) {
      console.log(`  迭代 ${i + 1}/${iterations}...`);
      
      const iterationStart = performance.now();
      
      try {
        await this.runOODACycle(input);
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
        if (metrics.avgTime > 200) {
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
      const report = await this.runTest(testCase.name, testCase.input, 5);
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

    // 分析时间消耗原因
    console.log('\n📊 时间消耗分析:');
    console.log('-'.repeat(60));
    
    const totalAllTime = Array.from(phaseTotals.values()).reduce((a, b) => a + b, 0);
    Array.from(phaseTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([phase, total]) => {
        const percentage = (total / totalAllTime) * 100;
        console.log(`\n${phase.toUpperCase()} 阶段 (${percentage.toFixed(1)}%):`);
        
        switch (phase) {
          case 'observe':
            console.log('  • 信息收集和模式识别');
            console.log('  • 历史记录分析');
            console.log('  • 异常检测');
            break;
          case 'orient':
            console.log('  • LLM 意图分析');
            console.log('  • 约束条件识别');
            console.log('  • 上下文理解');
            break;
          case 'decide':
            console.log('  • 方案生成和评估');
            console.log('  • 任务分解');
            console.log('  • 风险分析');
            break;
          case 'act':
            console.log('  • 工具执行');
            console.log('  • 结果验证');
            console.log('  • 反馈生成');
            break;
        }
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

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         OODA Loop 性能分析测试工具                         ║');
  console.log('║         分析各阶段时间消耗和瓶颈                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // 运行对比测试
  await tester.runComparisonTest(testCases);

  // 输出总结
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                      性能优化建议                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  console.log('1. ORIENT 阶段通常是耗时最长的，因为涉及 LLM 调用');
  console.log('   建议:');
  console.log('   • 启用缓存机制，避免重复分析相似输入');
  console.log('   • 使用轻量级模型进行初步意图分类');
  console.log('   • 限制历史记录长度，减少上下文处理量\n');

  console.log('2. OBSERVE 阶段的模式识别可以优化');
  console.log('   建议:');
  console.log('   • 使用更高效的数据结构存储历史记录');
  console.log('   • 增量式模式检测，避免全量扫描');
  console.log('   • 并行化独立的检测任务\n');

  console.log('3. DECIDE 阶段的任务分解可以缓存');
  console.log('   建议:');
  console.log('   • 缓存常见任务的分解方案');
  console.log('   • 使用模板化的决策策略');
  console.log('   • 预计算依赖关系图\n');

  console.log('4. ACT 阶段的工具执行可以异步化');
  console.log('   建议:');
  console.log('   • 并行执行独立的工具调用');
  console.log('   • 使用连接池管理外部资源');
  console.log('   • 实现工具执行的超时和重试机制\n');
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { OODAPerformanceTester, PerformanceReport, PhaseMetrics, MockOODALoop };
