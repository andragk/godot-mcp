/**
 * MCP Server for Godot Engine
 * Provides tool execution and resource management via the MCP protocol
 */
export declare class GodotMCPServer {
    private readonly server;
    private readonly godotClient;
    private readonly editorTools;
    private readonly toolRegistry;
    private readonly startTime;
    constructor();
    /**
     * Register all available tools in the registry
     */
    private registerTools;
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
     * Get server uptime in seconds
     */
    getUptime(): number;
}
//# sourceMappingURL=mcp-server.d.ts.map