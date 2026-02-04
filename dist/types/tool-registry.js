/**
 * Type-safe tool registry
 */
export class ToolRegistry {
    // Use any for internal storage to avoid variance issues
    tools = new Map();
    /**
     * Register a tool with type safety
     */
    register(definition) {
        const { name } = definition.metadata;
        if (this.tools.has(name)) {
            throw new Error(`Tool already registered: ${name}`);
        }
        this.tools.set(name, definition);
    }
    /**
     * Get a tool definition by name
     */
    get(name) {
        return this.tools.get(name);
    }
    /**
     * Check if a tool exists
     */
    has(name) {
        return this.tools.has(name);
    }
    /**
     * Get all tool names
     */
    getToolNames() {
        return Array.from(this.tools.keys());
    }
    /**
     * Get all tools for MCP list_tools response
     */
    getAllTools() {
        return Array.from(this.tools.values()).map((tool) => ({
            name: tool.metadata.name,
            description: tool.metadata.description,
            inputSchema: tool.inputSchema,
        }));
    }
    /**
     * Get tools by category
     */
    getByCategory(category) {
        return Array.from(this.tools.values()).filter((tool) => tool.metadata.category === category);
    }
    /**
     * Get tools by security level
     */
    getBySecurityLevel(level) {
        return Array.from(this.tools.values()).filter((tool) => tool.metadata.securityLevel === level);
    }
}
//# sourceMappingURL=tool-registry.js.map