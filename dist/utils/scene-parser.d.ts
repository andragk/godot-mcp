/**
 * Godot scene file (.tscn) parser
 * Parses Godot's custom text-based scene format
 */
export interface SceneNode {
    name: string;
    type: string;
    parent?: string;
    properties: Record<string, unknown>;
    script?: string;
}
export interface ExternalResource {
    id: string;
    type: string;
    path: string;
}
export interface SceneData {
    format: number;
    loadSteps: number;
    nodes: SceneNode[];
    externalResources: ExternalResource[];
    connectionCount: number;
    rootNode?: string;
}
/**
 * Parse .tscn file content
 */
export declare function parseSceneFile(content: string): SceneData;
/**
 * Extract node hierarchy as a tree structure
 */
export interface NodeHierarchy {
    name: string;
    type: string;
    children: NodeHierarchy[];
    script?: string;
}
export declare function buildNodeHierarchy(sceneData: SceneData): NodeHierarchy | null;
/**
 * Get scene statistics
 */
export interface SceneStats {
    nodeCount: number;
    externalResourceCount: number;
    connectionCount: number;
    scriptedNodeCount: number;
    nodeTypes: Record<string, number>;
    maxDepth: number;
}
export declare function getSceneStats(sceneData: SceneData): SceneStats;
//# sourceMappingURL=scene-parser.d.ts.map