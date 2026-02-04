/**
 * Resource types supported by godot:// URI scheme
 */
export type GodotResourceType = 'project' | 'scenes' | 'scripts' | 'nodes';
/**
 * Parsed godot:// URI components
 */
export interface GodotUri {
    type: GodotResourceType;
    projectPath: string;
    resourcePath?: string;
    nodePath?: string;
}
/**
 * Resource content that can be returned
 */
export interface ResourceContent {
    uri: string;
    mimeType: string;
    text?: string;
    blob?: string;
}
/**
 * Parse a godot:// URI into components
 *
 * URI Format: godot://<project-path>/<type>/<resource-path>[/<node-path>]
 *
 * Examples:
 * - godot:///path/to/project/project - Project configuration
 * - godot:///path/to/project/scenes/ - List all scenes
 * - godot:///path/to/project/scenes/level1.tscn - Specific scene
 * - godot:///path/to/project/nodes/scenes/level1.tscn/Player - Specific node
 * - godot:///path/to/project/scripts/player.gd - Specific script
 */
export declare function parseGodotUri(uri: string): GodotUri;
/**
 * Build a godot:// URI from components
 */
export declare function buildGodotUri(components: GodotUri): string;
/**
 * Read project.godot configuration
 */
export declare function readProjectResource(projectPath: string): Promise<ResourceContent>;
/**
 * List all scenes in project
 */
export declare function listScenesResource(projectPath: string): Promise<ResourceContent>;
/**
 * Read a specific scene file
 */
export declare function readSceneResource(projectPath: string, scenePath: string): Promise<ResourceContent>;
/**
 * List all scripts in project
 */
export declare function listScriptsResource(projectPath: string): Promise<ResourceContent>;
/**
 * Read a specific script file
 */
export declare function readScriptResource(projectPath: string, scriptPath: string): Promise<ResourceContent>;
/**
 * Read a specific node within a scene
 */
export declare function readNodeResource(projectPath: string, scenePath: string, nodePath: string): Promise<ResourceContent>;
/**
 * Main resource reader that routes based on URI
 */
export declare function readGodotResource(uri: string): Promise<ResourceContent>;
//# sourceMappingURL=godot-resources.d.ts.map