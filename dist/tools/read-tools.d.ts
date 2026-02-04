/**
 * Read-only tools for accessing Godot project structure and content
 */
import { z } from 'zod';
import { type FileMetadata, type DirectoryNode } from '../utils/file-scanner.js';
import { type SceneData, type NodeHierarchy, type SceneStats } from '../utils/scene-parser.js';
import { type ScriptMetadata, type ComplexityMetrics } from '../utils/script-analyzer.js';
/**
 * Get cache metrics for monitoring
 */
export declare function getCacheMetrics(): {
    fileCache: import("../utils/lru-cache.js").CacheMetrics;
    sceneCache: import("../utils/lru-cache.js").CacheMetrics;
    scriptCache: import("../utils/lru-cache.js").CacheMetrics;
};
/**
 * Clear all caches
 */
export declare function clearCaches(): void;
/**
 * Input schema for list_scenes
 */
export declare const ListScenesInputSchema: z.ZodObject<{
    projectPath: z.ZodString;
    directory: z.ZodOptional<z.ZodString>;
    sortBy: z.ZodDefault<z.ZodOptional<z.ZodEnum<["path", "size", "modified"]>>>;
    ascending: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    projectPath: string;
    sortBy: "path" | "size" | "modified";
    ascending: boolean;
    directory?: string | undefined;
}, {
    projectPath: string;
    directory?: string | undefined;
    sortBy?: "path" | "size" | "modified" | undefined;
    ascending?: boolean | undefined;
}>;
/**
 * List all scene files in project
 */
export declare function listScenes(input: z.infer<typeof ListScenesInputSchema>): Promise<{
    scenes: FileMetadata[];
    totalCount: number;
    totalSize: number;
}>;
/**
 * Input schema for read_scene
 */
export declare const ReadSceneInputSchema: z.ZodObject<{
    projectPath: z.ZodString;
    scenePath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    projectPath: string;
    scenePath: string;
}, {
    projectPath: string;
    scenePath: string;
}>;
/**
 * Read and parse scene file
 */
export declare function readScene(input: z.infer<typeof ReadSceneInputSchema>): Promise<{
    content: SceneData;
    hierarchy: NodeHierarchy | null;
    stats: SceneStats;
    metadata: {
        path: string;
        size: number;
        modified: Date;
    };
}>;
/**
 * Input schema for list_scripts
 */
export declare const ListScriptsInputSchema: z.ZodObject<{
    projectPath: z.ZodString;
    directory: z.ZodOptional<z.ZodString>;
    pattern: z.ZodOptional<z.ZodString>;
    sortBy: z.ZodDefault<z.ZodOptional<z.ZodEnum<["path", "size", "modified", "lines"]>>>;
}, "strip", z.ZodTypeAny, {
    projectPath: string;
    sortBy: "path" | "size" | "modified" | "lines";
    pattern?: string | undefined;
    directory?: string | undefined;
}, {
    projectPath: string;
    pattern?: string | undefined;
    directory?: string | undefined;
    sortBy?: "path" | "size" | "modified" | "lines" | undefined;
}>;
/**
 * List all script files in project
 */
export declare function listScripts(input: z.infer<typeof ListScriptsInputSchema>): Promise<{
    scripts: Array<FileMetadata & {
        className?: string;
        linesOfCode?: number;
    }>;
    totalCount: number;
    totalSize: number;
}>;
/**
 * Input schema for read_script
 */
export declare const ReadScriptInputSchema: z.ZodObject<{
    projectPath: z.ZodString;
    scriptPath: z.ZodString;
    includeAnalysis: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    projectPath: string;
    scriptPath: string;
    includeAnalysis: boolean;
}, {
    projectPath: string;
    scriptPath: string;
    includeAnalysis?: boolean | undefined;
}>;
/**
 * Read and analyze script file
 */
export declare function readScript(input: z.infer<typeof ReadScriptInputSchema>): Promise<{
    content: string;
    metadata: ScriptMetadata;
    complexity?: ComplexityMetrics;
    fileInfo: {
        path: string;
        size: number;
        modified: Date;
        encoding: string;
    };
}>;
/**
 * Input schema for get_project_structure
 */
export declare const GetProjectStructureInputSchema: z.ZodObject<{
    projectPath: z.ZodString;
    maxDepth: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    includeStats: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    maxDepth: number;
    projectPath: string;
    includeStats: boolean;
}, {
    projectPath: string;
    maxDepth?: number | undefined;
    includeStats?: boolean | undefined;
}>;
/**
 * Get complete project structure
 */
export declare function getProjectStructure(input: z.infer<typeof GetProjectStructureInputSchema>): Promise<{
    tree: DirectoryNode;
    stats?: {
        totalFiles: number;
        totalSize: number;
        filesByType: Record<string, number>;
        sceneCount: number;
        scriptCount: number;
        assetCount: number;
    };
    keyDirectories: string[];
}>;
//# sourceMappingURL=read-tools.d.ts.map