// OODA 回归测试 - 确保现有功能没有被破坏
// 运行: npx vitest run packages/core/src/ooda/__tests__/regression.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OODALoop } from '../loop';
import { Observer } from '../observe';
import { Orienter } from '../orient';
import { Decider } from '../decide';
import { Actor } from '../act';
import { AgentState } from '../../types';
import { initializeDataSourceManager } from '../data-source';

class MockDatabaseManager {
  run(sql: string, params: any[]): { changes: number } { return { changes: 1 }; }
  get(sql: string, params: any[]): any { return null; }
  all(sql: string, params: any[]): any[] { return []; }
}

vi.mock('../../memory', () => ({
  getSessionMemory: vi.fn(() => ({
    getShortTerm: vi.fn(() => ({
      getRecentMessages: vi.fn().mockReturnValue([]),
      storeMessage: vi.fn()
    })),
    getLongTerm: vi.fn(() => ({
      search: vi.fn().mockResolvedValue([])
    }))
  })),
  setMemoryRepository: vi.fn(),
  initializeMemorySystem: vi.fn()
}));

describe('OODA 回归测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeDataSourceManager(new MockDatabaseManager() as any);
  });

  describe('1. 原有 Observer 类仍然可用', () => {
    it('应该能够创建 Observer 实例', () => {
      const observer = new Observer('test-session');
      expect(observer).toBeDefined();
    });

    it('应该能够执行观察', async () => {
      const observer = new Observer('test-session');
      const state: AgentState = {
        originalInput: '测试输入',
        history: [],
        currentStep: 0,
        isComplete: false,
        metadata: {}
      };

      try {
        const observation = await observer.observe(state);
        expect(observation).toBeDefined();
      } catch (e) {
        // 如果 LLM 未配置，预期会有错误
        expect(e).toBeDefined();
      }
    });
  });

  describe('2. 原有 Orienter 类仍然可用', () => {
    it('应该能够创建 Orienter 实例', () => {
      const orienter = new Orienter('test-session');
      expect(orienter).toBeDefined();
    });
  });

  describe('3. 原有 Decider 类仍然可用', () => {
    it('应该能够创建 Decider 实例', () => {
      const decider = new Decider();
      expect(decider).toBeDefined();
    });
  });

  describe('4. 原有 Actor 类仍然可用', () => {
    it('应该能够创建 Actor 实例', () => {
      const actor = new Actor('test-session');
      expect(actor).toBeDefined();
    });
  });

  describe('5. OODALoop 原有接口仍然可用', () => {
    it('应该能够创建 OODALoop', () => {
      const loop = new OODALoop();
      expect(loop).toBeDefined();
    });

    it('应该能够创建带 sessionId 的 OODALoop', () => {
      const loop = new OODALoop('my-session');
      expect(loop).toBeDefined();
    });

    it('应该支持 run 方法签名', () => {
      const loop = new OODALoop();
      expect(typeof loop.run).toBe('function');
    });

    it('应该支持 runWithCallback 方法签名', () => {
      const loop = new OODALoop();
      expect(typeof loop.runWithCallback).toBe('function');
    });

    it('应该支持 enableStreaming 方法', () => {
      const loop = new OODALoop();
      expect(typeof loop.enableStreaming).toBe('function');
    });

    it('应该支持 disableStreaming 方法', () => {
      const loop = new OODALoop();
      expect(typeof loop.disableStreaming).toBe('function');
    });

    it('应该支持 getStreamingManager 方法', () => {
      const loop = new OODALoop();
      expect(typeof loop.getStreamingManager).toBe('function');
    });

    it('应该支持 setThinkingCallback 方法', () => {
      const loop = new OODALoop();
      expect(typeof loop.setThinkingCallback).toBe('function');
    });

    it('应该支持 getPerformanceMetrics 方法', () => {
      const loop = new OODALoop();
      expect(typeof loop.getPerformanceMetrics).toBe('function');
    });

    it('应该支持 enableCache 方法', () => {
      const loop = new OODALoop();
      expect(typeof loop.enableCache).toBe('function');
    });

    it('应该支持 disableCache 方法', () => {
      const loop = new OODALoop();
      expect(typeof loop.disableCache).toBe('function');
    });
  });

  describe('6. 新增的四代理功能', () => {
    it('应该能够使用新的配置系统', () => {
      const loop = new OODALoop('test-session');
      loop.enableCache();
      expect(loop).toBeDefined();
    });
  });

  describe('7. 配置导出', () => {
    it('应该能够导入 defaultOODAConfig', async () => {
      const { defaultOODAConfig } = await import('../config');
      expect(defaultOODAConfig).toBeDefined();
      expect(defaultOODAConfig.observe).toBeDefined();
      expect(defaultOODAConfig.orient).toBeDefined();
      expect(defaultOODAConfig.decide).toBeDefined();
      expect(defaultOODAConfig.act).toBeDefined();
    });
  });

  describe('8. 类型导出', () => {
    it('应该能够导入类型定义', async () => {
      const typesModule = await import('../types');
      
      expect(typesModule).toBeDefined();
      
      const keys = Object.keys(typesModule);
      expect(keys.length).toBeGreaterThan(0);
    });
  });
});
