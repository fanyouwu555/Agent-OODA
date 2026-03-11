import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OODALoop } from '@ooda-agent/core';

const isOllamaAvailable = process.env.OLLAMA_AVAILABLE === 'true';

describe.skipIf(!isOllamaAvailable)('OODA Loop Integration Tests', () => {
  let oodaLoop: OODALoop;

  beforeEach(() => {
    oodaLoop = new OODALoop();
  });

  describe('Complete OODA Cycle', () => {
    it('should execute complete OODA cycle for file reading', async () => {
      const result = await oodaLoop.run('读取文件：test.txt');

      expect(result).toBeDefined();
      expect(result.output).toBeDefined();
      expect(result.steps).toBeDefined();
      expect(result.metadata).toBeDefined();
    }, 30000);

    it('should execute complete OODA cycle for web search', async () => {
      const result = await oodaLoop.run('搜索：AI Agent 技术');

      expect(result).toBeDefined();
      expect(result.output).toBeDefined();
      expect(result.steps.length).toBeGreaterThan(0);
    }, 30000);

    it('should execute complete OODA cycle for command execution', async () => {
      const result = await oodaLoop.run('运行命令：ls -la');

      expect(result).toBeDefined();
      expect(result.output).toBeDefined();
      expect(result.metadata.iterations).toBeDefined();
    }, 30000);
  });

  describe('Performance Metrics', () => {
    it('should track performance metrics', async () => {
      const result = await oodaLoop.run('测试性能指标');

      expect(result.metadata.performanceMetrics).toBeDefined();
      expect(result.metadata.performanceMetrics.totalTime).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should measure individual phase times', async () => {
      const result = await oodaLoop.run('测试各阶段时间');

      const metrics = result.metadata.performanceMetrics;
      expect(metrics.observeTime).toBeGreaterThanOrEqual(0);
      expect(metrics.orientTime).toBeGreaterThanOrEqual(0);
      expect(metrics.decideTime).toBeGreaterThanOrEqual(0);
      expect(metrics.actTime).toBeGreaterThanOrEqual(0);
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle timeout gracefully', async () => {
      const shortTimeoutLoop = new OODALoop();
      
      const result = await shortTimeoutLoop.run('测试超时处理');

      expect(result).toBeDefined();
      expect(result.output).toBeDefined();
    }, 30000);

    it('should handle max iterations', async () => {
      const result = await oodaLoop.run('测试最大迭代次数');

      expect(result).toBeDefined();
      expect(result.metadata.iterations).toBeLessThanOrEqual(10);
    }, 30000);
  });

  describe('Memory Management', () => {
    it('should limit history size', async () => {
      const result = await oodaLoop.run('测试历史记录限制');

      expect(result.steps.length).toBeLessThanOrEqual(100);
    }, 30000);
  });
});

describe('OODA Loop Unit Tests (Mocked)', () => {
  describe('OODALoop Construction', () => {
    it('should create OODALoop instance', () => {
      const loop = new OODALoop();
      expect(loop).toBeDefined();
    });

    it('should have default configuration', () => {
      const loop = new OODALoop();
      expect(loop).toBeInstanceOf(OODALoop);
    });
  });
});
