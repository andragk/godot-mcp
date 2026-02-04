/**
 * MCP Server implementation for Godot Engine integration
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { logger, logError } from '../utils/logger.js';
import { generateCorrelationId } from '../utils/correlation-id.js';
import { GodotClient } from '../bridge/index.js';
import { readGodotResource } from '../resources/index.js';
import { 
  EditorControlTools, 
  LaunchEditorSchema,
  RunProjectSchema,
  StopExecutionSchema,
  GetVersionSchema,
  ListProjectsSchema,
  AnalyzeProjectSchema,
} from '../tools/index.js';
import {
  listScenes,
  readScene,
  listScripts,
  readScript,
  getProjectStructure,
  ListScenesInputSchema,
  ReadSceneInputSchema,
  ListScriptsInputSchema,
  ReadScriptInputSchema,
  GetProjectStructureInputSchema,
  getCacheMetrics,
} from '../tools/read-tools.js';
import {
  searchNodes,
  getNodeProperties,
} from '../tools/node-operations.js';
import {
  ValidationError,
  ToolNotFoundError,
  toMCPError,
} from '../types/errors.js';
import { ToolRegistry } from '../types/tool-registry.js';

/**
 * Empty schema for tools with no arguments
 */
const EmptySchema = z.object({});

/**
 * Schema for search_nodes tool
 */
const SearchNodesInputSchema = z.object({
  projectPath: z.string().describe('Absolute path to the Godot project directory'),
  name: z.string().optional().describe('Node name pattern (exact, prefix, regex, or contains)'),
  type: z.string().optional().describe('Node type filter (e.g., Node2D, Control, Sprite2D)'),
  property: z.record(z.unknown()).optional().describe('Property filter (e.g., {"visible": true, "position.x": ">100"})'),
  mode: z.enum(['exact', 'prefix', 'regex', 'contains']).optional().default('contains').describe('Search mode for name matching'),
  operator: z.enum(['AND', 'OR']).optional().default('AND').describe('Combine multiple criteria with AND or OR'),
  limit: z.number().optional().default(100).describe('Maximum number of results to return'),
  offset: z.number().optional().default(0).describe('Offset for pagination'),
  scenes: z.array(z.string()).optional().describe('Specific scene paths to search (relative to project root)'),
});

/**
 * Schema for get_node_properties tool
 */
const GetNodePropertiesInputSchema = z.object({
  projectPath: z.string().describe('Absolute path to the Godot project directory'),
  scenePath: z.string().describe('Scene file path (relative to project root)'),
  nodePath: z.string().describe('Node path within the scene hierarchy (e.g., "Player/Sprite2D")'),
});

/**
 * MCP Server for Godot Engine
 * Provides tool execution and resource management via the MCP protocol
 */
export class GodotMCPServer {
  private readonly server: Server;
  private readonly godotClient: GodotClient;
  private readonly editorTools: EditorControlTools;
  private readonly toolRegistry: ToolRegistry;
  private readonly startTime: Date;

  constructor() {
    this.startTime = new Date();
    this.godotClient = new GodotClient({
      port: 7777,
      timeout: 5000,
    });
    this.editorTools = new EditorControlTools(this.godotClient);
    this.toolRegistry = new ToolRegistry();

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

    this.registerTools();
    this.registerResources();
    this.setupHandlers();
    logger.info('GodotMCPServer initialized');
  }

  /**
   * Register all available tools in the registry
   */
  private registerTools(): void {
    // Basic connectivity tools
    this.toolRegistry.register({
      metadata: {
        name: 'ping',
        version: '1.0.0',
        category: 'connectivity',
        securityLevel: 'safe',
        description: 'Test connectivity with the Godot bridge',
      },
      schema: EmptySchema,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async (_args, correlationId) => {
        logger.debug('Executing ping', { correlationId });
        const result = await this.godotClient.sendRequest<{ status: string }>('ping');
        return result;
      },
    });

    this.toolRegistry.register({
      metadata: {
        name: 'get_version',
        version: '1.0.0',
        category: 'connectivity',
        securityLevel: 'safe',
        description: 'Get the Godot bridge version',
      },
      schema: EmptySchema,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async (_args, correlationId) => {
        logger.debug('Executing get_version', { correlationId });
        const result = await this.godotClient.getVersion();
        return result;
      },
    });

    this.toolRegistry.register({
      metadata: {
        name: 'health_check',
        version: '1.0.0',
        category: 'connectivity',
        securityLevel: 'safe',
        description: 'Check the health status of the Godot bridge',
      },
      schema: EmptySchema,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async (_args, correlationId) => {
        logger.debug('Executing health_check', { correlationId });
        const result = await this.godotClient.healthCheck();
        return result;
      },
    });

    // Editor control tools
    this.toolRegistry.register({
      metadata: {
        name: 'launch_godot_editor',
        version: '1.0.0',
        category: 'editor',
        securityLevel: 'requires-review',
        description: 'Launch Godot editor for a specific project',
      },
      schema: LaunchEditorSchema,
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: 'Absolute path to the Godot project directory',
          },
          editorPath: {
            type: 'string',
            description: 'Optional path to Godot editor executable',
          },
          additionalArgs: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional command-line arguments',
          },
        },
        required: ['projectPath'],
      },
      handler: async (args, correlationId) => {
        logger.info('Executing launch_godot_editor', { correlationId, projectPath: args.projectPath });
        return await this.editorTools.launchEditor(args);
      },
    });

    this.toolRegistry.register({
      metadata: {
        name: 'run_godot_project',
        version: '1.0.0',
        category: 'project',
        securityLevel: 'requires-review',
        description: 'Run a Godot project in debug or release mode',
      },
      schema: RunProjectSchema,
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: 'Absolute path to the Godot project directory',
          },
          scene: {
            type: 'string',
            description: 'Optional specific scene to run',
          },
          debug: {
            type: 'boolean',
            description: 'Run in debug mode (default: true)',
            default: true,
          },
        },
        required: ['projectPath'],
      },
      handler: async (args, correlationId) => {
        logger.info('Executing run_godot_project', { correlationId, projectPath: args.projectPath });
        return await this.editorTools.runProject(args);
      },
    });

    this.toolRegistry.register({
      metadata: {
        name: 'stop_godot_execution',
        version: '1.0.0',
        category: 'project',
        securityLevel: 'privileged',
        description: 'Stop a running Godot process by process ID',
      },
      schema: StopExecutionSchema,
      inputSchema: {
        type: 'object',
        properties: {
          processId: {
            type: 'number',
            description: 'Process ID to terminate',
          },
          force: {
            type: 'boolean',
            description: 'Force kill if graceful stop fails',
            default: false,
          },
        },
        required: ['processId'],
      },
      handler: async (args, correlationId) => {
        logger.info('Executing stop_godot_execution', { correlationId, processId: args.processId });
        return await this.editorTools.stopExecution(args);
      },
    });

    this.toolRegistry.register({
      metadata: {
        name: 'get_godot_version',
        version: '1.0.0',
        category: 'system',
        securityLevel: 'safe',
        description: 'Get Godot engine version information',
      },
      schema: GetVersionSchema,
      inputSchema: {
        type: 'object',
        properties: {
          editorPath: {
            type: 'string',
            description: 'Optional path to Godot editor executable',
          },
        },
      },
      handler: async (args, correlationId) => {
        logger.debug('Executing get_godot_version', { correlationId });
        return await this.editorTools.getVersion(args);
      },
    });

    this.toolRegistry.register({
      metadata: {
        name: 'list_godot_projects',
        version: '1.0.0',
        category: 'project',
        securityLevel: 'safe',
        description: 'Discover Godot projects in specified directories',
      },
      schema: ListProjectsSchema,
      inputSchema: {
        type: 'object',
        properties: {
          searchPaths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Directories to search for Godot projects',
          },
          recursive: {
            type: 'boolean',
            description: 'Search subdirectories',
            default: false,
          },
        },
        required: ['searchPaths'],
      },
      handler: async (args, correlationId) => {
        logger.info('Executing list_godot_projects', { correlationId, searchPaths: args.searchPaths });
        return await this.editorTools.listProjects(args);
      },
    });

    this.toolRegistry.register({
      metadata: {
        name: 'analyze_project',
        version: '1.0.0',
        category: 'project',
        securityLevel: 'safe',
        description: 'Analyze Godot project structure and configuration',
      },
      schema: AnalyzeProjectSchema,
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: 'Absolute path to the Godot project directory',
          },
        },
        required: ['projectPath'],
      },
      handler: async (args, correlationId) => {
        logger.info('Executing analyze_project', { correlationId, projectPath: args.projectPath });
        return await this.editorTools.analyzeProject(args);
      },
    });

    // Read tools for project introspection
    this.toolRegistry.register({
      metadata: {
        name: 'list_scenes',
        version: '1.0.0',
        category: 'project',
        securityLevel: 'safe',
        description: 'List all scene files (.tscn) in the project',
      },
      schema: ListScenesInputSchema,
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: 'Absolute path to Godot project directory',
          },
          directory: {
            type: 'string',
            description: 'Subdirectory to search within (relative to project)',
          },
          sortBy: {
            type: 'string',
            enum: ['path', 'size', 'modified'],
            description: 'Sort criteria',
            default: 'path',
          },
          ascending: {
            type: 'boolean',
            description: 'Sort order',
            default: true,
          },
        },
        required: ['projectPath'],
      },
      handler: async (args, correlationId) => {
        logger.info('Executing list_scenes', { correlationId, projectPath: args.projectPath });
        return await listScenes(args);
      },
    });

    this.toolRegistry.register({
      metadata: {
        name: 'read_scene',
        version: '1.0.0',
        category: 'project',
        securityLevel: 'safe',
        description: 'Read and parse a Godot scene file (.tscn)',
      },
      schema: ReadSceneInputSchema,
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: 'Absolute path to Godot project directory',
          },
          scenePath: {
            type: 'string',
            description: 'Path to scene file (relative to project or absolute)',
          },
        },
        required: ['projectPath', 'scenePath'],
      },
      handler: async (args, correlationId) => {
        logger.info('Executing read_scene', { correlationId, scenePath: args.scenePath });
        return await readScene(args);
      },
    });

    this.toolRegistry.register({
      metadata: {
        name: 'list_scripts',
        version: '1.0.0',
        category: 'project',
        securityLevel: 'safe',
        description: 'List all GDScript files (.gd) in the project',
      },
      schema: ListScriptsInputSchema,
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: 'Absolute path to Godot project directory',
          },
          directory: {
            type: 'string',
            description: 'Subdirectory to search within',
          },
          pattern: {
            type: 'string',
            description: 'Filename pattern to match (regex)',
          },
          sortBy: {
            type: 'string',
            enum: ['path', 'size', 'modified', 'lines'],
            description: 'Sort criteria',
            default: 'path',
          },
        },
        required: ['projectPath'],
      },
      handler: async (args, correlationId) => {
        logger.info('Executing list_scripts', { correlationId, projectPath: args.projectPath });
        return await listScripts(args);
      },
    });

    this.toolRegistry.register({
      metadata: {
        name: 'read_script',
        version: '1.0.0',
        category: 'project',
        securityLevel: 'safe',
        description: 'Read and analyze a GDScript file (.gd)',
      },
      schema: ReadScriptInputSchema,
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: 'Absolute path to Godot project directory',
          },
          scriptPath: {
            type: 'string',
            description: 'Path to script file (relative to project or absolute)',
          },
          includeAnalysis: {
            type: 'boolean',
            description: 'Include code analysis metadata',
            default: true,
          },
        },
        required: ['projectPath', 'scriptPath'],
      },
      handler: async (args, correlationId) => {
        logger.info('Executing read_script', { correlationId, scriptPath: args.scriptPath });
        return await readScript(args);
      },
    });

    this.toolRegistry.register({
      metadata: {
        name: 'get_project_structure',
        version: '1.0.0',
        category: 'project',
        securityLevel: 'safe',
        description: 'Get complete project directory structure and statistics',
      },
      schema: GetProjectStructureInputSchema,
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: 'Absolute path to Godot project directory',
          },
          maxDepth: {
            type: 'number',
            description: 'Maximum directory depth to traverse',
            default: 5,
          },
          includeStats: {
            type: 'boolean',
            description: 'Include file statistics',
            default: true,
          },
        },
        required: ['projectPath'],
      },
      handler: async (args, correlationId) => {
        logger.info('Executing get_project_structure', { correlationId, projectPath: args.projectPath });
        return await getProjectStructure(args);
      },
    });

    this.toolRegistry.register({
      metadata: {
        name: 'get_cache_metrics',
        version: '1.0.0',
        category: 'system',
        securityLevel: 'safe',
        description: 'Get cache performance metrics (hit ratio, size, evictions)',
      },
      schema: EmptySchema,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async (_args, correlationId) => {
        logger.debug('Executing get_cache_metrics', { correlationId });
        return getCacheMetrics();
      },
    });

    // Node Operations Tools
    this.toolRegistry.register({
      metadata: {
        name: 'search_nodes',
        version: '1.0.0',
        category: 'node_operations',
        securityLevel: 'safe',
        description: 'Search for nodes across project scenes using flexible query patterns (name, type, properties)',
      },
      schema: SearchNodesInputSchema,
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: 'Absolute path to the Godot project directory',
          },
          name: {
            type: 'string',
            description: 'Node name pattern (exact, prefix, regex, or contains)',
          },
          type: {
            type: 'string',
            description: 'Node type filter (e.g., Node2D, Control, Sprite2D)',
          },
          property: {
            type: 'object',
            description: 'Property filter (e.g., {"visible": true, "position.x": ">100"})',
          },
          mode: {
            type: 'string',
            enum: ['exact', 'prefix', 'regex', 'contains'],
            default: 'contains',
            description: 'Search mode for name matching',
          },
          operator: {
            type: 'string',
            enum: ['AND', 'OR'],
            default: 'AND',
            description: 'Combine multiple criteria with AND or OR',
          },
          limit: {
            type: 'number',
            default: 100,
            description: 'Maximum number of results to return',
          },
          offset: {
            type: 'number',
            default: 0,
            description: 'Offset for pagination',
          },
          scenes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific scene paths to search (relative to project root)',
          },
        },
        required: ['projectPath'],
      },
      handler: async (args, correlationId) => {
        logger.info('Executing search_nodes', { correlationId, projectPath: args.projectPath });
        return await searchNodes(args.projectPath, args);
      },
    });

    this.toolRegistry.register({
      metadata: {
        name: 'get_node_properties',
        version: '1.0.0',
        category: 'node_operations',
        securityLevel: 'safe',
        description: 'Get comprehensive properties and metadata for a specific node within a scene',
      },
      schema: GetNodePropertiesInputSchema,
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: 'Absolute path to the Godot project directory',
          },
          scenePath: {
            type: 'string',
            description: 'Scene file path (relative to project root)',
          },
          nodePath: {
            type: 'string',
            description: 'Node path within the scene hierarchy (e.g., "Player/Sprite2D")',
          },
        },
        required: ['projectPath', 'scenePath', 'nodePath'],
      },
      handler: async (args, correlationId) => {
        logger.info('Executing get_node_properties', { 
          correlationId, 
          projectPath: args.projectPath,
          scenePath: args.scenePath,
          nodePath: args.nodePath 
        });
        return await getNodeProperties(args.projectPath, args.scenePath, args.nodePath);
      },
    });

    logger.info('Registered tools', { count: this.toolRegistry.getToolNames().length });
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
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const correlationId = generateCorrelationId();
      logger.debug('Received list_tools request', { correlationId });

      return {
        tools: this.toolRegistry.getAllTools(),
      };
    });

    // Execute tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const correlationId = generateCorrelationId();
      const { name, arguments: args = {} } = request.params;

      logger.debug('Received call_tool request', { 
        tool: name, 
        correlationId,
        hasArgs: Object.keys(args).length > 0,
      });

      try {
        // Validate tool exists
        const toolDefinition = this.toolRegistry.get(name);
        if (!toolDefinition) {
          throw new ToolNotFoundError(name, correlationId);
        }

        // Validate arguments with Zod
        const validationResult = toolDefinition.schema.safeParse(args);
        if (!validationResult.success) {
          const issues = validationResult.error.issues.map((issue) => ({
            path: issue.path.map(String),
            message: issue.message,
          }));
          
          logger.warn('Tool argument validation failed', {
            correlationId,
            tool: name,
            issues,
          });

          throw new ValidationError(
            `Invalid arguments for tool ${name}`,
            correlationId,
            undefined,
            issues
          );
        }

        // Execute tool with validated arguments
        const result = await toolDefinition.handler(validationResult.data, correlationId);

        logger.info('Tool executed successfully', {
          correlationId,
          tool: name,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        // Convert to MCPError for consistent handling
        const mcpError = toMCPError(error, correlationId);

        // Log error with full details (including stack trace)
        logError(
          mcpError,
          `Tool ${name} failed`,
          {
            correlationId,
            tool: name,
            errorCode: mcpError.code,
            statusCode: mcpError.statusCode,
          }
        );

        // Return sanitized error to client
        const clientError = mcpError.toClientError();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(clientError, null, 2),
            },
          ],
          isError: true,
        };
      }
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const correlationId = generateCorrelationId();
      logger.debug('Received list_resources request', { correlationId });

      // Return static list of resource URI templates
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

    // Read resource content
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
