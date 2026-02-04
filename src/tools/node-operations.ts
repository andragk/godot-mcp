import path from 'path';
import { stat, readFile } from 'fs/promises';
import { validatePath } from '../utils/path-validator.js';
import { parseSceneFile, type SceneNode, type SceneData, buildNodeHierarchy, type NodeHierarchy } from '../utils/scene-parser.js';
import { scanDirectory } from '../utils/file-scanner.js';
import { LRUCache } from '../utils/lru-cache.js';
import { logger } from '../utils/logger.js';

/**
 * Cache for parsed scenes
 */
const sceneCache = new LRUCache<SceneData>({
  maxSize: 50 * 1024 * 1024, // 50MB
  onEvict: (key) => logger.debug('Scene cache evicted', { key }),
});

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
  signals: Array<{ name: string; target: string; method: string }>;
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
export async function searchNodes(
  projectPath: string,
  query: NodeSearchQuery
): Promise<NodeSearchResult[]> {
  const startTime = Date.now();
  
  // Validate project path
  await validatePath(projectPath, { mustExist: true, allowAbsolute: true });
  const projectStat = await stat(projectPath);
  if (!projectStat.isDirectory()) {
    throw new Error(`Project path must be a directory: ${projectPath}`);
  }

  // Apply defaults
  const mode = query.mode || 'contains';
  const operator = query.operator || 'AND';
  const limit = query.limit || 100;
  const offset = query.offset || 0;

  logger.info('Searching nodes', {
    projectPath,
    query,
    mode,
    operator,
    limit,
    offset
  });

  // Determine which scenes to search
  let scenePaths: string[];
  if (query.scenes && query.scenes.length > 0) {
    // Use specified scenes
    scenePaths = query.scenes.map(s => path.join(projectPath, s));
    // Validate each scene path
    for (const scenePath of scenePaths) {
      await validatePath(scenePath, { 
        mustExist: true, 
        baseDir: projectPath,
        allowedExtensions: ['.tscn', '.scn']
      });
    }
  } else {
    // Scan all scenes in project
    const sceneFiles = await scanDirectory(projectPath, projectPath, {
      extensions: ['.tscn', '.scn'],
      excludeDirs: ['.godot', 'addons', '.git']
    });
    scenePaths = sceneFiles.map(f => path.join(projectPath, f.relativePath));
  }

  logger.info(`Searching ${scenePaths.length} scenes`);

  const results: NodeSearchResult[] = [];
  
  // Search each scene
  for (const scenePath of scenePaths) {
    try {
      // Try to get parsed scene from cache
      const cacheKey = `scene:parsed:${scenePath}`;
      let parsed = sceneCache.get(cacheKey);
      
      if (!parsed) {
        // Parse scene and cache it
        const content = await readFile(scenePath, 'utf-8');
        parsed = parseSceneFile(content);
        const size = content.length;
        sceneCache.set(cacheKey, parsed, size);
      }

      // Build hierarchy and search
      const hierarchy = buildNodeHierarchy(parsed);
      if (hierarchy) {
        const sceneRelativePath = path.relative(projectPath, scenePath);
        searchNodesRecursive(
          hierarchy,
          query,
          mode,
          operator,
          sceneRelativePath,
          results,
          parsed.nodes
        );
      }
    } catch (error) {
      logger.warn('Failed to search scene', { scenePath, error });
      // Continue with other scenes
    }
  }

  // Sort by score (highest first)
  results.sort((a, b) => b.score - a.score);

  // Apply pagination
  const paginatedResults = results.slice(offset, offset + limit);

  const duration = Date.now() - startTime;
  logger.info('Node search complete', {
    totalResults: results.length,
    returnedResults: paginatedResults.length,
    duration,
    performanceOk: duration < 500
  });

  return paginatedResults;
}

/**
 * Recursively search nodes in a hierarchy
 */
function searchNodesRecursive(
  node: NodeHierarchy,
  query: NodeSearchQuery,
  mode: string,
  operator: 'AND' | 'OR',
  scenePath: string,
  results: NodeSearchResult[],
  sceneNodes: SceneNode[],
  parentPath: string = ''
): void {
  const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
  
  // Find the original SceneNode for property access
  const sceneNode = sceneNodes.find(n => n.name === node.name);
  
  // Check if node matches query
  if (sceneNode && nodeMatchesQuery(node, sceneNode, query, mode, operator)) {
    results.push({
      node,
      nodeData: sceneNode,
      scenePath,
      nodePath,
      score: calculateMatchScore(node, sceneNode, query, mode)
    });
  }

  // Recursively search children
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      searchNodesRecursive(
        child,
        query,
        mode,
        operator,
        scenePath,
        results,
        sceneNodes,
        nodePath
      );
    }
  }
}

/**
 * Check if a node matches the search query
 */
function nodeMatchesQuery(
  node: NodeHierarchy,
  sceneNode: SceneNode,
  query: NodeSearchQuery,
  mode: string,
  operator: 'AND' | 'OR'
): boolean {
  const criteria: boolean[] = [];

  // Name matching
  if (query.name) {
    const nameMatch = matchString(node.name, query.name, mode);
    criteria.push(nameMatch);
  }

  // Type matching
  if (query.type) {
    const typeMatch: boolean = node.type === query.type || 
                      Boolean(node.type && node.type.includes(query.type));
    criteria.push(typeMatch);
  }

  // Property matching
  if (query.property && Object.keys(query.property).length > 0) {
    const propertyMatch = matchProperties(sceneNode.properties, query.property);
    criteria.push(propertyMatch);
  }

  // If no criteria specified, match all nodes
  if (criteria.length === 0) {
    return true;
  }

  // Apply operator
  if (operator === 'AND') {
    return criteria.every(c => c);
  } else {
    return criteria.some(c => c);
  }
}

/**
 * Match a string against a pattern
 */
function matchString(value: string, pattern: string, mode: string): boolean {
  switch (mode) {
    case 'exact':
      return value === pattern;
    case 'prefix':
      return value.startsWith(pattern);
    case 'contains':
      return value.toLowerCase().includes(pattern.toLowerCase());
    case 'regex':
      try {
        const regex = new RegExp(pattern, 'i');
        return regex.test(value);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * Match node properties against query
 */
function matchProperties(
  nodeProperties: Record<string, unknown>,
  queryProperties: Record<string, unknown>
): boolean {
  for(const [key, value] of Object.entries(queryProperties)) {
    const nodeProp = nodeProperties[key];
    
    if (typeof value === 'string' && value.includes('>')) {
      // Comparison operator
      const [, operator, compareValue] = value.split(/([><=]+)/);
      const numValue = parseFloat(String(nodeProp));
      const numCompare = parseFloat(compareValue);
      
      if (!isNaN(numValue) && !isNaN(numCompare)) {
        switch (operator) {
          case '>': return numValue > numCompare;
          case '<': return numValue < numCompare;
          case '>=': return numValue >= numCompare;
          case '<=': return numValue <= numCompare;
          case '==': return numValue === numCompare;
          default: return false;
        }
      }
    } else {
      // Exact match
      if (nodeProp !== value) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Calculate match score for relevance ranking
 */
function calculateMatchScore(
  node: NodeHierarchy,
  _sceneNode: SceneNode,
  query: NodeSearchQuery,
  mode: string
): number {
  let score = 0.5; // Base score

  // Exact name match scores higher
  if (query.name) {
    if (node.name === query.name) {
      score += 0.3;
    } else if (mode === 'prefix' && node.name.startsWith(query.name)) {
      score += 0.2;
    } else if (mode === 'contains') {
      score += 0.1;
    }
  }

  // Exact type match scores higher
  if (query.type && node.type === query.type) {
    score += 0.2;
  }

  return Math.min(score, 1.0);
}

/**
 * Get comprehensive properties for a specific node
 */
export async function getNodeProperties(
  projectPath: string,
  scenePath: string,
  nodePath: string
): Promise<NodePropertiesResult> {
  // Validate paths
  await validatePath(projectPath, { mustExist: true, allowAbsolute: true });
  const projectStat = await stat(projectPath);
  if (!projectStat.isDirectory()) {
    throw new Error(`Project path must be a directory: ${projectPath}`);
  }
  
  const fullScenePath = path.join(projectPath, scenePath);
  await validatePath(fullScenePath, { 
    mustExist: true,
    baseDir: projectPath,
    allowedExtensions: ['.tscn', '.scn']
  });

  logger.info('Getting node properties', { projectPath, scenePath, nodePath });

  // Parse scene
  const cacheKey = `scene:parsed:${fullScenePath}`;
  let parsedScene = sceneCache.get(cacheKey);
  
  if (!parsedScene) {
    const content = await readFile(fullScenePath, 'utf-8');
    parsedScene = parseSceneFile(content);
    const size = content.length;
    sceneCache.set(cacheKey, parsedScene, size);
  }

  // Build hierarchy to get children info
  const hierarchy = buildNodeHierarchy(parsedScene);
  if (!hierarchy) {
    throw new Error(`Failed to build hierarchy for scene: ${scenePath}`);
  }

  // Find the target node in hierarchy
  const hierarchyNode = findNodeInHierarchy(hierarchy, nodePath);
  if (!hierarchyNode) {
    throw new Error(`Node not found: ${nodePath} in ${scenePath}`);
  }

  // Find the scene node for properties
  const sceneNode = parsedScene.nodes.find(n => n.name === hierarchyNode.name);
  if (!sceneNode) {
    throw new Error(`Scene node data not found for: ${nodePath}`);
  }

  // Build properties list
  const properties: NodePropertyInfo[] = [];
  
  for (const [name, value] of Object.entries(sceneNode.properties)) {
    properties.push({
      name,
      value,
      type: getPropertyType(value),
      exported: false, // TODO: Determine from script analysis
      inherited: false, // TODO: Determine from type hierarchy
      category: categorizeProperty(name)
    });
  }

  // Get signals (from node.properties if present)
  const signals: Array<{ name: string; target: string; method: string }> = [];
  // TODO: Parse signal connections from scene file

  // Get parent path
  const parentPath = getParentPath(nodePath);

  // Get children paths from hierarchy
  const children = hierarchyNode.children.map(child => 
    nodePath ? `${nodePath}/${child.name}` : child.name
  );

  // Check for attached script
  const script = sceneNode.script || null;

  const result: NodePropertiesResult = {
    nodePath,
    scenePath,
    type: hierarchyNode.type || 'Node',
    name: hierarchyNode.name,
    properties,
    signals,
    parent: parentPath,
    children,
    script
  };

  logger.info('Node properties retrieved', { 
    nodePath, 
    propertyCount: properties.length,
    childrenCount: children.length 
  });

  return result;
}

/**
 * Find a node by its path in the hierarchy
 */
function findNodeInHierarchy(root: NodeHierarchy, targetPath: string): NodeHierarchy | null {
  const parts = targetPath.split('/').filter(p => p.length > 0);
  
  if (parts.length === 0 || parts[0] === root.name) {
    // Root node or path starts with root name
    if (parts.length <= 1) {
      return root;
    }
    // Continue with children
    return findNodeInChildren(root.children, parts.slice(1));
  }
  
  // Path doesn't include root, search from root
  return findNodeInChildren([root], parts);
}

/**
 * Find node in children recursively
 */
function findNodeInChildren(children: NodeHierarchy[], parts: string[]): NodeHierarchy | null {
  if (parts.length === 0) {
    return null;
  }
  
  const [first, ...rest] = parts;
  const node = children.find(n => n.name === first);
  
  if (!node) {
    return null;
  }
  
  if (rest.length === 0) {
    return node;
  }
  
  return findNodeInChildren(node.children, rest);
}

/**
 * Get parent path from node path
 */
function getParentPath(nodePath: string): string | null {
  const lastSlash = nodePath.lastIndexOf('/');
  if (lastSlash === -1) {
    return null; // Root node
  }
  return nodePath.substring(0, lastSlash);
}

/**
 * Get type of a property value
 */
function getPropertyType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'Array';
  
  const type = typeof value;
  if (type === 'object') {
    // Try to determine Godot type
    const obj = value as Record<string, unknown>;
    if (obj.x !== undefined && obj.y !== undefined) {
      return obj.z !== undefined ? 'Vector3' : 'Vector2';
    }
    if (obj.r !== undefined && obj.g !== undefined && obj.b !== undefined) {
      return 'Color';
    }
    return 'Object';
  }
  
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Categorize a property by its name
 */
function categorizeProperty(name: string): string {
  if (name.includes('position') || name.includes('location')) return 'Transform';
  if (name.includes('rotation') || name.includes('scale')) return 'Transform';
  if (name.includes('color') || name.includes('modulate')) return 'Visual';
  if (name.includes('visible') || name.includes('opacity')) return 'Visual';
  if (name.includes('size') || name.includes('rect')) return 'Layout';
  if (name.includes('text') || name.includes('label')) return 'Content';
  return 'General';
}
