import type { BridgeHealth } from '../types/index.js';
import { EventEmitter } from 'node:events';
/**
 * Circuit breaker states
 */
declare enum CircuitState {
    CLOSED = "CLOSED",
    OPEN = "OPEN",
    HALF_OPEN = "HALF_OPEN"
}
/**
 * Circuit breaker events
 */
export declare enum CircuitBreakerEvent {
    STATE_CHANGE = "circuit:state-change",
    OPENED = "circuit:opened",
    HALF_OPENED = "circuit:half-opened",
    CLOSED = "circuit:closed",
    FAILURE = "circuit:failure",
    SUCCESS = "circuit:success"
}
/**
 * Retry strategy configuration
 */
interface RetryStrategy {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    jitterFactor: number;
    retryableErrors: Set<string>;
}
/**
 * Connection pool configuration
 */
interface PoolConfig {
    connections: number;
    pipelining: number;
    keepAliveTimeout: number;
    keepAliveMaxTimeout: number;
}
/**
 * Circuit breaker metrics
 */
interface CircuitMetrics {
    totalOpens: number;
    totalHalfOpens: number;
    successfulRecoveries: number;
    totalRequests: number;
    totalFailures: number;
    totalSuccesses: number;
    currentFailureStreak: number;
    currentSuccessStreak: number;
    lastStateChange: Date;
}
/**
 * Pool health metrics
 */
interface PoolMetrics {
    activeConnections: number;
    queuedRequests: number;
    totalRequests: number;
    utilization: number;
}
/**
 * Configuration for the Godot bridge client
 */
interface GodotClientConfig {
    baseUrl: string;
    port: number;
    timeout: number;
    retryStrategy: RetryStrategy;
    poolConfig: PoolConfig;
    circuitBreaker: {
        failureThreshold: number;
        successThreshold: number;
        timeout: number;
    };
}
/**
 * Request options
 */
interface RequestOptions {
    correlationId?: string;
    timeout?: number;
    retryable?: boolean;
}
/**
 * Client for communicating with the Godot bridge HTTP server
 */
export declare class GodotClient extends EventEmitter {
    private readonly config;
    private readonly pool;
    private circuitState;
    private readonly metrics;
    private requestIdCounter;
    private readonly poolMetrics;
    private isClosing;
    constructor(config?: Partial<GodotClientConfig>);
    /**
     * Get sanitized configuration summary for logging
     */
    private getConfigSummary;
    /**
     * Send a JSON-RPC request to the Godot bridge
     * @param method - RPC method name
     * @param params - Optional method parameters
     * @param options - Request options
     * @returns Promise resolving to the RPC response
     */
    sendRequest<T = unknown>(method: string, params?: unknown, options?: RequestOptions): Promise<T>;
    /**
     * Check circuit breaker state and handle transitions
     * @throws {CircuitBreakerError} If circuit is OPEN and timeout not elapsed
     */
    private checkCircuitBreaker;
    /**
     * Execute request with retry logic
     */
    private executeWithRetry;
    /**
     * Execute a single HTTP request to the bridge
     */
    private executeRequest;
    /**
     * Check the health of the Godot bridge
     * @returns Promise resolving to health status
     */
    healthCheck(): Promise<BridgeHealth>;
    /**
     * Get the bridge version information
     * @returns Promise resolving to version string
     */
    getVersion(): Promise<string>;
    /**
     * Transition circuit breaker to new state
     */
    private transitionCircuit;
    /**
     * Handle successful request
     */
    private onSuccess;
    /**
     * Handle failed request
     */
    private onFailure;
    /**
     * Calculate retry delay with exponential backoff and jitter
     */
    private calculateRetryDelay;
    /**
     * Check if request method is idempotent and safe to retry
     */
    private isIdempotent;
    /**
     * Check if error is retryable
     */
    private isErrorRetryable;
    /**
     * Sanitize parameters for logging (remove sensitive data)
     */
    private sanitizeParams;
    /**
     * Update pool utilization metrics
     */
    private updatePoolUtilization;
    /**
     * Sleep for a specified duration
     * @param ms - Milliseconds to sleep
     */
    private sleep;
    /**
     * Get circuit breaker metrics
     */
    getCircuitMetrics(): CircuitMetrics;
    /**
     * Get pool health metrics
     */
    getPoolMetrics(): PoolMetrics;
    /**
     * Get current circuit state
     */
    getCircuitState(): CircuitState;
    /**
     * Reset circuit breaker (for testing/emergency recovery)
     */
    resetCircuit(): void;
    /**
     * Close the client and cleanup resources
     */
    close(): Promise<void>;
}
export {};
//# sourceMappingURL=godot-client.d.ts.map