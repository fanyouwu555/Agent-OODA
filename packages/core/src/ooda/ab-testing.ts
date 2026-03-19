// packages/core/src/ooda/ab-testing.ts
// A/B测试框架 - 用于比较不同策略的效果

export interface ABVariant {
  id: string;
  name: string;
  config: Record<string, any>;
  weight: number;
}

export interface ABTest {
  id: string;
  name: string;
  description?: string;
  variants: ABVariant[];
  startTime: number;
  endTime?: number;
  status: 'running' | 'paused' | 'completed';
}

export interface ABResult {
  testId: string;
  variantId: string;
  impressions: number;
  successes: number;
  failures: number;
  avgResponseTime: number;
  score: number;
}

export interface ABTestStats {
  test: ABTest;
  results: ABResult[];
  winner?: string;
  confidence: number;
}

type ABRouter = (testId: string, context: Record<string, any>) => string;

export class ABTestingFramework {
  private tests: Map<string, ABTest> = new Map();
  private results: Map<string, ABResult[]> = new Map();
  private currentAssignments: Map<string, Map<string, string>> = new Map();
  private router: ABRouter;
  private idCounter: number = 0;

  constructor(router?: ABRouter) {
    this.router = router || this.defaultRouter.bind(this);
  }

  generateId(prefix: string = 'test'): string {
    return `${prefix}-${Date.now()}-${++this.idCounter}`;
  }

  private defaultRouter(testId: string, context: Record<string, any>): string {
    const test = this.tests.get(testId);
    if (!test) return '';

    const totalWeight = test.variants.reduce((sum, v) => sum + v.weight, 0);
    let random = Math.random() * totalWeight;

    for (const variant of test.variants) {
      random -= variant.weight;
      if (random <= 0) {
        return variant.id;
      }
    }

    return test.variants[0].id;
  }

  createTest(
    name: string,
    variants: { name: string; config: Record<string, any>; weight: number }[],
    options?: { description?: string; duration?: number }
  ): string {
    const id = this.generateId('ab-test');

    const test: ABTest = {
      id,
      name,
      description: options?.description,
      variants: variants.map(v => ({
        id: this.generateId('variant'),
        name: v.name,
        config: v.config,
        weight: v.weight,
      })),
      startTime: Date.now(),
      status: 'running',
    };

    if (options?.duration) {
      test.endTime = test.startTime + options.duration;
    }

    this.tests.set(id, test);
    this.results.set(id, []);

    return id;
  }

  getVariant(testId: string, context: Record<string, any> = {}): ABVariant | null {
    const test = this.tests.get(testId);
    if (!test || test.status !== 'running') return null;

    if (test.endTime && Date.now() > test.endTime) {
      test.status = 'completed';
      return null;
    }

    const variantId = this.router(testId, context);

    if (!this.currentAssignments.has(testId)) {
      this.currentAssignments.set(testId, new Map());
    }

    const assignments = this.currentAssignments.get(testId)!;
    const existingAssignment = assignments.get(JSON.stringify(context));

    if (existingAssignment) {
      return test.variants.find(v => v.id === existingAssignment) || null;
    }

    const variant = test.variants.find(v => v.id === variantId) || null;
    if (variant) {
      assignments.set(JSON.stringify(context), variant.id);
    }

    return variant;
  }

  recordImpression(testId: string, variantId: string): void {
    const results = this.results.get(testId);
    if (!results) return;

    let result = results.find(r => r.variantId === variantId);
    if (!result) {
      result = {
        testId,
        variantId,
        impressions: 0,
        successes: 0,
        failures: 0,
        avgResponseTime: 0,
        score: 0,
      };
      results.push(result);
    }

    result.impressions++;
  }

  recordSuccess(
    testId: string,
    variantId: string,
    responseTime: number,
    score: number = 1
  ): void {
    const results = this.results.get(testId);
    if (!results) return;

    let result = results.find(r => r.variantId === variantId);
    if (!result) {
      result = {
        testId,
        variantId,
        impressions: 0,
        successes: 0,
        failures: 0,
        avgResponseTime: 0,
        score: 0,
      };
      results.push(result);
    }

    result.successes++;
    const n = result.successes + result.failures;
    result.avgResponseTime = (result.avgResponseTime * (n - 1) + responseTime) / n;
    result.score = (result.score * (n - 1) + score) / n;
  }

  recordFailure(testId: string, variantId: string, responseTime: number): void {
    const results = this.results.get(testId);
    if (!results) return;

    let result = results.find(r => r.variantId === variantId);
    if (!result) {
      result = {
        testId,
        variantId,
        impressions: 0,
        successes: 0,
        failures: 0,
        avgResponseTime: 0,
        score: 0,
      };
      results.push(result);
    }

    result.failures++;
    const n = result.successes + result.failures;
    result.avgResponseTime = (result.avgResponseTime * (n - 1) + responseTime) / n;
  }

  getStats(testId: string): ABTestStats | null {
    const test = this.tests.get(testId);
    if (!test) return null;

    const results = this.results.get(testId) || [];

    let winner: string | undefined;
    let maxScore = -Infinity;
    let confidence = 0;

    if (results.length > 0) {
      const totalSamples = results.reduce((sum, r) => sum + r.impressions, 0);

      for (const result of results) {
        if (result.score > maxScore) {
          maxScore = result.score;
          winner = result.variantId;
        }
      }

      const winnerResult = results.find(r => r.variantId === winner);
      if (winnerResult && totalSamples > 0) {
        confidence = Math.min(1, winnerResult.impressions / 100);
      }
    }

    return {
      test,
      results,
      winner,
      confidence,
    };
  }

  getAllStats(): ABTestStats[] {
    const stats: ABTestStats[] = [];

    for (const testId of this.tests.keys()) {
      const testStats = this.getStats(testId);
      if (testStats) {
        stats.push(testStats);
      }
    }

    return stats;
  }

  pauseTest(testId: string): boolean {
    const test = this.tests.get(testId);
    if (!test) return false;

    test.status = 'paused';
    return true;
  }

  resumeTest(testId: string): boolean {
    const test = this.tests.get(testId);
    if (!test) return false;

    test.status = 'running';
    return true;
  }

  completeTest(testId: string): boolean {
    const test = this.tests.get(testId);
    if (!test) return false;

    test.status = 'completed';
    test.endTime = Date.now();
    return true;
  }

  deleteTest(testId: string): boolean {
    const deleted = this.tests.delete(testId);
    if (deleted) {
      this.results.delete(testId);
      this.currentAssignments.delete(testId);
    }
    return deleted;
  }

  getActiveTests(): ABTest[] {
    return Array.from(this.tests.values()).filter(t => t.status === 'running');
  }

  reset(): void {
    this.tests.clear();
    this.results.clear();
    this.currentAssignments.clear();
  }
}

// 全局A/B测试框架实例
const globalFramework = new ABTestingFramework();

export function getABTestingFramework(): ABTestingFramework {
  return globalFramework;
}

export function resetABTestingFramework(): void {
  globalFramework.reset();
}
