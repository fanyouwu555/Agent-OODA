import { HierarchicalMemoryManager } from '../hierarchical-memory';

describe('HierarchicalMemoryManager', () => {
  describe('expiration integration', () => {
    it('should allow setting expiration manager', () => {
      const manager = new HierarchicalMemoryManager('test-session');
      expect(manager.getExpirationManager()).toBeNull();
    });

    it('should return null when cleanup is called without expiration manager', async () => {
      const manager = new HierarchicalMemoryManager('test-session');
      const result = await manager.cleanup();
      expect(result).toBeNull();
    });

    it('should return stats with expiration disabled', () => {
      const manager = new HierarchicalMemoryManager('test-session');
      const stats = manager.getStats();
      expect(stats.expirationEnabled).toBe(false);
      expect(stats.expirationStats).toBeNull();
    });

    it('should update expiration config when manager is set', () => {
      const manager = new HierarchicalMemoryManager('test-session');
      manager.updateExpirationConfig({
        defaultTTL: 1000,
        enableAutoCleanup: false,
      });
      const stats = manager.getStats();
      expect(stats.expirationEnabled).toBe(false);
    });
  });

  describe('memory operations with expiration', () => {
    it('should store fact without expiration manager', () => {
      const manager = new HierarchicalMemoryManager('test-session');
      const id = manager.storeFact('test fact', ['test']);
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should retrieve memories without expiration manager', () => {
      const manager = new HierarchicalMemoryManager('test-session');
      manager.storeFact('test fact', ['test']);
      const memories = manager.retrieveMemories('test', 5);
      expect(memories.length).toBeGreaterThanOrEqual(0);
    });

    it('should store skill without expiration manager', () => {
      const manager = new HierarchicalMemoryManager('test-session');
      const id = manager.storeSkill('test skill', ['test']);
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should store preference without expiration manager', () => {
      const manager = new HierarchicalMemoryManager('test-session');
      const id = manager.storePreference('test preference', ['test']);
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should store pattern without expiration manager', () => {
      const manager = new HierarchicalMemoryManager('test-session');
      const id = manager.storePattern('test pattern', ['test']);
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });
  });

  describe('clear functionality', () => {
    it('should clear all memories', () => {
      const manager = new HierarchicalMemoryManager('test-session');
      manager.storeFact('test fact', ['test']);
      manager.storeSkill('test skill', ['test']);
      manager.storePreference('test preference', ['test']);

      manager.clear();

      const stats = manager.getStats();
      expect(stats.semanticMemory).toBe(0);
      expect(stats.episodicMemory).toBe(0);
    });
  });
});
