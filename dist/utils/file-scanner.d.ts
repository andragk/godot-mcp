export interface FileMetadata {
    path: string;
    relativePath: string;
    size: number;
    modifiedTime: Date;
    extension: string;
}
export interface DirectoryStats {
    totalFiles: number;
    totalSize: number;
    filesByExtension: Record<string, number>;
}
export interface ScanOptions {
    extensions?: string[];
    maxDepth?: number;
    pattern?: RegExp;
    excludeDirs?: string[];
}
/**
 * Recursively scan directory for files matching criteria
 */
export declare function scanDirectory(dirPath: string, projectRoot: string, options?: ScanOptions): Promise<FileMetadata[]>;
/**
 * Calculate directory statistics
 */
export declare function calculateDirectoryStats(files: FileMetadata[]): Promise<DirectoryStats>;
/**
 * Read file content with caching support
 */
export declare function readFileContent(filePath: string): Promise<string>;
/**
 * Get file size in bytes
 */
export declare function getFileSize(filePath: string): Promise<number>;
/**
 * Check if file has been modified since timestamp
 */
export declare function isFileModifiedSince(filePath: string, timestamp: number): Promise<boolean>;
/**
 * Get file modification time
 */
export declare function getFileModificationTime(filePath: string): Promise<number>;
/**
 * Generate directory tree structure
 */
export interface DirectoryNode {
    name: string;
    type: 'file' | 'directory';
    path: string;
    size?: number;
    children?: DirectoryNode[];
}
export declare function generateDirectoryTree(dirPath: string, projectRoot: string, maxDepth?: number): Promise<DirectoryNode>;
//# sourceMappingURL=file-scanner.d.ts.map