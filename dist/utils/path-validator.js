/**
 * Path Validation Utilities
 * Provides secure path validation to prevent path traversal attacks
 */
import { resolve, normalize, isAbsolute, sep } from 'path';
import { access, constants } from 'fs/promises';
import { ValidationError } from '../types/errors.js';
/**
 * Dangerous path patterns that indicate potential attacks
 */
function getDangerousPatterns(allowAbsolute) {
    const patterns = [
        /\.\./, // Parent directory traversal
        /~[\\\/]/, // Home directory reference
        /\0/, // Null byte injection
        /[<>"|?*]/, // Invalid filename characters (excluding : for Windows drive letters)
    ];
    // Only check for absolute paths if not allowed
    if (!allowAbsolute) {
        patterns.push(/^[\\\/]/); // Root directory (Unix)
        patterns.push(/^[a-z]:[\\\/]/i); // Drive letter (Windows)
    }
    return patterns;
}
/**
 * Validate a file path for security and correctness
 * @param path Path to validate
 * @param options Validation options
 * @returns Normalized absolute path
 * @throws ValidationError if path is invalid or unsafe
 */
export async function validatePath(path, options = {}) {
    const { baseDir, allowAbsolute = false, mustExist = false, requiredPermissions = [], maxLength = 4096, allowedExtensions = [], } = options;
    // Check for empty path
    if (!path || path.trim().length === 0) {
        throw new ValidationError('Path cannot be empty');
    }
    // Check path length
    if (path.length > maxLength) {
        throw new ValidationError(`Path exceeds maximum length of ${maxLength} characters`);
    }
    // Check for dangerous patterns
    const dangerousPatterns = getDangerousPatterns(allowAbsolute);
    for (const pattern of dangerousPatterns) {
        if (pattern.test(path)) {
            throw new ValidationError(`Path contains dangerous pattern: ${path}`);
        }
    }
    // Check for null bytes
    if (path.includes('\0')) {
        throw new ValidationError('Path contains null byte');
    }
    // Normalize path
    const normalizedPath = normalize(path);
    // Check absolute path restrictions
    if (isAbsolute(normalizedPath) && !allowAbsolute) {
        throw new ValidationError('Absolute paths are not allowed');
    }
    // Resolve to absolute path
    const absolutePath = baseDir
        ? resolve(baseDir, normalizedPath)
        : resolve(normalizedPath);
    // Check if path is within base directory (prevents traversal)
    if (baseDir) {
        const resolvedBaseDir = resolve(baseDir);
        if (!absolutePath.startsWith(resolvedBaseDir + sep) && absolutePath !== resolvedBaseDir) {
            throw new ValidationError(`Path is outside allowed directory: ${path}`);
        }
    }
    // Check file extension
    if (allowedExtensions.length > 0) {
        const ext = absolutePath.split('.').pop()?.toLowerCase();
        if (!ext || !allowedExtensions.includes(ext)) {
            throw new ValidationError(`File extension must be one of: ${allowedExtensions.join(', ')}`);
        }
    }
    // Check existence
    if (mustExist) {
        try {
            await access(absolutePath, constants.F_OK);
        }
        catch {
            throw new ValidationError(`Path does not exist: ${path}`);
        }
    }
    // Check permissions
    if (requiredPermissions.length > 0) {
        const permissionFlags = requiredPermissions.reduce((flags, perm) => {
            switch (perm) {
                case 'read':
                    return flags | constants.R_OK;
                case 'write':
                    return flags | constants.W_OK;
                case 'execute':
                    return flags | constants.X_OK;
                default:
                    return flags;
            }
        }, constants.F_OK);
        try {
            await access(absolutePath, permissionFlags);
        }
        catch {
            throw new ValidationError(`Insufficient permissions for path: ${path} (required: ${requiredPermissions.join(', ')})`);
        }
    }
    return absolutePath;
}
/**
 * Validate multiple paths
 * @param paths Paths to validate
 * @param options Validation options
 * @returns Array of normalized absolute paths
 * @throws ValidationError if any path is invalid
 */
export async function validatePaths(paths, options = {}) {
    const validatedPaths = [];
    for (const path of paths) {
        const validatedPath = await validatePath(path, options);
        validatedPaths.push(validatedPath);
    }
    return validatedPaths;
}
/**
 * Synchronous path validation (without filesystem checks)
 * @param path Path to validate
 * @param options Validation options (mustExist and requiredPermissions ignored)
 * @returns Normalized absolute path
 * @throws ValidationError if path is invalid
 */
export function validatePathSync(path, options = {}) {
    const { baseDir, allowAbsolute = false, maxLength = 4096, allowedExtensions = [], } = options;
    // Check for empty path
    if (!path || path.trim().length === 0) {
        throw new ValidationError('Path cannot be empty');
    }
    // Check path length
    if (path.length > maxLength) {
        throw new ValidationError(`Path exceeds maximum length of ${maxLength} characters`);
    }
    // Check for dangerous patterns
    const dangerousPatterns = getDangerousPatterns(allowAbsolute);
    for (const pattern of dangerousPatterns) {
        if (pattern.test(path)) {
            throw new ValidationError(`Path contains dangerous pattern: ${path}`);
        }
    }
    // Check for null bytes
    if (path.includes('\0')) {
        throw new ValidationError('Path contains null byte');
    }
    // Normalize path
    const normalizedPath = normalize(path);
    // Check absolute path restrictions
    if (isAbsolute(normalizedPath) && !allowAbsolute) {
        throw new ValidationError('Absolute paths are not allowed');
    }
    // Resolve to absolute path
    const absolutePath = baseDir
        ? resolve(baseDir, normalizedPath)
        : resolve(normalizedPath);
    // Check if path is within base directory
    if (baseDir) {
        const resolvedBaseDir = resolve(baseDir);
        if (!absolutePath.startsWith(resolvedBaseDir + sep) && absolutePath !== resolvedBaseDir) {
            throw new ValidationError(`Path is outside allowed directory: ${path}`);
        }
    }
    // Check file extension
    if (allowedExtensions.length > 0) {
        const ext = absolutePath.split('.').pop()?.toLowerCase();
        if (!ext || !allowedExtensions.includes(ext)) {
            throw new ValidationError(`File extension must be one of: ${allowedExtensions.join(', ')}`);
        }
    }
    return absolutePath;
}
/**
 * Check if a path is safe (basic check without throwing)
 * @param path Path to check
 * @returns true if path appears safe
 */
export function isPathSafe(path) {
    try {
        validatePathSync(path);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=path-validator.js.map