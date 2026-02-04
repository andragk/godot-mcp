/**
 * LRU (Least Recently Used) cache implementation with size limit
 * Thread-safe in-memory cache with automatic eviction
 */
/**
 * LRU cache with size-based eviction
 */
export class LRUCache {
    cache;
    maxSize;
    currentSize;
    metrics;
    onEvict;
    constructor(options) {
        this.cache = new Map();
        this.maxSize = options.maxSize;
        this.currentSize = 0;
        this.metrics = {
            hits: 0,
            misses: 0,
            evictions: 0,
        };
        this.onEvict = options.onEvict;
    }
    /**
     * Get value from cache
     * Updates last accessed time on hit
     */
    get(key) {
        const entry = this.cache.get(key);
        if (entry === undefined) {
            this.metrics.misses++;
            return undefined;
        }
        // Update last accessed time
        entry.lastAccessed = Date.now();
        this.metrics.hits++;
        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.value;
    }
    /**
     * Set value in cache
     * Evicts entries if size limit exceeded
     */
    set(key, value, size) {
        // Remove existing entry if present
        const existing = this.cache.get(key);
        if (existing) {
            this.currentSize -= existing.size;
            this.cache.delete(key);
        }
        // Create new entry
        const entry = {
            value,
            size,
            timestamp: Date.now(),
            lastAccessed: Date.now(),
        };
        // Evict entries if necessary
        while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
            this.evictLRU();
        }
        // Don't cache if single entry exceeds max size
        if (size > this.maxSize) {
            return;
        }
        // Add new entry
        this.cache.set(key, entry);
        this.currentSize += size;
    }
    /**
     * Check if key exists without updating access time
     */
    has(key) {
        return this.cache.has(key);
    }
    /**
     * Delete entry from cache
     */
    delete(key) {
        const entry = this.cache.get(key);
        if (entry === undefined) {
            return false;
        }
        this.currentSize -= entry.size;
        this.cache.delete(key);
        return true;
    }
    /**
     * Clear all entries
     */
    clear() {
        this.cache.clear();
        this.currentSize = 0;
        this.metrics.evictions += this.cache.size;
    }
    /**
     * Get cache metrics
     */
    getMetrics() {
        const total = this.metrics.hits + this.metrics.misses;
        const hitRatio = total > 0 ? this.metrics.hits / total : 0;
        return {
            hits: this.metrics.hits,
            misses: this.metrics.misses,
            evictions: this.metrics.evictions,
            currentSize: this.currentSize,
            entryCount: this.cache.size,
            hitRatio,
        };
    }
    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics.hits = 0;
        this.metrics.misses = 0;
        this.metrics.evictions = 0;
    }
    /**
     * Get all cache keys
     */
    keys() {
        return Array.from(this.cache.keys());
    }
    /**
     * Get cache entries (for debugging)
     */
    entries() {
        return Array.from(this.cache.entries());
    }
    /**
     * Evict least recently used entry
     */
    evictLRU() {
        // Map iterates in insertion order, first entry is LRU
        const firstKey = this.cache.keys().next().value;
        if (firstKey === undefined) {
            return;
        }
        const entry = this.cache.get(firstKey);
        if (entry === undefined) {
            return;
        }
        this.cache.delete(firstKey);
        this.currentSize -= entry.size;
        this.metrics.evictions++;
        if (this.onEvict) {
            this.onEvict(firstKey, entry);
        }
    }
    /**
     * Invalidate entries older than timestamp
     */
    invalidateOlderThan(timestamp) {
        let invalidated = 0;
        for (const [key, entry] of this.cache.entries()) {
            if (entry.timestamp < timestamp) {
                this.delete(key);
                invalidated++;
            }
        }
        return invalidated;
    }
    /**
     * Get cache size in bytes
     */
    getCurrentSize() {
        return this.currentSize;
    }
    /**
     * Get maximum cache size
     */
    getMaxSize() {
        return this.maxSize;
    }
    /**
     * Get number of entries
     */
    getEntryCount() {
        return this.cache.size;
    }
}
//# sourceMappingURL=lru-cache.js.map