/**
 * Server Lifecycle Manager
 * Handles server startup, shutdown, health checks, and signal handling
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
/**
 * Server health status
 */
export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    timestamp: string;
    version: string;
    components: {
        mcp: 'ok' | 'error';
        godotBridge: 'ok' | 'error' | 'unknown';
        toolRegistry: 'ok' | 'error';
    };
}
/**
 * Lifecycle Manager for MCP Server
 */
export declare class LifecycleManager {
    private readonly server;
    private readonly healthCheckFn?;
    private static signalsRegistered;
    private readonly startTime;
    private isShuttingDown;
    private readonly version;
    private readonly exitOnShutdown;
    private readonly registerSignalHandlers;
    constructor(server: Server, healthCheckFn?: (() => Promise<boolean>) | undefined, options?: {
        exitOnShutdown?: boolean;
        registerSignalHandlers?: boolean;
    });
    /**
     * Initialize server and setup signal handlers
     */
    initialize(): Promise<void>;
    /**
     * Start the MCP server
     */
    start(): Promise<void>;
    /**
     * Graceful shutdown
     */
    shutdown(): Promise<void>;
    /**
     * Get server health status
     */
    getHealthStatus(): Promise<HealthStatus>;
    /**
     * Get server uptime in milliseconds
     */
    getUptime(): number;
    /**
     * Get server version
     */
    getVersion(): string;
    /**
     * Check if server is shutting down
     */
    isShuttingDownStatus(): boolean;
    /**
     * Setup signal handlers for graceful shutdown
     */
    private setupSignalHandlers;
}
//# sourceMappingURL=lifecycle-manager.d.ts.map