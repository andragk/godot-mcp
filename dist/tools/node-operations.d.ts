import { type SceneNode, type NodeHierarchy } from '../utils/scene-parser.js';
/**
 * Search query for finding nodes across scenes
 */
export interface NodeSearchQuery {
    /** Node name pattern (exact, prefix, or regex) */
    name?: string;
    /** Node type filter (e.g., 'Node2D', 'Control') */
    type?: string;
    /** Property filter (e.g., 'visible=true', 'position.x>100') */
    property?: Record<string, unknown>;
    /** Search mode: 'exact', 'prefix', 'regex', 'contains' */
    mode?: 'exact' | 'prefix' | 'regex' | 'contains';
    /** Combine multiple criteria with AND or OR */
    operator?: 'AND' | 'OR';
    /** Limit number of results */
    limit?: number;
    /** Offset for pagination */
    offset?: number;
    /** Specific scenes to search (paths relative to project root) */
    scenes?: string[];
}
/**
 * Node search result
 */
export interface NodeSearchResult {
    /** Node that matches the query (hierarchy node) */
    node: NodeHierarchy;
    /** Original scene node data with properties */
    nodeData: SceneNode;
    /** Scene file path (relative to project root) */
    scenePath: string;
    /** Full path to node within scene hierarchy */
    nodePath: string;
    /** Match score (0-1, higher is better) */
    score: number;
}
/**
 * Property information for a node
 */
export interface NodePropertyInfo {
    /** Property name */
    name: string;
    /** Property value */
    value: unknown;
    /** Property type */
    type: string;
    /** Whether this property is exported */
    exported: boolean;
    /** Whether this is an inherited property */
    inherited: boolean;
    /** Property hint (if any) */
    hint?: string;
    /** Property category */
    category?: string;
}
/**
 * Comprehensive node properties result
 */
export interface NodePropertiesResult {
    /** Node path within scene */
    nodePath: string;
    /** Scene file path */
    scenePath: string;
    /** Node type */
    type: string;
    /** Node name */
    name: string;
    /** All properties */
    properties: NodePropertyInfo[];
    /** Connected signals */
    signals: Array<{
        name: string;
        target: string;
        method: string;
    }>;
    /** Parent node path */
    parent: string | null;
    /** Child node paths */
    children: string[];
    /** Script attached to this node (if any) */
    script: string | null;
}
/**
 * Search for nodes across project scenes
 */
export declare function searchNodes(projectPath: string, query: NodeSearchQuery): Promise<NodeSearchResult[]>;
/**
 * Get comprehensive properties for a specific node
 */
export declare function getNodeProperties(projectPath: string, scenePath: string, nodePath: string): Promise<NodePropertiesResult>;
//# sourceMappingURL=node-operations.d.ts.map