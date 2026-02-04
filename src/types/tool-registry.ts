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
  category: 'connectivity' | 'editor' | 'project' | 'system' | 'node_operations';
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
export class ToolRegistry {
  // Use any for internal storage to avoid variance issues
  private readonly tools = new Map<string, ToolDefinition<any>>();

  /**
   * Register a tool with type safety
   */
  register<TSchema extends z.ZodType>(definition: ToolDefinition<TSchema>): void {
    const { name } = definition.metadata;
    
    if (this.tools.has(name)) {
      throw new Error(`Tool already registered: ${name}`);
    }

    this.tools.set(name, definition);
  }

  /**
   * Get a tool definition by name
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

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
  }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.metadata.name,
      description: tool.metadata.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Get tools by category
   */
  getByCategory(category: ToolMetadata['category']): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(
      (tool) => tool.metadata.category === category
    );
  }

  /**
   * Get tools by security level
   */
  getBySecurityLevel(level: ToolMetadata['securityLevel']): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(
      (tool) => tool.metadata.securityLevel === level
    );
  }
}
