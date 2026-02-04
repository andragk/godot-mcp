/**
 * MCP Server implementation for Godot Engine integration
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { logger, logError } from '../utils/logger.js';
import { GodotClient } from '../bridge/index.js';
/**
 * MCP Server for Godot Engine
 * Provides tool execution and resource management via the MCP protocol
 */
export class GodotMCPServer {
    server;
    godotClient;
    startTime;
    constructor() {
        this.startTime = new Date();
        this.godotClient = new GodotClient({
            port: 7777,
            timeout: 5000,
            maxRetries: 3,
        });
        this.server = new Server({
            name: 'godot-mcp',
            version: '0.1.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupHandlers();
        logger.info('GodotMCPServer initialized');
    }
    /**
     * Setup request handlers for the MCP server
     */
    setupHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            logger.debug('Received list_tools request');
            return {
                tools: [
                    {
                        name: 'ping',
                        description: 'Test connectivity with the Godot bridge',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                    {
                        name: 'get_version',
                        description: 'Get the Godot bridge version',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                    {
                        name: 'health_check',
                        description: 'Check the health status of the Godot bridge',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                ],
            };
        });
        // Execute tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            logger.debug('Received call_tool request', { tool: request.params.name });
            const { name } = request.params;
            try {
                switch (name) {
                    case 'ping': {
                        const result = await this.godotClient.sendRequest('ping');
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(result, null, 2),
                                },
                            ],
                        };
                    }
                    case 'get_version': {
                        const version = await this.godotClient.getVersion();
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: version,
                                },
                            ],
                        };
                    }
                    case 'health_check': {
                        const health = await this.godotClient.healthCheck();
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(health, null, 2),
                                },
                            ],
                        };
                    }
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            }
            catch (error) {
                logError(error instanceof Error ? error : new Error(String(error)), `Tool ${name} failed`);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
    }
    /**
     * Start the MCP server with stdio transport
     */
    async start() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        logger.info('MCP server started with stdio transport');
    }
    /**
     * Stop the MCP server and cleanup resources
     */
    async stop() {
        await this.godotClient.close();
        await this.server.close();
        logger.info('MCP server stopped');
    }
    /**
     * Get server uptime in seconds
     */
    getUptime() {
        return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    }
}
/**
 * Main entry point for the MCP server
 */
async function main() {
    const server = new GodotMCPServer();
    // Handle graceful shutdown
    const shutdown = async () => {
        logger.info('Shutting down...');
        await server.stop();
        process.exit(0);
    };
    process.on('SIGINT', () => {
        void shutdown();
    });
    process.on('SIGTERM', () => {
        void shutdown();
    });
    // Start the server
    await server.start();
}
// Run the server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        logError(error instanceof Error ? error : new Error(String(error)), 'Fatal error');
        process.exit(1);
    });
}
//# sourceMappingURL=mcp-server.js.map