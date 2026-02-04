/**
 * Core type definitions for the Godot MCP server
 */
export * from './errors.js';
export * from './tool-registry.js';
/**
 * JSON-RPC 2.0 request structure
 */
export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: unknown;
}
/**
 * JSON-RPC 2.0 response structure
 */
export interface JsonRpcResponse<T = unknown> {
    jsonrpc: '2.0';
    id: string | number;
    result?: T;
    error?: JsonRpcError;
}
/**
 * JSON-RPC 2.0 error structure
 */
export interface JsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}
/**
 * Godot bridge health status
 */
export interface BridgeHealth {
    status: 'healthy' | 'unhealthy' | 'degraded';
    port: number;
    uptime: number;
    lastCheck: Date;
    version?: string;
}
/**
 * Server configuration
 */
export interface ServerConfig {
    godotBridgeUrl: string;
    godotBridgePort: number;
    webServerPort: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    requestTimeout: number;
    maxRetries: number;
}
/**
 * Log entry structure for SSE streaming
 */
export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    context?: Record<string, unknown>;
}
/**
 * Server status information
 */
export interface ServerStatus {
    uptime: number;
    bridgeConnected: boolean;
    activeSessions: number;
    lastActivity: Date;
}
//# sourceMappingURL=index.d.ts.map