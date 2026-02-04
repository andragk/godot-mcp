import type { BridgeHealth } from '../types/index.js';
/**
 * Configuration for the Godot bridge client
 */
interface GodotClientConfig {
    baseUrl: string;
    port: number;
    timeout: number;
    maxRetries: number;
    retryDelay: number;
    circuitBreakerThreshold: number;
    circuitBreakerTimeout: number;
}
/**
 * Client for communicating with the Godot bridge HTTP server
 */
export declare class GodotClient {
    private readonly config;
    private readonly pool;
    private circuitState;
    private failureCount;
    private lastFailureTime;
    private requestIdCounter;
    constructor(config?: Partial<GodotClientConfig>);
    /**
     * Send a JSON-RPC request to the Godot bridge
     * @param method - RPC method name
     * @param params - Optional method parameters
     * @returns Promise resolving to the RPC response
     */
    sendRequest<T = unknown>(method: string, params?: unknown): Promise<T>;
    /**
     * Execute a single HTTP request to the bridge
     * @param rpcRequest - JSON-RPC request object
     * @returns Promise resolving to the response result
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
     * Handle successful request
     */
    private onSuccess;
    /**
     * Handle failed request
     */
    private onFailure;
    /**
     * Sleep for a specified duration
     * @param ms - Milliseconds to sleep
     */
    private sleep;
    /**
     * Close the client and cleanup resources
     */
    close(): Promise<void>;
}
export {};
//# sourceMappingURL=godot-client.d.ts.map