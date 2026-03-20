import { LRUCache } from '../cache';

describe('LRUCache', () => {
  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      const cache = new LRUCache<string>(3);
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      const cache = new LRUCache<string>(3);
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should return correct size', () => {
      const cache = new LRUCache<string>(3);
      expect(cache.size()).toBe(0);
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
    });

    it('should return correct has() result', () => {
      const cache = new LRUCache<string>(3);
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should delete values correctly', () => {
      const cache = new LRUCache<string>(3);
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.delete('key1')).toBe(false);
    });

    it('should clear all values', () => {
      const cache = new LRUCache<string>(3);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used when max size is reached', () => {
      const cache = new LRUCache<string>(3);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key4')).toBe('value4');
    });

    it('should update recently used order on get', () => {
      const cache = new LRUCache<string>(3);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.get('key1');

      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeUndefined();
    });

    it('should update recently used order on set of existing key', () => {
      const cache = new LRUCache<string>(3);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.set('key1', 'value1Updated');

      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('value1Updated');
      expect(cache.get('key2')).toBeUndefined();
    });

    it('should handle maxSize of 1', () => {
      const cache = new LRUCache<string>(1);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      const cache = new LRUCache<string>({ maxSize: 10, ttl: 50 });
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      await new Promise(resolve => setTimeout(resolve, 60));

      expect(cache.get('key1')).toBeUndefined();
    });

    it('should accept custom TTL per entry', async () => {
      const cache = new LRUCache<string>({ maxSize: 10, ttl: 1000 });
      cache.set('key1', 'value1', 50);
      expect(cache.get('key1')).toBe('value1');

      await new Promise(resolve => setTimeout(resolve, 60));

      expect(cache.get('key1')).toBeUndefined();
    });

    it('should has() return false for expired entries', async () => {
      const cache = new LRUCache<string>({ maxSize: 10, ttl: 50 });
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 60));

      expect(cache.has('key1')).toBe(false);
    });

    it('should cleanup() remove expired entries', async () => {
      const cache = new LRUCache<string>({ maxSize: 10, ttl: 50 });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      await new Promise(resolve => setTimeout(resolve, 60));

      const removed = cache.cleanup();
      expect(removed).toBe(2);
      expect(cache.size()).toBe(0);
    });
  });

  describe('onEvict callback', () => {
    it('should call onEvict when entries are evicted due to size', () => {
      const evicted: Array<{ key: string; value: string }> = [];
      const cache = new LRUCache<string>({
        maxSize: 2,
        onEvict: (key, value) => evicted.push({ key, value }),
      });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      expect(evicted).toEqual([{ key: 'key1', value: 'value1' }]);
    });

    it('should call onEvict when entries are evicted due to TTL', async () => {
      const evicted: Array<{ key: string; value: string }> = [];
      const cache = new LRUCache<string>({
        maxSize: 10,
        ttl: 50,
        onEvict: (key, value) => evicted.push({ key, value }),
      });

      cache.set('key1', 'value1');
      await new Promise(resolve => setTimeout(resolve, 60));
      cache.get('key1');

      expect(evicted).toEqual([{ key: 'key1', value: 'value1' }]);
    });

    it('should call onEvict when entries are deleted', () => {
      const evicted: Array<{ key: string; value: string }> = [];
      const cache = new LRUCache<string>({
        maxSize: 10,
        onEvict: (key, value) => evicted.push({ key, value }),
      });

      cache.set('key1', 'value1');
      cache.delete('key1');

      expect(evicted).toEqual([{ key: 'key1', value: 'value1' }]);
    });

    it('should call onEvict for all entries on clear', () => {
      const evicted: Array<{ key: string; value: string }> = [];
      const cache = new LRUCache<string>({
        maxSize: 10,
        onEvict: (key, value) => evicted.push({ key, value }),
      });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      expect(evicted).toEqual([
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' },
      ]);
    });
  });

  describe('stats', () => {
    it('should track hits and misses', () => {
      const cache = new LRUCache<string>(3);
      cache.set('key1', 'value1');

      cache.get('key1');
      cache.get('key1');
      cache.get('nonexistent');

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.667, 2);
    });

    it('should calculate hit rate correctly', () => {
      const cache = new LRUCache<string>(3);

      cache.get('nonexistent');
      cache.get('nonexistent');

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it('should reset stats on clear', () => {
      const cache = new LRUCache<string>(3);
      cache.set('key1', 'value1');
      cache.get('key1');
      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('constructor overloads', () => {
    it('should work with number constructor', () => {
      const cache = new LRUCache<string>(5, 1000);
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });

    it('should work with options object', () => {
      const cache = new LRUCache<string>({ maxSize: 5, ttl: 1000 });
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });
  });
});
