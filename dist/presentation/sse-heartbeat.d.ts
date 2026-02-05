/**
 * Heartbeat callback function type
 */
export type HeartbeatCallback = () => void;
/**
 * SSE Heartbeat configuration
 */
export interface SSEHeartbeatConfig {
    /**
     * Interval between heartbeats in milliseconds
     * @default 30000 (30 seconds)
     */
    interval?: number;
    /**
     * Custom heartbeat message
     * @default ': heartbeat\n\n'
     */
    message?: string;
}
/**
 * Manages periodic heartbeat for SSE connections
 */
export declare class SSEHeartbeat {
    private readonly interval;
    private readonly message;
    private timer;
    private isRunning;
    private heartbeatCount;
    private readonly callbacks;
    constructor(config?: SSEHeartbeatConfig);
    /**
     * Subscribe to heartbeat events
     */
    subscribe(callback: HeartbeatCallback): void;
    /**
     * Unsubscribe from heartbeat events
     */
    unsubscribe(callback: HeartbeatCallback): void;
    /**
     * Start the heartbeat interval
     */
    start(): void;
    /**
     * Stop the heartbeat interval
     */
    stop(): void;
    /**
     * Send heartbeat to all subscribers
     */
    private sendHeartbeat;
    /**
     * Get heartbeat statistics
     */
    getStats(): {
        isRunning: boolean;
        interval: number;
        heartbeatsSent: number;
        subscribers: number;
    };
    /**
     * Get the heartbeat message
     */
    getMessage(): string;
}
//# sourceMappingURL=sse-heartbeat.d.ts.map