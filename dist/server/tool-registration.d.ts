import type { GodotClient } from '../bridge/godot-client.js';
import type { EditorControlTools } from '../tools/editor-control.js';
import { ToolRegistry } from '../types/tool-registry.js';
/**
 * Register all connectivity tools
 */
export declare function registerConnectivityTools(registry: ToolRegistry, godotClient: GodotClient): void;
/**
 * Register all editor control tools
 */
export declare function registerEditorTools(registry: ToolRegistry, editorTools: EditorControlTools): void;
/**
 * Register all read tools
 */
export declare function registerReadTools(registry: ToolRegistry): void;
/**
 * Register node operation tools
 */
export declare function registerNodeTools(registry: ToolRegistry): void;
/**
 * Register scene operations tools
 */
export declare function registerSceneTools(registry: ToolRegistry): void;
/**
 * Register all tools in the registry
 */
export declare function registerAllTools(registry: ToolRegistry, godotClient: GodotClient, editorTools: EditorControlTools): void;
//# sourceMappingURL=tool-registration.d.ts.map