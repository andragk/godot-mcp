/**
 * Editor Control Tools
 * Provides MCP tools for launching, running, and managing Godot editor instances
 */
import { z } from 'zod';
import type { GodotClient } from '../bridge/index.js';
/**
 * Tool input schemas
 */
export declare const LaunchEditorSchema: z.ZodObject<{
    projectPath: z.ZodString;
    editorPath: z.ZodOptional<z.ZodString>;
    additionalArgs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    projectPath: string;
    editorPath?: string | undefined;
    additionalArgs?: string[] | undefined;
}, {
    projectPath: string;
    editorPath?: string | undefined;
    additionalArgs?: string[] | undefined;
}>;
export declare const RunProjectSchema: z.ZodObject<{
    projectPath: z.ZodString;
    scene: z.ZodOptional<z.ZodString>;
    debug: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    debug: boolean;
    projectPath: string;
    scene?: string | undefined;
}, {
    projectPath: string;
    debug?: boolean | undefined;
    scene?: string | undefined;
}>;
export declare const StopExecutionSchema: z.ZodObject<{
    processId: z.ZodNumber;
    force: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    processId: number;
    force: boolean;
}, {
    processId: number;
    force?: boolean | undefined;
}>;
export declare const GetVersionSchema: z.ZodObject<{
    editorPath: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    editorPath?: string | undefined;
}, {
    editorPath?: string | undefined;
}>;
export declare const ListProjectsSchema: z.ZodObject<{
    searchPaths: z.ZodArray<z.ZodString, "many">;
    recursive: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    recursive: boolean;
    searchPaths: string[];
}, {
    searchPaths: string[];
    recursive?: boolean | undefined;
}>;
export declare const AnalyzeProjectSchema: z.ZodObject<{
    projectPath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    projectPath: string;
}, {
    projectPath: string;
}>;
/**
 * Tool definitions for MCP server
 */
export declare const editorControlTools: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            projectPath: {
                type: string;
                description: string;
            };
            editorPath: {
                type: string;
                description: string;
            };
            additionalArgs: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            scene?: undefined;
            debug?: undefined;
            processId?: undefined;
            force?: undefined;
            searchPaths?: undefined;
            recursive?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            projectPath: {
                type: string;
                description: string;
            };
            scene: {
                type: string;
                description: string;
            };
            debug: {
                type: string;
                description: string;
                default: boolean;
            };
            editorPath?: undefined;
            additionalArgs?: undefined;
            processId?: undefined;
            force?: undefined;
            searchPaths?: undefined;
            recursive?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            processId: {
                type: string;
                description: string;
            };
            force: {
                type: string;
                description: string;
                default: boolean;
            };
            projectPath?: undefined;
            editorPath?: undefined;
            additionalArgs?: undefined;
            scene?: undefined;
            debug?: undefined;
            searchPaths?: undefined;
            recursive?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            editorPath: {
                type: string;
                description: string;
            };
            projectPath?: undefined;
            additionalArgs?: undefined;
            scene?: undefined;
            debug?: undefined;
            processId?: undefined;
            force?: undefined;
            searchPaths?: undefined;
            recursive?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            searchPaths: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            recursive: {
                type: string;
                description: string;
                default: boolean;
            };
            projectPath?: undefined;
            editorPath?: undefined;
            additionalArgs?: undefined;
            scene?: undefined;
            debug?: undefined;
            processId?: undefined;
            force?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            projectPath: {
                type: string;
                description: string;
            };
            editorPath?: undefined;
            additionalArgs?: undefined;
            scene?: undefined;
            debug?: undefined;
            processId?: undefined;
            force?: undefined;
            searchPaths?: undefined;
            recursive?: undefined;
        };
        required: string[];
    };
})[];
/**
 * Tool handlers
 */
export declare class EditorControlTools {
    private readonly godotClient;
    constructor(godotClient: GodotClient);
    /**
     * Launch Godot editor for a project
     */
    launchEditor(args: z.infer<typeof LaunchEditorSchema>): Promise<unknown>;
    /**
     * Run a Godot project
     */
    runProject(args: z.infer<typeof RunProjectSchema>): Promise<unknown>;
    /**
     * Stop a running Godot process
     */
    stopExecution(args: z.infer<typeof StopExecutionSchema>): Promise<unknown>;
    /**
     * Get Godot version
     */
    getVersion(args: z.infer<typeof GetVersionSchema>): Promise<unknown>;
    /**
     * List Godot projects in directories
     */
    listProjects(args: z.infer<typeof ListProjectsSchema>): Promise<unknown>;
    /**
     * Analyze project structure
     */
    analyzeProject(args: z.infer<typeof AnalyzeProjectSchema>): Promise<unknown>;
}
//# sourceMappingURL=editor-control.d.ts.map