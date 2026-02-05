/**
 * MCP Server for Godot Engine
 * Orchestrates MCP protocol, tool execution, and resource management
 */
export declare class GodotMCPServer {
    private readonly server;
    private readonly godotClient;
    private readonly editorTools;
    private readonly toolRegistry;
    private readonly requestHandler;
    private readonly lifecycleManager;
    constructor();
    /**
     * Register all available tools using centralized registration
     */
    private registerTools;
    /**
     * Register MCP resources with godot:// URI scheme
     */
    private registerResources;
    /**
     * Setup request handlers for the MCP server
     */
    private setupHandlers;
    /**
     * Start the MCP server with stdio transport
     */
    start(): Promise<void>;
    /**
     * Stop the MCP server and cleanup resources
     */
    stop(): Promise<void>;
    /**
     * Get server health status
     */
    getHealthStatus(): Promise<import("./lifecycle-manager.js").HealthStatus>;
    /**
     * Get server uptime in milliseconds
     */
    getUptime(): number;
    /**
     * Get server version
     */
    getVersion(): string;
}
//# sourceMappingURL=mcp-server.d.ts.map