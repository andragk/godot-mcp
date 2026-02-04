import { EventEmitter } from 'node:events';
export type ServerState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
export interface ServerProcessInfo {
    state: ServerState;
    pid?: number;
    startedAt?: Date;
    stoppedAt?: Date;
    uptime?: number;
    restartCount: number;
    lastError?: string;
}
/**
 * Events emitted by the process manager
 */
export declare enum ServerLifecycleEvent {
    STARTED = "server:started",
    STOPPED = "server:stopped",
    ERROR = "server:error",
    OUTPUT = "server:output"
}
/**
 * Process manager for MCP server
 */
export declare class MCPServerProcessManager extends EventEmitter {
    private process;
    private state;
    private startedAt;
    private stoppedAt;
    private restartCount;
    private lastError;
    private isRestarting;
    private startInProgress;
    /**
     * Start the MCP server process
     */
    start(): Promise<void>;
    /**
     * Stop the MCP server process
     */
    stop(force?: boolean): Promise<void>;
    /**
     * Restart the MCP server
     */
    restart(): Promise<void>;
    /**
     * Get current server process information
     */
    getInfo(): ServerProcessInfo;
    /**
     * Check if server is running
     */
    isRunning(): boolean;
    /**
     * Setup process event handlers
     */
    private setupProcessHandlers;
    /**
     * Wait for server to be ready
     */
    private waitForReady;
    /**
     * Wait for process to exit
     */
    private waitForExit;
}
//# sourceMappingURL=server-process-manager.d.ts.map