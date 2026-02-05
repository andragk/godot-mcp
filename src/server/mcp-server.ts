/**
 * MCP Server implementation for Godot Engine integration
 * Orchestrates MCP protocol handling, tool execution, and resource management
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger, logError } from '../utils/logger.js';
import { generateCorrelationId } from '../utils/correlation-id.js';
import { GodotClient } from '../bridge/index.js';
import { readGodotResource } from '../resources/index.js';
import { EditorControlTools } from '../tools/index.js';
import { toMCPError } from '../types/errors.js';
import { ToolRegistry } from '../types/tool-registry.js';
import { registerAllTools } from './tool-registration.js';
import { RequestHandler } from './request-handler.js';
import { LifecycleManager } from './lifecycle-manager.js';
import { createStdioTransport } from './protocol/stdio-transport.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

/**
 * MCP Server for Godot Engine
 * Orchestrates MCP protocol, tool execution, and resource management
 */
export class GodotMCPServer {
  private readonly server: Server;
  private readonly godotClient: GodotClient;
  private readonly editorTools: EditorControlTools;
  private readonly toolRegistry: ToolRegistry;
  private readonly requestHandler: RequestHandler;
  private readonly lifecycleManager: LifecycleManager;

  constructor(options?: { exitOnShutdown?: boolean; registerSignalHandlers?: boolean }) {
    // Initialize core dependencies
    this.godotClient = new GodotClient({
      port: 7777,
      timeout: 5000,
    });
    this.editorTools = new EditorControlTools(this.godotClient);
    this.toolRegistry = new ToolRegistry();

    // Initialize MCP server
    this.server = new Server(
      {
        name: 'godot-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    // Initialize request handler
    this.requestHandler = new RequestHandler(this.toolRegistry);

    // Initialize lifecycle manager with health check
    this.lifecycleManager = new LifecycleManager(
      this.server,
      async () => {
        const health = await this.godotClient.healthCheck();
        return health.status === 'healthy';
      },
      {
        exitOnShutdown: options?.exitOnShutdown ?? false,
        registerSignalHandlers: options?.registerSignalHandlers ?? true,
      }
    );

    // Setup server
    this.registerTools();
    this.registerResources();
    this.setupHandlers();
    
    logger.info('GodotMCPServer initialized');
  }

  /**
   * Register all available tools using centralized registration
   */
  private registerTools(): void {
    registerAllTools(this.toolRegistry, this.godotClient, this.editorTools);
    
    logger.info('Registered tools', { 
      count: this.toolRegistry.getToolNames().length 
    });
  }

  /**
   * Register MCP resources with godot:// URI scheme
   */
  private registerResources(): void {
    // Register resource URI template for godot:// scheme
    // The SDK will handle listing and reading via our callbacks
    
    logger.info('Registered Godot resources with godot:// URI scheme');
  }

  /**
   * Setup request handlers for the MCP server
   */
  private setupHandlers(): void {
    // Tool handlers (delegated to RequestHandler)
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const correlationId = generateCorrelationId();
      logger.debug('Received list_tools request', { correlationId });
      
      return this.requestHandler.handleListTools();
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const result = await this.requestHandler.handleCallTool(request);
      return result;
    });

    // Resource handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const correlationId = generateCorrelationId();
      logger.debug('Received list_resources request', { correlationId });

      return {
        resources: [
          {
            uri: 'godot://{projectPath}/project',
            name: 'Project Configuration',
            description: 'Read project.godot configuration file',
            mimeType: 'text/plain',
          },
          {
            uri: 'godot://{projectPath}/scenes/',
            name: 'Scene List',
            description: 'List all scene files in the project',
            mimeType: 'application/json',
          },
          {
            uri: 'godot://{projectPath}/scenes/{scenePath}',
            name: 'Scene File',
            description: 'Read a specific scene file',
            mimeType: 'application/x-godot-scene',
          },
          {
            uri: 'godot://{projectPath}/scripts/',
            name: 'Script List',
            description: 'List all script files in the project',
            mimeType: 'application/json',
          },
          {
            uri: 'godot://{projectPath}/scripts/{scriptPath}',
            name: 'Script File',
            description: 'Read a specific GDScript file',
            mimeType: 'text/x-gdscript',
          },
          {
            uri: 'godot://{projectPath}/nodes/{scenePath}/{nodePath}',
            name: 'Scene Node',
            description: 'Read properties of a specific node in a scene',
            mimeType: 'application/json',
          },
        ],
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const correlationId = generateCorrelationId();
      const { uri } = request.params;

      logger.debug('Received read_resource request', { 
        uri, 
        correlationId 
      });

      try {
        logger.info('Reading resource', { uri, correlationId });
        
        const content = await readGodotResource(uri);
        
        logger.info('Resource read successfully', {
          correlationId,
          uri,
          mimeType: content.mimeType,
        });

        return {
          contents: [
            content.text 
              ? { uri: content.uri, mimeType: content.mimeType, text: content.text }
              : { uri: content.uri, mimeType: content.mimeType, blob: content.blob! }
          ],
        };
      } catch (error) {
        const mcpError = toMCPError(error, correlationId);
        logError(mcpError, `Resource read failed for ${uri}`, { correlationId, uri });
        throw mcpError;
      }
    });
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start(transport?: Transport): Promise<void> {
    // Initialize lifecycle manager
    await this.lifecycleManager.initialize();
    await this.lifecycleManager.start();
    
    // Create and connect transport
    const activeTransport = transport ?? createStdioTransport();
    await this.server.connect(activeTransport);
    
    logger.info('MCP server started with stdio transport', {
      version: this.lifecycleManager.getVersion(),
    });
  }

  /**
   * Stop the MCP server and cleanup resources
   */
  async stop(): Promise<void> {
    logger.info('Stopping MCP server');
    
    await this.godotClient.close();
    await this.lifecycleManager.shutdown();
  }

  /**
   * Get server health status
   */
  async getHealthStatus() {
    return await this.lifecycleManager.getHealthStatus();
  }

  /**
   * Get server uptime in milliseconds
   */
  getUptime(): number {
    return this.lifecycleManager.getUptime();
  }

  /**
   * Get server version
   */
  getVersion(): string {
    return this.lifecycleManager.getVersion();
  }
}

/**
 * Main entry point for the MCP server
 */
async function main(): Promise<void> {
  const server = new GodotMCPServer({ exitOnShutdown: true, registerSignalHandlers: true });

  // Start the server (lifecycle manager handles shutdown signals)
  await server.start();
}

// Run the server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logError(error instanceof Error ? error : new Error(String(error)), 'Fatal error');
    process.exit(1);
  });
}
