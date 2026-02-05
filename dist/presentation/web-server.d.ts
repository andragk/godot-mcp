import { GodotClient } from '../bridge/index.js';
/**
 * Web server for dashboard and API endpoints
 */
export declare class WebServer {
    private readonly app;
    private readonly godotClient;
    private readonly serverManager;
    private readonly sseClientManager;
    private readonly sseHeartbeat;
    private readonly toolExecutionService;
    private isBroadcastingLog;
    private readonly startTime;
    private server;
    constructor(godotClient: GodotClient);
    /**
     * Setup Express middleware
     */
    private setupMiddleware;
    /**
     * Validate request middleware
     * @param req - Express request
     * @param res - Express response
     * @param next - Next middleware function
     */
    private validateRequest;
    /**
     * Sanitize object properties to prevent XSS
     * @param obj - Object to sanitize
     */
    private sanitizeObject;
    /**
     * Authentication middleware for protected endpoints
     * @param req - Express request
     * @param res - Express response
     * @param next - Next middleware function
     */
    private authenticateRequest;
    /**
     * Setup Express routes
     */
    private setupRoutes;
    private getClientKey;
    private getClientIp;
    private getApiKey;
    private isLocalRequest;
    private isValidApiKey;
    private isTrustedClient;
    private createRateLimiter;
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
     * Setup heartbeat for SSE connections
     */
    private setupHeartbeat;
    /**
     * Map tool execution errors to HTTP status codes
     */
    private mapToolErrorToStatus;
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