/**
 * Path validation options
 */
export interface PathValidationOptions {
    /**
     * Base directory that paths must be within (for relative paths)
     */
    baseDir?: string;
    /**
     * Whether absolute paths are allowed
     * @default false
     */
    allowAbsolute?: boolean;
    /**
     * Whether the path must exist
     * @default false
     */
    mustExist?: boolean;
    /**
     * Required permissions to check (read, write, execute)
     */
    requiredPermissions?: ('read' | 'write' | 'execute')[];
    /**
     * Maximum path length
     * @default 4096
     */
    maxLength?: number;
    /**
     * Allowed file extensions (if empty, all extensions allowed)
     */
    allowedExtensions?: string[];
}
/**
 * Validate a file path for security and correctness
 * @param path Path to validate
 * @param options Validation options
 * @returns Normalized absolute path
 * @throws ValidationError if path is invalid or unsafe
 */
export declare function validatePath(path: string, options?: PathValidationOptions): Promise<string>;
/**
 * Validate multiple paths
 * @param paths Paths to validate
 * @param options Validation options
 * @returns Array of normalized absolute paths
 * @throws ValidationError if any path is invalid
 */
export declare function validatePaths(paths: string[], options?: PathValidationOptions): Promise<string[]>;
/**
 * Synchronous path validation (without filesystem checks)
 * @param path Path to validate
 * @param options Validation options (mustExist and requiredPermissions ignored)
 * @returns Normalized absolute path
 * @throws ValidationError if path is invalid
 */
export declare function validatePathSync(path: string, options?: Omit<PathValidationOptions, 'mustExist' | 'requiredPermissions'>): string;
/**
 * Check if a path is safe (basic check without throwing)
 * @param path Path to check
 * @returns true if path appears safe
 */
export declare function isPathSafe(path: string): boolean;
//# sourceMappingURL=path-validator.d.ts.map