/**
 * Godot MCP Resources
 * Implements MCP resource protocol for Godot project access via godot:// URIs
 */
import { readFile, stat } from 'fs/promises';
import * as path from 'path';
import { parseSceneFile } from '../utils/scene-parser.js';
import { listScenes, listScripts } from '../tools/read-tools.js';
import { logger } from '../utils/logger.js';
import { validatePath } from '../utils/path-validator.js';
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
export function parseGodotUri(uri) {
    if (!uri.startsWith('godot://')) {
        throw new Error(`Invalid godot:// URI: ${uri}`);
    }
    // Remove godot:// prefix and split
    const rawPath = decodeURIComponent(uri.substring(8));
    const segments = rawPath.split('/');
    if (segments.length < 2) {
        throw new Error(`Invalid godot:// URI format: ${uri}`);
    }
    // Known types: project, scenes, scripts, nodes
    const knownTypes = ['project', 'scenes', 'scripts', 'nodes'];
    const typeIndex = segments.findIndex((segment) => knownTypes.includes(segment));
    const type = typeIndex >= 0 ? segments[typeIndex] : undefined;
    if (typeIndex === -1 || !type) {
        throw new Error(`Invalid resource type in URI: ${uri}`);
    }
    const projectSegments = segments.slice(0, typeIndex).filter((segment) => segment.length > 0);
    let projectPath = projectSegments.join('/');
    if (rawPath.startsWith('/') && !projectPath.match(/^[A-Za-z]:/)) {
        projectPath = `/${projectPath}`;
    }
    const remainingParts = segments.slice(typeIndex + 1).filter((segment) => segment.length > 0);
    const result = {
        type,
        projectPath,
    };
    // Parse resource path and node path based on type
    if (type === 'nodes' && remainingParts.length >= 2) {
        // nodes/<scene-path>/<node-path>
        // Find where the scene path ends (.tscn or .scn extension)
        let scenePathEnd = -1;
        for (let i = 0; i < remainingParts.length; i++) {
            if (remainingParts[i].endsWith('.tscn') || remainingParts[i].endsWith('.scn')) {
                scenePathEnd = i;
                break;
            }
        }
        if (scenePathEnd !== -1) {
            result.resourcePath = remainingParts.slice(0, scenePathEnd + 1).join('/');
            if (remainingParts.length > scenePathEnd + 1) {
                result.nodePath = remainingParts.slice(scenePathEnd + 1).join('/');
            }
        }
    }
    else if (remainingParts.length > 0) {
        // scenes/<path> or scripts/<path>
        result.resourcePath = remainingParts.join('/');
    }
    return result;
}
/**
 * Build a godot:// URI from components
 */
export function buildGodotUri(components) {
    let uri = `godot://${components.projectPath}/${components.type}`;
    if (components.resourcePath) {
        uri += `/${components.resourcePath}`;
    }
    if (components.nodePath) {
        uri += `/${components.nodePath}`;
    }
    return uri;
}
/**
 * Read project.godot configuration
 */
export async function readProjectResource(projectPath) {
    await validatePath(projectPath, { mustExist: true });
    const projectFile = path.join(projectPath, 'project.godot');
    await validatePath(projectFile, { mustExist: true, baseDir: projectPath });
    const content = await readFile(projectFile, 'utf-8');
    return {
        uri: buildGodotUri({ type: 'project', projectPath }),
        mimeType: 'text/plain',
        text: content
    };
}
/**
 * List all scenes in project
 */
export async function listScenesResource(projectPath) {
    await validatePath(projectPath, { mustExist: true });
    const sceneList = await listScenes({
        projectPath,
        sortBy: 'path',
        ascending: true,
        includeBinary: false
    });
    const scenes = sceneList.scenes.map(scene => ({
        path: scene.path,
        uri: buildGodotUri({ type: 'scenes', projectPath, resourcePath: scene.path }),
        size: scene.size,
        modified: scene.modifiedTime.toISOString()
    }));
    return {
        uri: buildGodotUri({ type: 'scenes', projectPath }),
        mimeType: 'application/json',
        text: JSON.stringify({ scenes }, null, 2)
    };
}
/**
 * Read a specific scene file
 */
export async function readSceneResource(projectPath, scenePath) {
    await validatePath(projectPath, { mustExist: true });
    const fullPath = path.join(projectPath, scenePath);
    await validatePath(fullPath, { mustExist: true, baseDir: projectPath });
    const content = await readFile(fullPath, 'utf-8');
    const stats = await stat(fullPath);
    // Parse scene to extract metadata
    const parsed = parseSceneFile(content);
    return {
        uri: buildGodotUri({ type: 'scenes', projectPath, resourcePath: scenePath }),
        mimeType: 'application/x-godot-scene',
        text: JSON.stringify({
            raw: content,
            parsed: {
                format: parsed.format,
                loadSteps: parsed.loadSteps,
                nodeCount: parsed.nodes.length,
                nodes: parsed.nodes.map(n => ({
                    name: n.name,
                    type: n.type,
                    parent: n.parent
                }))
            },
            metadata: {
                size: stats.size,
                modified: stats.mtime.toISOString()
            }
        }, null, 2)
    };
}
/**
 * List all scripts in project
 */
export async function listScriptsResource(projectPath) {
    await validatePath(projectPath, { mustExist: true });
    const scriptList = await listScripts({
        projectPath,
        sortBy: 'path',
        includeCSharp: true,
        includeMetadata: false
    });
    const scripts = scriptList.scripts.map(script => ({
        path: script.path,
        uri: buildGodotUri({ type: 'scripts', projectPath, resourcePath: script.path }),
        size: script.size,
        modified: script.modifiedTime.toISOString()
    }));
    return {
        uri: buildGodotUri({ type: 'scripts', projectPath }),
        mimeType: 'application/json',
        text: JSON.stringify({ scripts }, null, 2)
    };
}
/**
 * Read a specific script file
 */
export async function readScriptResource(projectPath, scriptPath) {
    await validatePath(projectPath, { mustExist: true });
    const fullPath = path.join(projectPath, scriptPath);
    await validatePath(fullPath, { mustExist: true, baseDir: projectPath });
    const content = await readFile(fullPath, 'utf-8');
    const stats = await stat(fullPath);
    return {
        uri: buildGodotUri({ type: 'scripts', projectPath, resourcePath: scriptPath }),
        mimeType: 'text/x-gdscript',
        text: JSON.stringify({
            content,
            metadata: {
                size: stats.size,
                modified: stats.mtime.toISOString()
            }
        }, null, 2)
    };
}
/**
 * Read a specific node within a scene
 */
export async function readNodeResource(projectPath, scenePath, nodePath) {
    await validatePath(projectPath, { mustExist: true });
    const fullScenePath = path.join(projectPath, scenePath);
    await validatePath(fullScenePath, { mustExist: true, baseDir: projectPath });
    const content = await readFile(fullScenePath, 'utf-8');
    const parsed = parseSceneFile(content);
    // Find the node
    const node = parsed.nodes.find(n => n.name === nodePath ||
        n.name === nodePath.split('/').pop());
    if (!node) {
        throw new Error(`Node not found: ${nodePath}`);
    }
    return {
        uri: buildGodotUri({ type: 'nodes', projectPath, resourcePath: scenePath, nodePath }),
        mimeType: 'application/json',
        text: JSON.stringify({
            name: node.name,
            type: node.type,
            parent: node.parent,
            properties: node.properties
        }, null, 2)
    };
}
/**
 * Main resource reader that routes based on URI
 */
export async function readGodotResource(uri) {
    logger.info('Reading Godot resource', { uri });
    const parsed = parseGodotUri(uri);
    try {
        switch (parsed.type) {
            case 'project':
                return await readProjectResource(parsed.projectPath);
            case 'scenes':
                if (parsed.resourcePath) {
                    return await readSceneResource(parsed.projectPath, parsed.resourcePath);
                }
                else {
                    return await listScenesResource(parsed.projectPath);
                }
            case 'scripts':
                if (parsed.resourcePath) {
                    return await readScriptResource(parsed.projectPath, parsed.resourcePath);
                }
                else {
                    return await listScriptsResource(parsed.projectPath);
                }
            case 'nodes':
                if (parsed.resourcePath && parsed.nodePath) {
                    return await readNodeResource(parsed.projectPath, parsed.resourcePath, parsed.nodePath);
                }
                else {
                    throw new Error('Node URI requires both scene path and node path');
                }
            default:
                throw new Error(`Unsupported resource type: ${parsed.type}`);
        }
    }
    catch (error) {
        logger.error('Failed to read Godot resource', { uri, error });
        throw error;
    }
}
//# sourceMappingURL=godot-resources.js.map