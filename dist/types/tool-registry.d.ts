/**
 * Type-safe tool registry for MCP server
 */
import type { z } from 'zod';
/**
 * Tool metadata
 */
export interface ToolMetadata {
    name: string;
    version: string;
    category: 'connectivity' | 'editor' | 'project' | 'system' | 'node_operations' | 'scene_operations';
    securityLevel: 'safe' | 'requires-review' | 'privileged';
    description: string;
}
/**
 * Tool definition with schema and handler
 */
export interface ToolDefinition<TSchema extends z.ZodType = z.ZodType> {
    metadata: ToolMetadata;
    schema: TSchema;
    handler: (args: z.infer<TSchema>, correlationId: string) => Promise<unknown>;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}
/**
 * Type-safe tool registry
 */
export declare class ToolRegistry {
    private readonly tools;
    /**
     * Register a tool with type safety
     */
    register<TSchema extends z.ZodType>(definition: ToolDefinition<TSchema>): void;
    /**
     * Get a tool definition by name
     */
    get(name: string): ToolDefinition | undefined;
    /**
     * Check if a tool exists
     */
    has(name: string): boolean;
    /**
     * Get all tool names
     */
    getToolNames(): string[];
    /**
     * Get all tools for MCP list_tools response
     */
    getAllTools(): Array<{
        name: string;
        description: string;
        inputSchema: {
            type: 'object';
            properties: Record<string, unknown>;
            required?: string[];
        };
    }>;
    /**
     * Get tools by category
     */
    getByCategory(category: ToolMetadata['category']): ToolDefinition[];
    /**
     * Get tools by security level
     */
    getBySecurityLevel(level: ToolMetadata['securityLevel']): ToolDefinition[];
}
//# sourceMappingURL=tool-registry.d.ts.map