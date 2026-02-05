/**
 * MCP Request Handler
 * Handles incoming MCP requests, routes to tools, and builds responses
 */
import { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ToolRegistry } from '../types/tool-registry.js';
/**
 * Request Handler for MCP protocol
 */
export declare class RequestHandler {
    private readonly toolRegistry;
    constructor(toolRegistry: ToolRegistry);
    /**
     * Handle a list_tools request
     * Returns all available tools with their schemas
     */
    handleListTools(): Promise<{
        tools: Array<{
            name: string;
            description: string;
            inputSchema: Record<string, unknown>;
        }>;
    }>;
    /**
     * Handle a call_tool request
     * Routes to the appropriate tool handler and builds response
     */
    handleCallTool(request: CallToolRequest): Promise<CallToolResult>;
    /**
     * Execute tool by name for internal callers (e.g., Web UI)
     */
    executeTool(name: string, args: unknown, correlationId?: string): Promise<{
        success: boolean;
        data?: unknown;
        error?: {
            name: string;
            message: string;
        };
        correlationId: string;
        durationMs: number;
    }>;
    /**
     * Execute tool with validation and timeout handling
     */
    private executeToolByName;
    /**
     * Execute a promise with a timeout
     * @throws TimeoutError if execution exceeds timeout
     */
    private executeWithTimeout;
    /**
     * Sanitize arguments for logging (remove sensitive data)
     */
    private sanitizeArgsForLogging;
    /**
     * Transform error to MCP protocol error format
     */
    transformError(error: Error): {
        code: number;
        message: string;
        data?: unknown;
    };
}
//# sourceMappingURL=request-handler.d.ts.map