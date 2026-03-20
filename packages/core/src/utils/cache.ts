// packages/core/src/utils/cache.ts
// LRU (Least Recently Used) Cache 实现，支持 TTL 过期和 onEvict 回调

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessTime: number;
}

export interface LRUCacheOptions<T> {
  maxSize: number;
  ttl?: number;
  onEvict?: (key: string, value: T) => void;
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private defaultTTL: number;
  private onEvict?: (key: string, value: T) => void;
  private hits = 0;
  private misses = 0;

  constructor(options: LRUCacheOptions<T>);
  constructor(maxSize: number, defaultTTL?: number, onEvict?: (key: string, value: T) => void);
  constructor(arg1: number | LRUCacheOptions<T>, arg2?: number, arg3?: (key: string, value: unknown) => void) {
    if (typeof arg1 === 'object') {
      this.maxSize = arg1.maxSize;
      this.defaultTTL = arg1.ttl || 60000;
      this.onEvict = arg1.onEvict;
    } else {
      this.maxSize = arg1;
      this.defaultTTL = arg2 || 60000;
      this.onEvict = arg3 as (key: string, value: T) => void;
    }
  }

  get(key: string): T | undefined {
    if (!this.cache.has(key)) {
      this.misses++;
      return undefined;
    }

    const entry = this.cache.get(key)!;

    if (this.isExpired(entry)) {
      this.evict(key, entry.value);
      this.misses++;
      return undefined;
    }

    this.hits++;
    entry.accessCount++;
    entry.lastAccessTime = Date.now();

    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    this.evictIfNeeded();

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
      accessCount: 0,
      lastAccessTime: Date.now(),
    });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.evict(key, entry.value);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.evict(key, entry.value);
      return true;
    }
    return false;
  }

  clear(): void {
    for (const [key, entry] of this.cache.entries()) {
      this.evict(key, entry.value);
    }
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  size(): number {
    return this.cache.size;
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    const toRemove: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        toRemove.push(key);
      }
    }

    for (const key of toRemove) {
      const entry = this.cache.get(key);
      if (entry) {
        this.cache.delete(key);
        this.evict(key, entry.value);
        removed++;
      }
    }

    return removed;
  }

  getStats(): { size: number; maxSize: number; hitRate: number; hits: number; misses: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? this.hits / total : 0,
      hits: this.hits,
      misses: this.misses,
    };
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private evictIfNeeded(): void {
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        const entry = this.cache.get(firstKey)!;
        this.evict(firstKey, entry.value);
        this.cache.delete(firstKey);
      }
    }
  }

  private evict(key: string, value: T): void {
    if (this.onEvict) {
      this.onEvict(key, value);
    }
  }
}

export default LRUCache;
