import { GodotClient } from '../bridge/index.js';
/**
 * Web server for dashboard and API endpoints
 */
export declare class WebServer {
    private readonly app;
    private readonly godotClient;
    private readonly sseClients;
    private readonly startTime;
    private server;
    constructor(godotClient: GodotClient);
    /**
     * Setup Express middleware
     */
    private setupMiddleware;
    /**
     * Setup Express routes
     */
    private setupRoutes;
    /**
     * Setup log streaming to SSE clients
     */
    private setupLogStreaming;
    /**
     * Broadcast a log entry to all connected SSE clients
     * @param entry - Log entry to broadcast
     */
    private broadcastLog;
    /**
     * Send a log entry to a specific SSE client
     * @param client - SSE client
     * @param entry - Log entry
     */
    private sendLogToClient;
    /**
     * Get server uptime in seconds
     */
    private getUptime;
    /**
     * Start the web server
     * @param port - Port to listen on
     */
    start(port: number): Promise<void>;
    /**
     * Stop the web server
     */
    stop(): Promise<void>;
}
//# sourceMappingURL=web-server.d.ts.map