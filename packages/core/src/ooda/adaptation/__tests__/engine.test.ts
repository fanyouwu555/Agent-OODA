import { AdaptationEngine } from '../engine';
import { getDefaultAdaptationStrategies } from '../strategies';

describe('AdaptationEngine', () => {
  describe('initialization', () => {
    it('should create engine with default strategies', () => {
      const engine = new AdaptationEngine(getDefaultAdaptationStrategies());
      const strategies = engine.getStrategies();
      expect(strategies.length).toBeGreaterThan(0);
    });

    it('should create empty engine', () => {
      const engine = new AdaptationEngine();
      const strategies = engine.getStrategies();
      expect(strategies.length).toBe(0);
    });
  });

  describe('strategy management', () => {
    it('should register strategies', () => {
      const engine = new AdaptationEngine();
      engine.registerStrategy({
        id: 'test-strategy',
        name: 'Test Strategy',
        type: 'cache',
        trigger: 'threshold',
        threshold: {
          metric: 'latency',
          operator: '>',
          value: 1000,
        },
      });

      const strategies = engine.getStrategies();
      expect(strategies.length).toBe(1);
      expect(strategies[0].id).toBe('test-strategy');
    });

    it('should enable and disable strategies', () => {
      const engine = new AdaptationEngine();
      engine.registerStrategy({
        id: 'test-strategy',
        name: 'Test Strategy',
        type: 'cache',
      });

      engine.disableStrategy('test-strategy');
      expect(engine.getStrategy('test-strategy')?.enabled).toBe(false);

      engine.enableStrategy('test-strategy');
      expect(engine.getStrategy('test-strategy')?.enabled).toBe(true);
    });

    it('should unregister strategies', () => {
      const engine = new AdaptationEngine();
      engine.registerStrategy({
        id: 'test-strategy',
        name: 'Test Strategy',
        type: 'cache',
      });

      const removed = engine.unregisterStrategy('test-strategy');
      expect(removed).toBe(true);
      expect(engine.getStrategy('test-strategy')).toBeUndefined();
    });
  });

  describe('metrics aggregation', () => {
    it('should return empty metrics when no data', () => {
      const engine = new AdaptationEngine();
      const metrics = engine.getAggregatedMetricsSnapshot();
      expect(metrics.latency).toBe(0);
      expect(metrics.errorRate).toBe(0);
    });

    it('should aggregate metrics', () => {
      const engine = new AdaptationEngine();

      engine.analyzeAndAdapt({
        latency: 100,
        errorRate: 0.1,
        successRate: 0.9,
        cacheHitRate: 0.5,
        retryCount: 1,
        toolUsage: {},
      });

      engine.analyzeAndAdapt({
        latency: 200,
        errorRate: 0.2,
        successRate: 0.8,
        cacheHitRate: 0.6,
        retryCount: 2,
        toolUsage: {},
      });

      const metrics = engine.getAggregatedMetricsSnapshot();
      expect(metrics.latency).toBe(150);
      expect(metrics.errorRate).toBeCloseTo(0.15, 5);
    });
  });

  describe('threshold triggering', () => {
    it('should trigger when threshold exceeded', async () => {
      const engine = new AdaptationEngine([
        {
          id: 'slow-threshold',
          name: 'Slow Threshold',
          type: 'cache',
          trigger: 'threshold',
          enabled: true,
          threshold: {
            metric: 'latency',
            operator: '>',
            value: 100,
          },
          config: {},
        },
      ]);

      const result = await engine.analyzeAndAdapt({
        latency: 150,
        errorRate: 0,
        successRate: 1,
        cacheHitRate: 0,
        retryCount: 0,
        toolUsage: {},
      });

      expect(result?.applied).toBe(true);
      expect(result?.strategy.id).toBe('slow-threshold');
    });

    it('should not trigger when threshold not exceeded', async () => {
      const engine = new AdaptationEngine([
        {
          id: 'slow-threshold',
          name: 'Slow Threshold',
          type: 'cache',
          trigger: 'threshold',
          enabled: true,
          threshold: {
            metric: 'latency',
            operator: '>',
            value: 200,
          },
          config: {},
        },
      ]);

      const result = await engine.analyzeAndAdapt({
        latency: 150,
        errorRate: 0,
        successRate: 1,
        cacheHitRate: 0,
        retryCount: 0,
        toolUsage: {},
      });

      expect(result).toBeNull();
    });
  });

  describe('cooldown', () => {
    it('should not trigger during cooldown', async () => {
      const engine = new AdaptationEngine([
        {
          id: 'test-strategy',
          name: 'Test Strategy',
          type: 'cache',
          trigger: 'threshold',
          enabled: true,
          threshold: {
            metric: 'latency',
            operator: '>',
            value: 50,
          },
          config: {},
        },
      ]);
      engine.setCooldownPeriod(10000);

      const result1 = await engine.analyzeAndAdapt({
        latency: 100,
        errorRate: 0,
        successRate: 1,
        cacheHitRate: 0,
        retryCount: 0,
        toolUsage: {},
      });
      expect(result1?.applied).toBe(true);

      const result2 = await engine.analyzeAndAdapt({
        latency: 100,
        errorRate: 0,
        successRate: 1,
        cacheHitRate: 0,
        retryCount: 0,
        toolUsage: {},
      });
      expect(result2).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      const engine = new AdaptationEngine([
        {
          id: 'test-strategy',
          name: 'Test Strategy',
          type: 'cache',
        },
      ]);

      engine.analyzeAndAdapt({
        latency: 100,
        errorRate: 0,
        successRate: 1,
        cacheHitRate: 0,
        retryCount: 0,
        toolUsage: {},
      });

      engine.reset();

      expect(engine.getStrategies().length).toBe(0);
      expect(engine.getHistory().length).toBe(0);
    });
  });
});
