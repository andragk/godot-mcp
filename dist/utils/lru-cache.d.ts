/**
 * LRU (Least Recently Used) cache implementation with size limit
 * Thread-safe in-memory cache with automatic eviction
 */
export interface CacheEntry<T> {
    value: T;
    size: number;
    timestamp: number;
    lastAccessed: number;
}
export interface CacheMetrics {
    hits: number;
    misses: number;
    evictions: number;
    currentSize: number;
    entryCount: number;
    hitRatio: number;
}
export interface CacheOptions {
    maxSize: number;
    onEvict?: (key: string, entry: CacheEntry<unknown>) => void;
}
/**
 * LRU cache with size-based eviction
 */
export declare class LRUCache<T> {
    private cache;
    private readonly maxSize;
    private currentSize;
    private metrics;
    private readonly onEvict?;
    constructor(options: CacheOptions);
    /**
     * Get value from cache
     * Updates last accessed time on hit
     */
    get(key: string): T | undefined;
    /**
     * Set value in cache
     * Evicts entries if size limit exceeded
     */
    set(key: string, value: T, size: number): void;
    /**
     * Check if key exists without updating access time
     */
    has(key: string): boolean;
    /**
     * Delete entry from cache
     */
    delete(key: string): boolean;
    /**
     * Clear all entries
     */
    clear(): void;
    /**
     * Get cache metrics
     */
    getMetrics(): CacheMetrics;
    /**
     * Reset metrics
     */
    resetMetrics(): void;
    /**
     * Get all cache keys
     */
    keys(): string[];
    /**
     * Get cache entries (for debugging)
     */
    entries(): Array<[string, CacheEntry<T>]>;
    /**
     * Evict least recently used entry
     */
    private evictLRU;
    /**
     * Invalidate entries older than timestamp
     */
    invalidateOlderThan(timestamp: number): number;
    /**
     * Get cache size in bytes
     */
    getCurrentSize(): number;
    /**
     * Get maximum cache size
     */
    getMaxSize(): number;
    /**
     * Get number of entries
     */
    getEntryCount(): number;
}
//# sourceMappingURL=lru-cache.d.ts.map