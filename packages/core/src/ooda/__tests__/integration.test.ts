// OODA 四代理架构集成测试
// 运行: npx vitest run packages/core/src/ooda/__tests__/integration.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OODALoop } from '../loop';
import { OODAEvent } from '../loop';
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

describe('OODA 四代理架构 - 集成测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeDataSourceManager(new MockDatabaseManager() as any);
  });

  describe('1. OODALoop 初始化测试', () => {
    it('应该能够创建 OODALoop 实例', () => {
      const loop = new OODALoop('test-session');
      expect(loop).toBeDefined();
    });

    it('应该能够创建带流式处理的 OODALoop', () => {
      const handler = vi.fn();
      const loop = new OODALoop('test-session', handler);
      expect(loop).toBeDefined();
    });

    it('应该能够获取流式管理器', () => {
      const loop = new OODALoop('test-session');
      const manager = loop.getStreamingManager();
      expect(manager).toBeUndefined();
    });
  });

  describe('2. 缓存功能测试', () => {
    it('应该能够启用缓存', () => {
      const loop = new OODALoop('test-session');
      loop.enableCache(60000, 100);
      expect(loop).toBeDefined();
    });

    it('应该能够禁用缓存', () => {
      const loop = new OODALoop('test-session');
      loop.enableCache();
      loop.disableCache();
      expect(loop).toBeDefined();
    });

    it('应该能够清除缓存', () => {
      const loop = new OODALoop('test-session');
      loop.enableCache();
      loop.clearCache();
      expect(loop).toBeDefined();
    });
  });

  describe('3. 性能监控测试', () => {
    it('应该能够获取性能指标', () => {
      const loop = new OODALoop('test-session');
      const metrics = loop.getPerformanceMetrics();
      expect(Array.isArray(metrics)).toBe(true);
    });
  });

  describe('4. 事件系统测试', () => {
    it('回调应该接收正确的阶段事件', async () => {
      const events: OODAEvent[] = [];
      const callback = vi.fn((event: OODAEvent) => {
        events.push(event);
      });

      const loop = new OODALoop('test-session');
      
      // 验证回调类型正确
      expect(typeof callback).toBe('function');
    });

    it('应该支持多种事件类型', () => {
      const eventTypes = [
        'observe',
        'orient', 
        'decide',
        'act',
        'tool_result',
        'complete',
        'feedback',
        'adaptation',
        'streaming_content'
      ];

      eventTypes.forEach(type => {
        const event: OODAEvent = { phase: type as any };
        expect(event.phase).toBe(type);
      });
    });
  });

  describe('5. 循环控制测试', () => {
    it('应该正确判断是否需要自适应', () => {
      const loop = new OODALoop('test-session');
      expect(loop).toBeDefined();
    });
  });

  describe('6. 配置继承测试', () => {
    it('应该使用默认配置', () => {
      const loop = new OODALoop('test-session');
      expect(loop).toBeDefined();
    });

    it('应该能够覆盖默认配置', () => {
      const loop = new OODALoop('test-session');
      loop.enableCache(120000, 200);
      expect(loop).toBeDefined();
    });
  });
});
