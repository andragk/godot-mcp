/**
 * Tool Execution Service
 * Provides tool listing and execution for the Web UI.
 */
import type { GodotClient } from '../bridge/godot-client.js';
export declare class ToolExecutionService {
    private readonly toolRegistry;
    private readonly requestHandler;
    constructor(godotClient: GodotClient);
    listTools(): {
        name: string;
        description: string;
        category: import("../types/tool-registry.js").ToolMetadata["category"];
        securityLevel: import("../types/tool-registry.js").ToolMetadata["securityLevel"];
        version: string;
        inputSchema: {
            type: "object";
            properties: Record<string, unknown>;
            required?: string[];
        };
    }[];
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
}
//# sourceMappingURL=tool-execution-service.d.ts.map