/**
 * Read-only tools for accessing Godot project structure and content
 */
import { z } from 'zod';
import { resolve, join } from 'node:path';
import { access, constants, stat } from 'node:fs/promises';
import { logger } from '../utils/logger.js';
import { LRUCache } from '../utils/lru-cache.js';
import {
  scanDirectory,
  readFileContent,
  getFileModificationTime,
  generateDirectoryTree,
  calculateDirectoryStats,
  type FileMetadata,
  type DirectoryNode,
} from '../utils/file-scanner.js';
import {
  parseSceneFile,
  buildNodeHierarchy,
  getSceneStats,
  type SceneData,
  type NodeHierarchy,
  type SceneStats,
} from '../utils/scene-parser.js';
import {
  analyzeScript,
  analyzeCSharpScript,
  calculateComplexity,
  type ScriptMetadata,
  type ComplexityMetrics,
} from '../utils/script-analyzer.js';
import { validatePath } from '../utils/path-validator.js';

/**
 * File content cache with 50MB limit
 */
const fileCache = new LRUCache<string>({
  maxSize: 50 * 1024 * 1024, // 50MB
  onEvict: (key) => {
    logger.debug('Cache evicted', { key });
  },
});

/**
 * Parsed scene cache
 */
const sceneCache = new LRUCache<SceneData>({
  maxSize: 10 * 1024 * 1024, // 10MB for parsed scene data
});

/**
 * Script metadata cache
 */
const scriptCache = new LRUCache<ScriptMetadata>({
  maxSize: 5 * 1024 * 1024, // 5MB for script metadata
});

/**
 * Get cache metrics for monitoring
 */
export function getCacheMetrics() {
  return {
    fileCache: fileCache.getMetrics(),
    sceneCache: sceneCache.getMetrics(),
    scriptCache: scriptCache.getMetrics(),
  };
}

/**
 * Clear all caches
 */
export function clearCaches(): void {
  fileCache.clear();
  sceneCache.clear();
  scriptCache.clear();
}

/**
 * Input schema for list_scenes
 */
export const ListScenesInputSchema = z.object({
  projectPath: z.string().describe('Absolute path to Godot project directory'),
  directory: z.string().optional().describe('Subdirectory to search within (relative to project)'),
  sortBy: z.enum(['path', 'size', 'modified']).optional().default('path').describe('Sort criteria'),
  ascending: z.boolean().optional().default(true).describe('Sort order'),
  includeBinary: z.boolean().optional().default(false).describe('Include binary .scn scenes'),
});

/**
 * List all scene files in project
 */
export async function listScenes(
  input: z.infer<typeof ListScenesInputSchema>
): Promise<{ scenes: FileMetadata[]; totalCount: number; totalSize: number }> {
  const { projectPath, directory, sortBy, ascending, includeBinary } = input;

  // Validate project path
  await validatePath(projectPath);

  // Verify project exists
  try {
    await access(projectPath, constants.R_OK);
  } catch {
    throw new Error(`Project path not accessible: ${projectPath}`);
  }

  // Determine scan directory
  const scanPath = directory ? resolve(projectPath, directory) : projectPath;

  // Validate scan path is within project
  if (directory) {
    await validatePath(scanPath, { baseDir: projectPath });
  }

  // Scan for .tscn files
  const sceneExtensions = includeBinary ? ['.tscn', '.scn'] : ['.tscn'];
  const scenes = await scanDirectory(scanPath, projectPath, {
    extensions: sceneExtensions,
  });

  // Sort scenes
  scenes.sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'path':
        comparison = a.relativePath.localeCompare(b.relativePath);
        break;
      case 'size':
        comparison = a.size - b.size;
        break;
      case 'modified':
        comparison = a.modifiedTime.getTime() - b.modifiedTime.getTime();
        break;
    }
    return ascending ? comparison : -comparison;
  });

  const totalSize = scenes.reduce((sum, s) => sum + s.size, 0);

  logger.info('Listed scenes', {
    projectPath,
    directory,
    count: scenes.length,
    totalSize,
  });

  return {
    scenes,
    totalCount: scenes.length,
    totalSize,
  };
}

/**
 * Input schema for read_scene
 */
export const ReadSceneInputSchema = z.object({
  projectPath: z.string().describe('Absolute path to Godot project directory'),
  scenePath: z.string().describe('Path to scene file (relative to project or absolute)'),
});

/**
 * Read and parse scene file
 */
export async function readScene(
  input: z.infer<typeof ReadSceneInputSchema>
): Promise<{
  content: SceneData;
  hierarchy: NodeHierarchy | null;
  stats: SceneStats;
  metadata: { path: string; size: number; modified: Date; binary?: boolean };
}> {
  const { projectPath, scenePath } = input;

  // Validate project path
  await validatePath(projectPath);

  // Resolve scene path
  const absoluteScenePath = scenePath.startsWith(projectPath)
    ? scenePath
    : resolve(projectPath, scenePath);

  // Validate scene path
  await validatePath(absoluteScenePath, { baseDir: projectPath });

  const extension = absoluteScenePath.split('.').pop()?.toLowerCase();

  if (extension === 'scn') {
    const fileStats = await stat(absoluteScenePath);
    const emptyScene: SceneData = {
      format: 0,
      loadSteps: 0,
      nodes: [],
      externalResources: [],
      connectionCount: 0,
    };

    return {
      content: emptyScene,
      hierarchy: null,
      stats: getSceneStats(emptyScene),
      metadata: {
        path: absoluteScenePath,
        size: fileStats.size,
        modified: fileStats.mtime,
        binary: true,
      },
    };
  }

  // Check cache
  const modTime = await getFileModificationTime(absoluteScenePath);
  const cacheKey = `${absoluteScenePath}:${modTime}`;
  const cached = sceneCache.get(cacheKey);

  let sceneData: SceneData;

  if (cached) {
    sceneData = cached;
    logger.debug('Scene cache hit', { scenePath: absoluteScenePath });
  } else {
    // Read and parse scene file
    const content = await readFileContent(absoluteScenePath);
    sceneData = parseSceneFile(content);

    // Cache parsed data
    const dataSize = JSON.stringify(sceneData).length;
    sceneCache.set(cacheKey, sceneData, dataSize);

    logger.debug('Scene cache miss', { scenePath: absoluteScenePath });
  }

  // Build hierarchy and stats
  const hierarchy = buildNodeHierarchy(sceneData);
  const stats = getSceneStats(sceneData);

  // Get file metadata
  const fileStat = await getFileModificationTime(absoluteScenePath);

  logger.info('Read scene', {
    scenePath: absoluteScenePath,
    nodeCount: stats.nodeCount,
    externalResources: stats.externalResourceCount,
  });

  return {
    content: sceneData,
    hierarchy,
    stats,
    metadata: {
      path: absoluteScenePath,
      size: JSON.stringify(sceneData).length,
      modified: new Date(fileStat),
    },
  };
}

/**
 * Input schema for list_scripts
 */
export const ListScriptsInputSchema = z.object({
  projectPath: z.string().describe('Absolute path to Godot project directory'),
  directory: z.string().optional().describe('Subdirectory to search within'),
  pattern: z.string().optional().describe('Filename pattern to match (regex)'),
  sortBy: z.enum(['path', 'size', 'modified', 'lines']).optional().default('path'),
  includeCSharp: z.boolean().optional().default(true).describe('Include .cs scripts'),
  includeMetadata: z.boolean().optional().default(false).describe('Include script metadata'),
});

/**
 * List all script files in project
 */
export async function listScripts(
  input: z.infer<typeof ListScriptsInputSchema>
): Promise<{
  scripts: Array<FileMetadata & { className?: string; linesOfCode?: number }>;
  totalCount: number;
  totalSize: number;
}> {
  const { projectPath, directory, pattern, sortBy, includeCSharp, includeMetadata } = input;

  // Validate project path
  await validatePath(projectPath);

  // Verify project exists
  try {
    await access(projectPath, constants.R_OK);
  } catch {
    throw new Error(`Project path not accessible: ${projectPath}`);
  }

  // Determine scan directory
  const scanPath = directory ? resolve(projectPath, directory) : projectPath;

  // Validate scan path
  if (directory) {
    await validatePath( scanPath, { baseDir: projectPath });
  }

  // Create pattern regex
  const patternRegex = pattern ? new RegExp(pattern) : undefined;

  // Scan for .gd files
  const scriptExtensions = includeCSharp ? ['.gd', '.cs'] : ['.gd'];
  const scripts = await scanDirectory(scanPath, projectPath, {
    extensions: scriptExtensions,
    pattern: patternRegex,
  });

  // Enhance with script metadata (class name, LOC)
  type ScriptListItem = FileMetadata & { className?: string; linesOfCode?: number };
  const enhancedScripts: ScriptListItem[] = includeMetadata
    ? await Promise.all(
        scripts.map(async (script) => {
          try {
            const modTime = await getFileModificationTime(script.path);
            const cacheKey = `${script.path}:${modTime}`;
            let metadata = scriptCache.get(cacheKey);

            if (!metadata) {
              const content = await readFileContent(script.path);
              const ext = script.extension.toLowerCase();
              metadata = ext === '.cs' ? analyzeCSharpScript(content) : analyzeScript(content);
              const metaSize = JSON.stringify(metadata).length;
              scriptCache.set(cacheKey, metadata, metaSize);
            }

            return {
              ...script,
              className: metadata.className,
              linesOfCode: metadata.lineCount,
            };
          } catch (error) {
            logger.warn(`Failed to analyze script: ${script.path}`, {
              error: error instanceof Error ? error.message : String(error),
            });
            return { ...script };
          }
        })
      )
    : scripts.map((script) => ({ ...script }));

  // Sort scripts
  enhancedScripts.sort((a, b) => {
    switch (sortBy) {
      case 'path':
        return a.relativePath.localeCompare(b.relativePath);
      case 'size':
        return a.size - b.size;
      case 'modified':
        return a.modifiedTime.getTime() - b.modifiedTime.getTime();
      case 'lines':
        return (a.linesOfCode ?? 0) - (b.linesOfCode ?? 0);
      default:
        return 0;
    }
  });

  const totalSize = enhancedScripts.reduce((sum, s) => sum + s.size, 0);

  logger.info('Listed scripts', {
    projectPath,
    directory,
    count: enhancedScripts.length,
    totalSize,
  });

  return {
    scripts: enhancedScripts,
    totalCount: enhancedScripts.length,
    totalSize,
  };
}

/**
 * Input schema for read_script
 */
export const ReadScriptInputSchema = z.object({
  projectPath: z.string().describe('Absolute path to Godot project directory'),
  scriptPath: z.string().describe('Path to script file (relative to project or absolute)'),
  includeMetadata: z.boolean().optional().default(true).describe('Include script metadata analysis'),
  includeComplexity: z.boolean().optional().default(false).describe('Include complexity metrics'),
  includeAnalysis: z.boolean().optional().describe('Deprecated: use includeMetadata instead'),
});

/**
 * Read and analyze script file
 */
export async function readScript(
  input: z.infer<typeof ReadScriptInputSchema>
): Promise<{
  content: string;
  metadata: ScriptMetadata;
  complexity?: ComplexityMetrics;
  fileInfo: { path: string; size: number; modified: Date; encoding: string };
}> {
  const { projectPath, scriptPath, includeMetadata, includeComplexity, includeAnalysis } = input;

  // Validate project path
  await validatePath(projectPath);

  // Resolve script path
  const absoluteScriptPath = scriptPath.startsWith(projectPath)
    ? scriptPath
    : resolve(projectPath, scriptPath);

  // Validate script path
  await validatePath(absoluteScriptPath, { baseDir: projectPath });

  // Check file cache
  const modTime = await getFileModificationTime(absoluteScriptPath);
  const cacheKey = `${absoluteScriptPath}:${modTime}`;
  let content = fileCache.get(cacheKey);

  if (!content) {
    content = await readFileContent(absoluteScriptPath);
    fileCache.set(cacheKey, content, content.length);
    logger.debug('File cache miss', { scriptPath: absoluteScriptPath });
  } else {
    logger.debug('File cache hit', { scriptPath: absoluteScriptPath });
  }

  // Analyze script
  const extension = absoluteScriptPath.split('.').pop()?.toLowerCase() ?? 'gd';
  const metadata = extension === 'cs'
    ? analyzeCSharpScript(content)
    : analyzeScript(content);

  // Calculate complexity if requested
  const shouldIncludeMetadata = includeMetadata ?? includeAnalysis ?? true;
  const shouldIncludeComplexity = includeComplexity ?? false;

  let complexity: ComplexityMetrics | undefined;
  if (shouldIncludeMetadata && shouldIncludeComplexity) {
    complexity = calculateComplexity(content, metadata);
  }

  logger.info('Read script', {
    scriptPath: absoluteScriptPath,
    className: metadata.className,
    functionCount: metadata.functions.length,
    lineCount: metadata.lineCount,
  });

  return {
    content,
    metadata: shouldIncludeMetadata ? metadata : { ...metadata, functions: [], signals: [], constants: {}, exports: [] },
    complexity,
    fileInfo: {
      path: absoluteScriptPath,
      size: content.length,
      modified: new Date(modTime),
      encoding: 'utf-8',
    },
  };
}

/**
 * Input schema for get_project_structure
 */
export const GetProjectStructureInputSchema = z.object({
  projectPath: z.string().describe('Absolute path to Godot project directory'),
  maxDepth: z.number().optional().default(5).describe('Maximum directory depth to traverse'),
  includeStats: z.boolean().optional().default(true).describe('Include file statistics'),
});

/**
 * Get complete project structure
 */
export async function getProjectStructure(
  input: z.infer<typeof GetProjectStructureInputSchema>
): Promise<{
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
}> {
  const { projectPath, maxDepth, includeStats } = input;

  // Validate project path
  await validatePath(projectPath);

  // Verify project exists
  try {
    await access(projectPath, constants.R_OK);
  } catch {
    throw new Error(`Project path not accessible: ${projectPath}`);
  }

  // Generate directory tree
  const tree = await generateDirectoryTree(projectPath, projectPath, maxDepth);

  // Calculate statistics if requested
  let stats;
  if (includeStats) {
    const allFiles = await scanDirectory(projectPath, projectPath, {});
    const dirStats = await calculateDirectoryStats(allFiles);

    const sceneCount = dirStats.filesByExtension['.tscn'] || 0;
    const scriptCount = dirStats.filesByExtension['.gd'] || 0;
    const assetCount =
      (dirStats.filesByExtension['.png'] || 0) +
      (dirStats.filesByExtension['.jpg'] || 0) +
      (dirStats.filesByExtension['.ogg'] || 0) +
      (dirStats.filesByExtension['.wav'] || 0) +
      (dirStats.filesByExtension['.mp3'] || 0);

    stats = {
      totalFiles: dirStats.totalFiles,
      totalSize: dirStats.totalSize,
      filesByType: dirStats.filesByExtension,
      sceneCount,
      scriptCount,
      assetCount,
    };
  }

  // Identify key directories
  const keyDirectories: string[] = [];
  const checkDirs = ['addons', 'autoload', 'scenes', 'scripts', 'resources', 'assets'];

  for (const dir of checkDirs) {
    const dirPath = join(projectPath, dir);
    try {
      await access(dirPath, constants.R_OK);
      keyDirectories.push(dir);
    } catch {
      // Directory doesn't exist
    }
  }

  logger.info('Generated project structure', {
    projectPath,
    totalFiles: stats?.totalFiles || 0,
    keyDirectories,
  });

  return {
    tree,
    stats,
    keyDirectories,
  };
}
