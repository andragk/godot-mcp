import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LRUCache } from '../../src/utils/lru-cache.js';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>({ maxSize: 100 });
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1', 10);
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check key existence', () => {
      cache.set('key1', 'value1', 10);
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should delete entries', () => {
      cache.set('key1', 'value1', 10);
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.delete('key1')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1', 10);
      cache.set('key2', 'value2', 10);
      cache.clear();
      expect(cache.getEntryCount()).toBe(0);
      expect(cache.getCurrentSize()).toBe(0);
    });
  });

  describe('size management', () => {
    it('should track current cache size', () => {
      cache.set('key1', 'value1', 20);
      cache.set('key2', 'value2', 30);
      expect(cache.getCurrentSize()).toBe(50);
    });

    it('should update size when replacing entry', () => {
      cache.set('key1', 'value1', 20);
      cache.set('key1', 'newvalue', 30);
      expect(cache.getCurrentSize()).toBe(30);
      expect(cache.getEntryCount()).toBe(1);
    });

    it('should not cache entries larger than max size', () => {
      cache.set('large', 'x'.repeat(1000), 150);
      expect(cache.get('large')).toBeUndefined();
      expect(cache.getCurrentSize()).toBe(0);
    });

    it('should maintain max size limit', () => {
      expect(cache.getMaxSize()).toBe(100);
    });

    it('should count entries correctly', () => {
      cache.set('key1', 'value1', 10);
      cache.set('key2', 'value2', 10);
      cache.set('key3', 'value3', 10);
      expect(cache.getEntryCount()).toBe(3);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entry when size exceeded', () => {
      cache.set('key1', 'value1', 40);
      cache.set('key2', 'value2', 40);
      cache.set('key3', 'value3', 40); // Should evict key1

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });

    it('should evict multiple entries if needed', () => {
      cache.set('key1', 'value1', 30);
      cache.set('key2', 'value2', 30);
      cache.set('key3', 'value3', 30);
      cache.set('large', 'largevalue', 70); // Should evict key1 and key2

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('large')).toBe('largevalue');
    });

    it('should update LRU order on access', () => {
      cache.set('key1', 'value1', 30);
      cache.set('key2', 'value2', 30);
      cache.set('key3', 'value3', 30);

      // Access key1, making it most recently used
      cache.get('key1');

      // Add entry that requires eviction
      cache.set('key4', 'value4', 30); // Should evict key2 (least recently used)

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should call onEvict callback', () => {
      const onEvict = vi.fn();
      const cacheWithCallback = new LRUCache<string>({
        maxSize: 100,
        onEvict,
      });

      cacheWithCallback.set('key1', 'value1', 40);
      cacheWithCallback.set('key2', 'value2', 40);
      cacheWithCallback.set('key3', 'value3', 40); // Should evict key1

      expect(onEvict).toHaveBeenCalledWith('key1', expect.objectContaining({
        value: 'value1',
        size: 40,
      }));
    });
  });

  describe('metrics', () => {
    it('should track cache hits', () => {
      cache.set('key1', 'value1', 10);
      cache.get('key1');
      cache.get('key1');

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(2);
      expect(metrics.misses).toBe(0);
    });

    it('should track cache misses', () => {
      cache.get('nonexistent');
      cache.get('missing');

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(2);
    });

    it('should calculate hit ratio correctly', () => {
      cache.set('key1', 'value1', 10);
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('key2'); // miss

      const metrics = cache.getMetrics();
      expect(metrics.hitRatio).toBeCloseTo(2 / 3, 2);
    });

    it('should track evictions', () => {
      cache.set('key1', 'value1', 40);
      cache.set('key2', 'value2', 40);
      cache.set('key3', 'value3', 40); // Evicts key1
      cache.set('key4', 'value4', 40); // Evicts key2

      const metrics = cache.getMetrics();
      expect(metrics.evictions).toBe(2);
    });

    it('should reset metrics', () => {
      cache.set('key1', 'value1', 10);
      cache.get('key1');
      cache.get('missing');

      cache.resetMetrics();

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.evictions).toBe(0);
    });

    it('should include current size and entry count in metrics', () => {
      cache.set('key1', 'value1', 30);
      cache.set('key2', 'value2', 20);

      const metrics = cache.getMetrics();
      expect(metrics.currentSize).toBe(50);
      expect(metrics.entryCount).toBe(2);
    });
  });

  describe('invalidation', () => {
    it('should invalidate entries older than timestamp', () => {
      const now = Date.now();

      cache.set('old1', 'value1', 10);
      cache.set('old2', 'value2', 10);

      // Wait a bit
      const future = now + 100;

      // Manually set older timestamps (for testing)
      const entries = cache.entries();
      entries[0]![1].timestamp = now - 1000;
      entries[1]![1].timestamp = now - 500;

      cache.set('new', 'value3', 10);

      const invalidated = cache.invalidateOlderThan(future - 50);
      expect(invalidated).toBeGreaterThan(0);
    });

    it('should return count of invalidated entries', () => {
      cache.set('key1', 'value1', 10);
      cache.set('key2', 'value2', 10);

      const count = cache.invalidateOlderThan(Date.now() + 1000);
      expect(count).toBe(2);
      expect(cache.getEntryCount()).toBe(0);
    });
  });

  describe('utility methods', () => {
    it('should return all cache keys', () => {
      cache.set('key1', 'value1', 10);
      cache.set('key2', 'value2', 10);
      cache.set('key3', 'value3', 10);

      const keys = cache.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
      expect(keys.length).toBe(3);
    });

    it('should return cache entries', () => {
      cache.set('key1', 'value1', 10);
      cache.set('key2', 'value2', 20);

      const entries = cache.entries();
      expect(entries.length).toBe(2);
      expect(entries[0]![0]).toBe('key1');
      expect(entries[0]![1].value).toBe('value1');
      expect(entries[0]![1].size).toBe(10);
    });
  });

  describe('edge cases', () => {
    it('should handle zero-size entries', () => {
      cache.set('empty', '', 0);
      expect(cache.get('empty')).toBe('');
      expect(cache.getCurrentSize()).toBe(0);
    });

    it('should handle empty cache operations', () => {
      expect(cache.get('any')).toBeUndefined();
      expect(cache.delete('any')).toBe(false);
      cache.clear(); // Should not throw
      expect(cache.keys()).toEqual([]);
    });

    it('should handle replacing with same size', () => {
      cache.set('key1', 'value1', 10);
      cache.set('key1', 'value2', 10);
      expect(cache.getCurrentSize()).toBe(10);
      expect(cache.get('key1')).toBe('value2');
    });
  });

  describe('timestamp tracking', () => {
    it('should store creation timestamp', () => {
      const before = Date.now();
      cache.set('key1', 'value1', 10);
      const after = Date.now();

      const entries = cache.entries();
      const entry = entries[0]![1];

      expect(entry.timestamp).toBeGreaterThanOrEqual(before);
      expect(entry.timestamp).toBeLessThanOrEqual(after);
    });

    it('should update last accessed time on get', async () => {
      cache.set('key1', 'value1', 10);
      const entries1 = cache.entries();
      const firstAccess = entries1[0]![1].lastAccessed;

      await new Promise((resolve) => setTimeout(resolve, 10));

      cache.get('key1');
      const entries2 = cache.entries();
      const secondAccess = entries2[0]![1].lastAccessed;

      expect(secondAccess).toBeGreaterThan(firstAccess);
    });

    it('should not update timestamp on get', () => {
      cache.set('key1', 'value1', 10);
      const entries1 = cache.entries();
      const originalTimestamp = entries1[0]![1].timestamp;

      cache.get('key1');
      const entries2 = cache.entries();
      const afterGetTimestamp = entries2[0]![1].timestamp;

      expect(afterGetTimestamp).toBe(originalTimestamp);
    });
  });
});
