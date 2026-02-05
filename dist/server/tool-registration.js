/**
 * Tool Registration Module
 * Centralizes all tool registrations for the MCP server
 */
import { z } from 'zod';
import { logger } from '../utils/logger.js';
// Import tool schemas
import { LaunchEditorSchema, RunProjectSchema, StopExecutionSchema, GetVersionSchema, ListProjectsSchema, AnalyzeProjectSchema, } from '../tools/editor-control.js';
import { ListScenesInputSchema, ReadSceneInputSchema, ListScriptsInputSchema, ReadScriptInputSchema, GetProjectStructureInputSchema, listScenes, readScene, listScripts, readScript, getProjectStructure, getCacheMetrics, } from '../tools/read-tools.js';
import { searchNodes, getNodeProperties, } from '../tools/node-operations.js';
import { CreateSceneInputSchema, ModifySceneInputSchema, SceneOperationsTools, } from '../tools/scene-operations.js';
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
 * Register all connectivity tools
 */
export function registerConnectivityTools(registry, godotClient) {
    registry.register({
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
            const result = await godotClient.sendRequest('ping');
            return result;
        },
    });
    registry.register({
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
            const result = await godotClient.getVersion();
            return result;
        },
    });
    registry.register({
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
            const result = await godotClient.healthCheck();
            return result;
        },
    });
}
/**
 * Register all editor control tools
 */
export function registerEditorTools(registry, editorTools) {
    registry.register({
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
            return await editorTools.launchEditor(args);
        },
    });
    registry.register({
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
            return await editorTools.runProject(args);
        },
    });
    registry.register({
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
            return await editorTools.stopExecution(args);
        },
    });
    registry.register({
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
            logger.info('Executing get_godot_version', { correlationId });
            return await editorTools.getVersion(args);
        },
    });
    registry.register({
        metadata: {
            name: 'list_godot_projects',
            version: '1.0.0',
            category: 'system',
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
            logger.info('Executing list_godot_projects', { correlationId });
            return await editorTools.listProjects(args);
        },
    });
    registry.register({
        metadata: {
            name: 'analyze_project',
            version: '1.0.0',
            category: 'system',
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
            return await editorTools.analyzeProject(args);
        },
    });
}
/**
 * Register all read tools
 */
export function registerReadTools(registry) {
    registry.register({
        metadata: {
            name: 'list_scenes',
            version: '1.0.0',
            category: 'project',
            securityLevel: 'safe',
            description: 'List all scene files in a Godot project',
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
    registry.register({
        metadata: {
            name: 'read_scene',
            version: '1.0.0',
            category: 'project',
            securityLevel: 'safe',
            description: 'Read and parse a Godot scene file',
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
                    description: 'Scene file path (relative to project root)',
                },
                includeHierarchy: {
                    type: 'boolean',
                    description: 'Include node hierarchy in response',
                    default: true,
                },
                includeStats: {
                    type: 'boolean',
                    description: 'Include scene statistics',
                    default: false,
                },
            },
            required: ['projectPath', 'scenePath'],
        },
        handler: async (args, correlationId) => {
            logger.info('Executing read_scene', { correlationId, scenePath: args.scenePath });
            return await readScene(args);
        },
    });
    registry.register({
        metadata: {
            name: 'list_scripts',
            version: '1.0.0',
            category: 'project',
            securityLevel: 'safe',
            description: 'List all script files in a Godot project',
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
                    description: 'Subdirectory to search within (relative to project)',
                },
                includeMetadata: {
                    type: 'boolean',
                    description: 'Include script metadata (class name, functions)',
                    default: false,
                },
            },
            required: ['projectPath'],
        },
        handler: async (args, correlationId) => {
            logger.info('Executing list_scripts', { correlationId, projectPath: args.projectPath });
            return await listScripts(args);
        },
    });
    registry.register({
        metadata: {
            name: 'read_script',
            version: '1.0.0',
            category: 'project',
            securityLevel: 'safe',
            description: 'Read and analyze a GDScript file',
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
                    description: 'Script file path (relative to project root)',
                },
                includeMetadata: {
                    type: 'boolean',
                    description: 'Include script metadata analysis',
                    default: true,
                },
                includeComplexity: {
                    type: 'boolean',
                    description: 'Include complexity metrics',
                    default: false,
                },
            },
            required: ['projectPath', 'scriptPath'],
        },
        handler: async (args, correlationId) => {
            logger.info('Executing read_script', { correlationId, scriptPath: args.scriptPath });
            return await readScript(args);
        },
    });
    registry.register({
        metadata: {
            name: 'get_project_structure',
            version: '1.0.0',
            category: 'project',
            securityLevel: 'safe',
            description: 'Get the complete directory structure of a Godot project',
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
                    default: 10,
                },
                includeStats: {
                    type: 'boolean',
                    description: 'Include file/directory statistics',
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
    registry.register({
        metadata: {
            name: 'get_cache_metrics',
            version: '1.0.0',
            category: 'system',
            securityLevel: 'safe',
            description: 'Get cache performance metrics',
        },
        schema: EmptySchema,
        inputSchema: {
            type: 'object',
            properties: {},
        },
        handler: async (_args, correlationId) => {
            logger.info('Executing get_cache_metrics', { correlationId });
            return getCacheMetrics();
        },
    });
}
/**
 * Register node operation tools
 */
export function registerNodeTools(registry) {
    registry.register({
        metadata: {
            name: 'search_nodes',
            version: '1.0.0',
            category: 'node_operations',
            securityLevel: 'safe',
            description: 'Search for nodes across Godot scenes',
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
                    description: 'Property filter (e.g., {"visible": true})',
                },
                mode: {
                    type: 'string',
                    enum: ['exact', 'prefix', 'regex', 'contains'],
                    description: 'Search mode for name matching',
                    default: 'contains',
                },
                operator: {
                    type: 'string',
                    enum: ['AND', 'OR'],
                    description: 'Combine multiple criteria',
                    default: 'AND',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results',
                    default: 100,
                },
                offset: {
                    type: 'number',
                    description: 'Offset for pagination',
                    default: 0,
                },
                scenes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Specific scene paths to search',
                },
            },
            required: ['projectPath'],
        },
        handler: async (args, correlationId) => {
            logger.info('Executing search_nodes', { correlationId, projectPath: args.projectPath });
            return await searchNodes(args.projectPath, args);
        },
    });
    registry.register({
        metadata: {
            name: 'get_node_properties',
            version: '1.0.0',
            category: 'node_operations',
            securityLevel: 'safe',
            description: 'Get all properties of a specific node in a scene',
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
            logger.info('Executing get_node_properties', { correlationId, nodePath: args.nodePath });
            return await getNodeProperties(args.projectPath, args.scenePath, args.nodePath);
        },
    });
}
/**
 * Register scene operations tools
 */
export function registerSceneTools(registry) {
    const sceneOps = new SceneOperationsTools();
    registry.register({
        metadata: {
            name: 'create_scene',
            version: '1.0.0',
            category: 'scene_operations',
            securityLevel: 'requires-review',
            description: 'Create a new Godot scene file with specified node hierarchy',
        },
        schema: CreateSceneInputSchema,
        inputSchema: {
            type: 'object',
            properties: {
                projectPath: {
                    type: 'string',
                    description: 'Absolute path to the Godot project directory',
                },
                scenePath: {
                    type: 'string',
                    description: 'Scene path relative to project root (must end with .tscn)',
                },
                rootNode: {
                    type: 'object',
                    description: 'Root node definition with type, name, properties, and children',
                    properties: {
                        name: { type: 'string', description: 'Node name (valid identifier)' },
                        type: { type: 'string', description: 'Node type (e.g., Node2D, CharacterBody2D)' },
                        properties: { type: 'object', description: 'Node properties' },
                        children: { type: 'array', description: 'Child nodes' },
                    },
                    required: ['name', 'type'],
                },
                format: {
                    type: 'number',
                    description: 'Godot scene format version (default: 3)',
                    default: 3,
                },
                description: {
                    type: 'string',
                    description: 'Optional scene description comment',
                },
            },
            required: ['projectPath', 'scenePath', 'rootNode'],
        },
        handler: async (args, correlationId) => {
            logger.info('Executing create_scene', { correlationId, scenePath: args.scenePath });
            const result = await sceneOps.createScene(args);
            return result;
        },
    });
    registry.register({
        metadata: {
            name: 'modify_scene',
            version: '1.0.0',
            category: 'scene_operations',
            securityLevel: 'requires-review',
            description: 'Modify an existing Godot scene file with operations like add_node, remove_node, modify_property, rename_node, and reparent_node',
        },
        schema: ModifySceneInputSchema,
        inputSchema: {
            type: 'object',
            properties: {
                projectPath: {
                    type: 'string',
                    description: 'Absolute path to the Godot project directory',
                },
                scenePath: {
                    type: 'string',
                    description: 'Scene path relative to project root (must end with .tscn)',
                },
                operations: {
                    type: 'array',
                    description: 'Array of modification operations to apply',
                    items: {
                        oneOf: [
                            {
                                type: 'object',
                                description: 'Add a new node',
                                properties: {
                                    operation: { type: 'string', enum: ['add_node'] },
                                    parentPath: { type: 'string', description: 'Path to parent node (e.g., "." for root, "Player" for child)' },
                                    node: {
                                        type: 'object',
                                        description: 'Node definition',
                                        properties: {
                                            name: { type: 'string', description: 'Node name' },
                                            type: { type: 'string', description: 'Node type' },
                                            properties: { type: 'object', description: 'Node properties' },
                                            children: { type: 'array', description: 'Child nodes' },
                                        },
                                        required: ['name', 'type'],
                                    },
                                },
                                required: ['operation', 'parentPath', 'node'],
                            },
                            {
                                type: 'object',
                                description: 'Remove a node',
                                properties: {
                                    operation: { type: 'string', enum: ['remove_node'] },
                                    nodePath: { type: 'string', description: 'Path to node to remove' },
                                },
                                required: ['operation', 'nodePath'],
                            },
                            {
                                type: 'object',
                                description: 'Modify a node property',
                                properties: {
                                    operation: { type: 'string', enum: ['modify_property'] },
                                    nodePath: { type: 'string', description: 'Path to node' },
                                    property: { type: 'string', description: 'Property name' },
                                    value: { description: 'New property value (string, number, boolean, or complex type)' },
                                },
                                required: ['operation', 'nodePath', 'property', 'value'],
                            },
                            {
                                type: 'object',
                                description: 'Rename a node',
                                properties: {
                                    operation: { type: 'string', enum: ['rename_node'] },
                                    nodePath: { type: 'string', description: 'Path to node to rename' },
                                    newName: { type: 'string', description: 'New node name' },
                                },
                                required: ['operation', 'nodePath', 'newName'],
                            },
                            {
                                type: 'object',
                                description: 'Reparent a node',
                                properties: {
                                    operation: { type: 'string', enum: ['reparent_node'] },
                                    nodePath: { type: 'string', description: 'Path to node to move' },
                                    newParentPath: { type: 'string', description: 'Path to new parent node' },
                                },
                                required: ['operation', 'nodePath', 'newParentPath'],
                            },
                        ],
                    },
                },
                createBackup: {
                    type: 'boolean',
                    description: 'Create backup before modification (default: true)',
                    default: true,
                },
                validateAfter: {
                    type: 'boolean',
                    description: 'Validate scene after modification (default: true)',
                    default: true,
                },
            },
            required: ['projectPath', 'scenePath', 'operations'],
        },
        handler: async (args, correlationId) => {
            logger.info('Executing modify_scene', {
                correlationId,
                scenePath: args.scenePath,
                operationCount: args.operations?.length
            });
            const result = await sceneOps.modifyScene(args);
            return result;
        },
    });
}
/**
 * Register all tools in the registry
 */
export function registerAllTools(registry, godotClient, editorTools) {
    registerConnectivityTools(registry, godotClient);
    registerEditorTools(registry, editorTools);
    registerReadTools(registry);
    registerNodeTools(registry);
    registerSceneTools(registry);
    logger.info('Tool registration complete', {
        service: 'godot-mcp',
        toolCount: registry.getToolNames().length
    });
}
//# sourceMappingURL=tool-registration.js.map