/**
 * Editor Control Tools
 * Provides MCP tools for launching, running, and managing Godot editor instances
 */
import { z } from 'zod';
import { logger, logError } from '../utils/logger.js';
/**
 * Tool input schemas
 */
export const LaunchEditorSchema = z.object({
    projectPath: z.string().describe('Absolute path to the Godot project directory'),
    editorPath: z.string().optional().describe('Optional path to Godot editor executable'),
    additionalArgs: z.array(z.string()).optional().describe('Additional command-line arguments'),
});
export const RunProjectSchema = z.object({
    projectPath: z.string().describe('Absolute path to the Godot project directory'),
    scene: z.string().optional().describe('Optional specific scene to run'),
    debug: z.boolean().optional().default(true).describe('Run in debug mode'),
});
export const StopExecutionSchema = z.object({
    processId: z.number().describe('Process ID to terminate'),
    force: z.boolean().optional().default(false).describe('Force kill if graceful stop fails'),
});
export const GetVersionSchema = z.object({
    editorPath: z.string().optional().describe('Optional path to Godot editor executable'),
});
export const ListProjectsSchema = z.object({
    searchPaths: z.array(z.string()).describe('Directories to search for Godot projects'),
    recursive: z.boolean().optional().default(false).describe('Search subdirectories'),
});
export const AnalyzeProjectSchema = z.object({
    projectPath: z.string().describe('Absolute path to the Godot project directory'),
});
/**
 * Tool definitions for MCP server
 */
export const editorControlTools = [
    {
        name: 'launch_godot_editor',
        description: 'Launch Godot editor for a specific project',
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
    },
    {
        name: 'run_godot_project',
        description: 'Run a Godot project in debug or release mode',
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
    },
    {
        name: 'stop_godot_execution',
        description: 'Stop a running Godot process by process ID',
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
    },
    {
        name: 'get_godot_version',
        description: 'Get Godot engine version information',
        inputSchema: {
            type: 'object',
            properties: {
                editorPath: {
                    type: 'string',
                    description: 'Optional path to Godot editor executable',
                },
            },
        },
    },
    {
        name: 'list_godot_projects',
        description: 'Discover Godot projects in specified directories',
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
    },
    {
        name: 'analyze_project',
        description: 'Analyze Godot project structure and configuration',
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
    },
];
/**
 * Tool handlers
 */
export class EditorControlTools {
    godotClient;
    constructor(godotClient) {
        this.godotClient = godotClient;
    }
    /**
     * Launch Godot editor for a project
     */
    async launchEditor(args) {
        try {
            const validated = LaunchEditorSchema.parse(args);
            logger.info('Launching Godot editor', { projectPath: validated.projectPath });
            const result = await this.godotClient.sendRequest('launch_editor', {
                project_path: validated.projectPath,
                editor_path: validated.editorPath,
                additional_args: validated.additionalArgs || [],
            });
            logger.info('Godot editor launched successfully', { result });
            return result;
        }
        catch (error) {
            logError(error instanceof Error ? error : new Error(String(error)), 'Failed to launch editor');
            throw error;
        }
    }
    /**
     * Run a Godot project
     */
    async runProject(args) {
        try {
            const validated = RunProjectSchema.parse(args);
            logger.info('Running Godot project', {
                projectPath: validated.projectPath,
                debug: validated.debug,
            });
            const result = await this.godotClient.sendRequest('run_project', {
                project_path: validated.projectPath,
                scene: validated.scene,
                debug: validated.debug,
            });
            logger.info('Godot project started', { result });
            return result;
        }
        catch (error) {
            logError(error instanceof Error ? error : new Error(String(error)), 'Failed to run project');
            throw error;
        }
    }
    /**
     * Stop a running Godot process
     */
    async stopExecution(args) {
        try {
            const validated = StopExecutionSchema.parse(args);
            logger.info('Stopping Godot process', { processId: validated.processId });
            const result = await this.godotClient.sendRequest('stop_execution', {
                process_id: validated.processId,
                force: validated.force,
            });
            logger.info('Godot process stopped', { result });
            return result;
        }
        catch (error) {
            logError(error instanceof Error ? error : new Error(String(error)), 'Failed to stop execution');
            throw error;
        }
    }
    /**
     * Get Godot version
     */
    async getVersion(args) {
        try {
            const validated = GetVersionSchema.parse(args);
            logger.debug('Getting Godot version');
            const result = await this.godotClient.sendRequest('get_godot_version', {
                editor_path: validated.editorPath,
            });
            logger.debug('Got Godot version', { result });
            return result;
        }
        catch (error) {
            logError(error instanceof Error ? error : new Error(String(error)), 'Failed to get version');
            throw error;
        }
    }
    /**
     * List Godot projects in directories
     */
    async listProjects(args) {
        try {
            const validated = ListProjectsSchema.parse(args);
            logger.info('Listing Godot projects', { searchPaths: validated.searchPaths });
            const result = await this.godotClient.sendRequest('list_projects', {
                search_paths: validated.searchPaths,
                recursive: validated.recursive,
            });
            logger.info('Found Godot projects', { result });
            return result;
        }
        catch (error) {
            logError(error instanceof Error ? error : new Error(String(error)), 'Failed to list projects');
            throw error;
        }
    }
    /**
     * Analyze project structure
     */
    async analyzeProject(args) {
        try {
            const validated = AnalyzeProjectSchema.parse(args);
            logger.info('Analyzing Godot project', { projectPath: validated.projectPath });
            const result = await this.godotClient.sendRequest('analyze_project', {
                project_path: validated.projectPath,
            });
            logger.info('Project analysis complete', { result });
            return result;
        }
        catch (error) {
            logError(error instanceof Error ? error : new Error(String(error)), 'Failed to analyze project');
            throw error;
        }
    }
}
//# sourceMappingURL=editor-control.js.map