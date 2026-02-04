/**
 * MCP Server implementation for Godot Engine integration
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger, logError } from '../utils/logger.js';
import { GodotClient } from '../bridge/index.js';
import { EditorControlTools, editorControlTools } from '../tools/index.js';

/**
 * MCP Server for Godot Engine
 * Provides tool execution and resource management via the MCP protocol
 */
export class GodotMCPServer {
  private readonly server: Server;
  private readonly godotClient: GodotClient;
  private readonly editorTools: EditorControlTools;
  private readonly startTime: Date;

  constructor() {
    this.startTime = new Date();
    this.godotClient = new GodotClient({
      port: 7777,
      timeout: 5000,
      maxRetries: 3,
    });
    this.editorTools = new EditorControlTools(this.godotClient);

    this.server = new Server(
      {
        name: 'godot-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    logger.info('GodotMCPServer initialized');
  }

  /**
   * Setup request handlers for the MCP server
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('Received list_tools request');

      return {
        tools: [
          // Basic connectivity tools
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
          // Editor control tools
          ...editorControlTools,
        ],
      };
    });

    // Execute tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      logger.debug('Received call_tool request', { tool: request.params.name });

      const { name, arguments: args = {} } = request.params;

      try {
        let result: unknown;

        switch (name) {
          // Basic connectivity tools
          case 'ping': {
            result = await this.godotClient.sendRequest<{ status: string }>('ping');
            break;
          }

          case 'get_version': {
            result = await this.godotClient.getVersion();
            break;
          }

          case 'health_check': {
            result = await this.godotClient.healthCheck();
            break;
          }

          // Editor control tools
          case 'launch_godot_editor': {
            result = await this.editorTools.launchEditor(args as never);
            break;
          }

          case 'run_godot_project': {
            result = await this.editorTools.runProject(args as never);
            break;
          }

          case 'stop_godot_execution': {
            result = await this.editorTools.stopExecution(args as never);
            break;
          }

          case 'get_godot_version': {
            result = await this.editorTools.getVersion(args as never);
            break;
          }

          case 'list_godot_projects': {
            result = await this.editorTools.listProjects(args as never);
            break;
          }

          case 'analyze_project': {
            result = await this.editorTools.analyzeProject(args as never);
            break;
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
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
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP server started with stdio transport');
  }

  /**
   * Stop the MCP server and cleanup resources
   */
  async stop(): Promise<void> {
    await this.godotClient.close();
    await this.server.close();
    logger.info('MCP server stopped');
  }

  /**
   * Get server uptime in seconds
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }
}

/**
 * Main entry point for the MCP server
 */
async function main(): Promise<void> {
  const server = new GodotMCPServer();

  // Handle graceful shutdown
  const shutdown = async (): Promise<void> => {
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
