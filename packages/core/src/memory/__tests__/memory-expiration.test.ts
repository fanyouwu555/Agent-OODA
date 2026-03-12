import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryExpirationManager, ExpirationConfig } from '../memory-expiration';
import type { MemoryRepository, MemoryRecord } from '@ooda-agent/storage';

// Mock MemoryRepository
const createMockRepository = (): MemoryRepository & { findAll: () => MemoryRecord[] } => ({
  store: vi.fn(),
  retrieve: vi.fn(),
  findBySession: vi.fn(),
  findAll: vi.fn().mockReturnValue([]),
  search: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
} as any);

describe('MemoryExpirationManager', () => {
  let manager: MemoryExpirationManager;
  let mockRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockRepo = createMockRepository();
    manager = new MemoryExpirationManager(mockRepo, {
      enableAutoCleanup: false, // 禁用自动清理以便手动测试
      defaultTTL: 30 * 24 * 60 * 60 * 1000, // 30天
      maxMemoryCount: 100,
      importanceThreshold: 0.3,
      minAccessCount: 1,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('cleanup', () => {
    it('should clean up expired memories', async () => {
      const now = Date.now();
      const expiredMemory: MemoryRecord = {
        id: '1',
        content: 'Old memory',
        type: 'fact',
        createdAt: now - 31 * 24 * 60 * 60 * 1000, // 31天前
        lastAccessed: now - 31 * 24 * 60 * 60 * 1000,
        importance: 0.5,
        accessCount: 5,
        tags: [],
        source: 'test',
        relatedIds: [],
      };

      mockRepo.findAll.mockReturnValue([expiredMemory]);

      const result = await manager.cleanup();

      expect(result.deleted).toBe(1);
      expect(mockRepo.delete).toHaveBeenCalledWith('1');
    });

    it('should not delete recent memories', async () => {
      const now = Date.now();
      const recentMemory: MemoryRecord = {
        id: '1',
        content: 'Recent memory',
        type: 'fact',
        createdAt: now - 1000, // 1秒前
        lastAccessed: now - 1000,
        importance: 0.5,
        accessCount: 1,
        tags: [],
        source: 'test',
        relatedIds: [],
      };

      mockRepo.findAll.mockReturnValue([recentMemory]);

      const result = await manager.cleanup();

      expect(result.deleted).toBe(0);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('should clean up low importance memories', async () => {
      const now = Date.now();
      const lowImportanceMemory: MemoryRecord = {
        id: '1',
        content: 'Low importance',
        type: 'fact',
        createdAt: now - 8 * 24 * 60 * 60 * 1000, // 8天前
        lastAccessed: now - 8 * 24 * 60 * 60 * 1000,
        importance: 0.2, // 低于阈值 0.3
        accessCount: 0, // 低于阈值 1
        tags: [],
        source: 'test',
        relatedIds: [],
      };

      mockRepo.findAll.mockReturnValue([lowImportanceMemory]);

      const result = await manager.cleanup();

      expect(result.deleted).toBe(1);
    });

    it('should clean up inactive memories', async () => {
      const now = Date.now();
      const inactiveMemory: MemoryRecord = {
        id: '1',
        content: 'Inactive memory',
        type: 'fact',
        createdAt: now - 60 * 24 * 60 * 60 * 1000,
        lastAccessed: now - 31 * 24 * 60 * 60 * 1000, // 31天未访问
        importance: 0.4, // 低于 0.5
        accessCount: 1,
        tags: [],
        source: 'test',
        relatedIds: [],
      };

      mockRepo.findAll.mockReturnValue([inactiveMemory]);

      const result = await manager.cleanup();

      // 可能被多个清理规则同时匹配，所以可能是 1 或更多
      expect(result.deleted).toBeGreaterThanOrEqual(1);
    });

    it('should clean up overflow memories', async () => {
      const now = Date.now();
      const memories: MemoryRecord[] = Array.from({ length: 110 }, (_, i) => ({
        id: String(i),
        content: `Memory ${i}`,
        type: 'fact',
        createdAt: now - i * 1000,
        lastAccessed: now - i * 1000,
        importance: 0.1 + (i / 110) * 0.8, // 从低到高
        accessCount: i % 10,
        tags: [],
        source: 'test',
        relatedIds: [],
      }));

      mockRepo.findAll.mockReturnValue(memories);

      const result = await manager.cleanup();

      expect(result.deleted).toBe(10); // 110 - 100 = 10
    });

    it('should handle cleanup errors gracefully', async () => {
      const now = Date.now();
      const memory: MemoryRecord = {
        id: '1',
        content: 'Test',
        type: 'fact',
        createdAt: now - 31 * 24 * 60 * 60 * 1000,
        lastAccessed: now - 31 * 24 * 60 * 60 * 1000,
        importance: 0.5,
        accessCount: 1,
        tags: [],
        source: 'test',
        relatedIds: [],
      };

      mockRepo.findAll.mockReturnValue([memory]);
      mockRepo.delete.mockImplementation(() => {
        throw new Error('Delete failed');
      });

      const result = await manager.cleanup();

      // 错误被捕获但不会阻止清理完成
      expect(result.deleted).toBe(0);
      // 错误被记录到控制台，但不在结果中返回
    });
  });

  describe('auto cleanup', () => {
    it('should start auto cleanup on initialization when enabled', () => {
      const autoManager = new MemoryExpirationManager(mockRepo, {
        enableAutoCleanup: true,
        cleanupInterval: 1000,
      });

      expect(autoManager).toBeDefined();
      autoManager.stopAutoCleanup();
    });

    it('should trigger cleanup at intervals', async () => {
      const autoManager = new MemoryExpirationManager(mockRepo, {
        enableAutoCleanup: true,
        cleanupInterval: 1000,
      });

      const cleanupSpy = vi.spyOn(autoManager, 'cleanup');
      cleanupSpy.mockResolvedValue({ deleted: 0, archived: 0, errors: [] });

      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(cleanupSpy).toHaveBeenCalled();

      autoManager.stopAutoCleanup();
    });

    it('should stop auto cleanup', () => {
      const autoManager = new MemoryExpirationManager(mockRepo, {
        enableAutoCleanup: true,
        cleanupInterval: 1000,
      });

      autoManager.stopAutoCleanup();

      const cleanupSpy = vi.spyOn(autoManager, 'cleanup');
      vi.advanceTimersByTime(2000);

      expect(cleanupSpy).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return empty stats when no memories', () => {
      mockRepo.findAll.mockReturnValue([]);

      const stats = manager.getStats();

      expect(stats.totalCount).toBe(0);
      expect(stats.byType).toEqual({});
      expect(stats.averageImportance).toBe(0);
    });

    it('should calculate stats correctly', () => {
      const now = Date.now();
      const memories: MemoryRecord[] = [
        {
          id: '1',
          content: 'Fact 1',
          type: 'fact',
          createdAt: now - 1000,
          lastAccessed: now - 1000,
          importance: 0.8,
          accessCount: 5,
          tags: [],
          source: 'test',
          relatedIds: [],
        },
        {
          id: '2',
          content: 'Skill 1',
          type: 'skill',
          createdAt: now - 2000,
          lastAccessed: now - 2000,
          importance: 0.6,
          accessCount: 3,
          tags: [],
          source: 'test',
          relatedIds: [],
        },
      ];

      mockRepo.findAll.mockReturnValue(memories);

      const stats = manager.getStats();

      expect(stats.totalCount).toBe(2);
      expect(stats.byType).toEqual({ fact: 1, skill: 1 });
      expect(stats.averageImportance).toBe(0.7);
    });
  });

  describe('configuration', () => {
    it('should update config', () => {
      manager.updateConfig({
        maxMemoryCount: 200,
        importanceThreshold: 0.5,
      });

      const config = manager.getConfig();
      expect(config.maxMemoryCount).toBe(200);
      expect(config.importanceThreshold).toBe(0.5);
    });

    it('should restart auto cleanup when interval changes', () => {
      const autoManager = new MemoryExpirationManager(mockRepo, {
        enableAutoCleanup: true,
        cleanupInterval: 1000,
      });

      const stopSpy = vi.spyOn(autoManager, 'stopAutoCleanup');
      const startSpy = vi.spyOn(autoManager, 'startAutoCleanup');

      autoManager.updateConfig({ cleanupInterval: 2000 });

      expect(stopSpy).toHaveBeenCalled();
      expect(startSpy).toHaveBeenCalled();

      autoManager.stopAutoCleanup();
    });

    it('should use default config', () => {
      const defaultManager = new MemoryExpirationManager(mockRepo);
      const config = defaultManager.getConfig();

      expect(config.defaultTTL).toBe(30 * 24 * 60 * 60 * 1000);
      expect(config.maxMemoryCount).toBe(10000);
      expect(config.enableAutoCleanup).toBe(true);
    });
  });

  describe('forceCleanup', () => {
    it('should trigger immediate cleanup', async () => {
      const cleanupSpy = vi.spyOn(manager, 'cleanup');
      cleanupSpy.mockResolvedValue({ deleted: 5, archived: 0, errors: [] });

      const result = await manager.forceCleanup();

      expect(cleanupSpy).toHaveBeenCalled();
      expect(result.deleted).toBe(5);
    });
  });
});
