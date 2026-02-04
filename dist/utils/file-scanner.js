/**
 * File system scanning utilities for Godot projects
 */
import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative, extname, basename } from 'node:path';
import { logger } from './logger.js';
/**
 * Recursively scan directory for files matching criteria
 */
export async function scanDirectory(dirPath, projectRoot, options = {}) {
    const { extensions, maxDepth = Infinity, pattern, excludeDirs = ['node_modules', '.git', '.godot', 'build', 'dist'], } = options;
    const results = [];
    async function scan(currentPath, depth) {
        if (depth > maxDepth) {
            return;
        }
        try {
            const entries = await readdir(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = join(currentPath, entry.name);
                if (entry.isDirectory()) {
                    // Skip excluded directories
                    if (excludeDirs.includes(entry.name)) {
                        continue;
                    }
                    await scan(fullPath, depth + 1);
                }
                else if (entry.isFile()) {
                    const ext = extname(entry.name);
                    // Filter by extension
                    if (extensions && !extensions.includes(ext)) {
                        continue;
                    }
                    // Filter by pattern
                    if (pattern && !pattern.test(entry.name)) {
                        continue;
                    }
                    const stats = await stat(fullPath);
                    const relativePath = relative(projectRoot, fullPath).replace(/\\/g, '/');
                    results.push({
                        path: fullPath,
                        relativePath,
                        size: stats.size,
                        modifiedTime: stats.mtime,
                        extension: ext,
                    });
                }
            }
        }
        catch (error) {
            logger.warn(`Failed to scan directory: ${currentPath}`, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    await scan(dirPath, 0);
    return results;
}
/**
 * Calculate directory statistics
 */
export async function calculateDirectoryStats(files) {
    const stats = {
        totalFiles: files.length,
        totalSize: 0,
        filesByExtension: {},
    };
    for (const file of files) {
        stats.totalSize += file.size;
        const ext = file.extension || 'no-extension';
        stats.filesByExtension[ext] = (stats.filesByExtension[ext] || 0) + 1;
    }
    return stats;
}
/**
 * Read file content with caching support
 */
export async function readFileContent(filePath) {
    try {
        return await readFile(filePath, 'utf-8');
    }
    catch (error) {
        throw new Error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Get file size in bytes
 */
export async function getFileSize(filePath) {
    try {
        const stats = await stat(filePath);
        return stats.size;
    }
    catch (error) {
        throw new Error(`Failed to get file size ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Check if file has been modified since timestamp
 */
export async function isFileModifiedSince(filePath, timestamp) {
    try {
        const stats = await stat(filePath);
        return stats.mtimeMs > timestamp;
    }
    catch (error) {
        // File doesn't exist or can't be accessed
        return true;
    }
}
/**
 * Get file modification time
 */
export async function getFileModificationTime(filePath) {
    try {
        const stats = await stat(filePath);
        return stats.mtimeMs;
    }
    catch (error) {
        throw new Error(`Failed to get modification time ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
export async function generateDirectoryTree(dirPath, projectRoot, maxDepth = 5) {
    async function buildTree(currentPath, depth) {
        const stats = await stat(currentPath);
        const name = basename(currentPath);
        if (!stats.isDirectory()) {
            return {
                name,
                type: 'file',
                path: relative(projectRoot, currentPath).replace(/\\/g, '/'),
                size: stats.size,
            };
        }
        const node = {
            name,
            type: 'directory',
            path: relative(projectRoot, currentPath).replace(/\\/g, '/'),
            children: [],
        };
        if (depth >= maxDepth) {
            return node;
        }
        try {
            const entries = await readdir(currentPath, { withFileTypes: true });
            const excludeDirs = ['node_modules', '.git', '.godot', 'build', 'dist'];
            for (const entry of entries) {
                if (entry.isDirectory() && excludeDirs.includes(entry.name)) {
                    continue;
                }
                const childPath = join(currentPath, entry.name);
                const childNode = await buildTree(childPath, depth + 1);
                node.children.push(childNode);
            }
            // Sort children: directories first, then files, alphabetically
            node.children.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });
        }
        catch (error) {
            logger.warn(`Failed to read directory: ${currentPath}`, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
        return node;
    }
    return buildTree(dirPath, 0);
}
//# sourceMappingURL=file-scanner.js.map