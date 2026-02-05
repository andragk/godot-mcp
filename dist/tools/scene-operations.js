/**
 * Scene Operations Tools
 *
 * Provides tools for creating and modifying Godot scene files (.tscn).
 * Integrates with SceneValidator for validation and BackupManager for rollback.
 */
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import { validatePath } from '../utils/path-validator.js';
import { SceneValidator } from '../utils/scene-validator.js';
import { BackupManager } from '../utils/backup-manager.js';
import { ValidationError, InternalError } from '../types/errors.js';
/**
 * Node property value types
 */
const NodePropertyValueSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.object({
        type: z.enum(['Vector2', 'Vector3', 'Color', 'Transform2D', 'Transform3D']),
        value: z.union([z.array(z.number()), z.record(z.number())])
    })
]);
/**
 * Node definition for scene creation
 */
const NodeDefinitionSchema = z.object({
    name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Node name must be valid identifier'),
    type: z.string().min(1, 'Node type is required'),
    properties: z.record(NodePropertyValueSchema).optional(),
    children: z.array(z.lazy(() => NodeDefinitionSchema)).optional()
});
/**
 * Create scene tool input schema
 */
export const CreateSceneInputSchema = z.object({
    projectPath: z.string().min(1, 'Project path is required'),
    scenePath: z.string().min(1, 'Scene path is required')
        .regex(/\.tscn$/, 'Scene path must end with .tscn'),
    rootNode: NodeDefinitionSchema,
    format: z.number().int().min(1).max(3).default(3),
    description: z.string().optional()
});
/**
 * Modify scene operation types
 */
const ModifyOperationSchema = z.discriminatedUnion('operation', [
    z.object({
        operation: z.literal('add_node'),
        parentPath: z.string().describe('Path to parent node (e.g., "." for root, "Player" for child of root)'),
        node: NodeDefinitionSchema.describe('Node to add'),
    }),
    z.object({
        operation: z.literal('remove_node'),
        nodePath: z.string().describe('Path to node to remove'),
    }),
    z.object({
        operation: z.literal('modify_property'),
        nodePath: z.string().describe('Path to node'),
        property: z.string().describe('Property name'),
        value: NodePropertyValueSchema.describe('New property value'),
    }),
    z.object({
        operation: z.literal('rename_node'),
        nodePath: z.string().describe('Path to node to rename'),
        newName: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'New name must be valid identifier'),
    }),
    z.object({
        operation: z.literal('reparent_node'),
        nodePath: z.string().describe('Path to node to move'),
        newParentPath: z.string().describe('Path to new parent node'),
    }),
]);
/**
 * Modify scene tool input schema
 */
export const ModifySceneInputSchema = z.object({
    projectPath: z.string().min(1, 'Project path is required'),
    scenePath: z.string().min(1, 'Scene path is required')
        .regex(/\.tscn$/, 'Scene path must end with .tscn'),
    operations: z.array(ModifyOperationSchema).min(1, 'At least one operation is required'),
    createBackup: z.boolean().optional().default(true),
    validateAfter: z.boolean().optional().default(true),
});
/**
 * Scene Operations Tools
 */
export class SceneOperationsTools {
    validator;
    backupManager;
    constructor() {
        this.validator = new SceneValidator();
        this.backupManager = new BackupManager();
    }
    /**
     * Create a new scene file
     */
    async createScene(input) {
        const validated = CreateSceneInputSchema.parse(input);
        const { projectPath, scenePath, rootNode, format, description } = validated;
        logger.info('Creating scene', {
            service: 'godot-mcp',
            projectPath,
            scenePath,
            rootType: rootNode.type
        });
        try {
            // Validate project path
            await validatePath(projectPath, {
                mustExist: true,
                allowAbsolute: true
            });
            const fullScenePath = path.resolve(projectPath, scenePath);
            // Check if scene already exists
            try {
                await fs.access(fullScenePath);
                throw new ValidationError(`Scene already exists: ${scenePath}`);
            }
            catch (error) {
                if (error.code !== 'ENOENT') {
                    throw error;
                }
                // File doesn't exist, continue
            }
            // Ensure parent directory exists
            const sceneDir = path.dirname(fullScenePath);
            await fs.mkdir(sceneDir, { recursive: true });
            // Generate scene content
            const sceneContent = this.generateSceneContent(rootNode, format, description);
            // Validate generated content
            const validationResult = this.validator.validate(sceneContent);
            if (!validationResult.valid) {
                const errorMessages = validationResult.errors.map(e => `${e.severity.toUpperCase()}: ${e.message} (line ${e.line})`);
                logger.warn('Generated scene failed validation', {
                    service: 'godot-mcp',
                    errors: errorMessages
                });
                // Only fail on errors, allow warnings
                const hasErrors = validationResult.errors.some(e => e.severity === 'error');
                if (hasErrors) {
                    throw new ValidationError('Generated scene content is invalid');
                }
            }
            // Write scene file
            await fs.writeFile(fullScenePath, sceneContent, 'utf-8');
            // Count nodes
            const nodeCount = this.countNodes(rootNode);
            logger.info('Scene created successfully', {
                service: 'godot-mcp',
                scenePath: fullScenePath,
                nodeCount,
                validationPassed: validationResult.valid
            });
            return {
                success: true,
                scenePath: fullScenePath,
                nodeCount,
                validationPassed: validationResult.valid,
                errors: validationResult.errors.length > 0
                    ? validationResult.errors.map(e => `${e.severity}: ${e.message}`)
                    : undefined
            };
        }
        catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            logger.error('Failed to create scene', {
                service: 'godot-mcp',
                error: error.message,
                stack: error.stack
            });
            throw new InternalError(`Failed to create scene: ${error.message}`);
        }
    }
    /**
     * Modify an existing scene file
     */
    async modifyScene(input) {
        const validated = ModifySceneInputSchema.parse(input);
        const { projectPath, scenePath, operations, createBackup, validateAfter } = validated;
        logger.info('Modifying scene', {
            service: 'godot-mcp',
            projectPath,
            scenePath,
            operationCount: operations.length,
            createBackup
        });
        try {
            // Validate project path
            await validatePath(projectPath, {
                mustExist: true,
                allowAbsolute: true
            });
            const fullScenePath = path.resolve(projectPath, scenePath);
            // Check if scene exists
            try {
                await fs.access(fullScenePath);
            }
            catch (error) {
                if (error.code === 'ENOENT') {
                    throw new ValidationError(`Scene file does not exist: ${scenePath}`);
                }
                throw error;
            }
            // Create backup if requested
            let backupPath;
            if (createBackup) {
                const backup = await this.backupManager.createBackup(projectPath, scenePath, 'modify_scene', { operationCount: operations.length });
                backupPath = backup.backupPath;
                logger.info('Backup created', {
                    service: 'godot-mcp',
                    backupPath
                });
            }
            // Read scene file
            let sceneContent = await fs.readFile(fullScenePath, 'utf-8');
            const originalContent = sceneContent;
            // Apply operations
            let operationsApplied = 0;
            const warnings = [];
            for (const operation of operations) {
                try {
                    sceneContent = this.applyOperation(sceneContent, operation);
                    operationsApplied++;
                }
                catch (error) {
                    const errorMsg = `Operation ${operation.operation} failed: ${error.message}`;
                    logger.error(errorMsg, {
                        service: 'godot-mcp',
                        operation: operation.operation,
                        error: error.message
                    });
                    // Rollback on first error
                    if (backupPath) {
                        logger.info('Rolling back due to error', {
                            service: 'godot-mcp',
                            backupPath
                        });
                        await this.backupManager.restoreBackup(projectPath, backupPath);
                    }
                    throw new InternalError(`Failed to apply operations: ${errorMsg}`);
                }
            }
            // Validate modified scene if requested
            if (validateAfter) {
                const validationResult = this.validator.validate(sceneContent);
                if (!validationResult.valid) {
                    const errorMessages = validationResult.errors
                        .filter(e => e.severity === 'error')
                        .map(e => `${e.message} (line ${e.line})`);
                    if (errorMessages.length > 0) {
                        logger.warn('Modified scene failed validation, rolling back', {
                            service: 'godot-mcp',
                            errors: errorMessages
                        });
                        // Rollback
                        if (backupPath) {
                            await this.backupManager.restoreBackup(projectPath, backupPath);
                        }
                        else {
                            // Restore original content if no backup was created
                            await fs.writeFile(fullScenePath, originalContent, 'utf-8');
                        }
                        throw new ValidationError(`Modified scene failed validation: ${errorMessages.join('; ')}`);
                    }
                    // Add warnings but don't fail
                    validationResult.errors
                        .filter(e => e.severity === 'warning')
                        .forEach(e => warnings.push(`${e.message} (line ${e.line})`));
                }
            }
            // Write modified scene
            await fs.writeFile(fullScenePath, sceneContent, 'utf-8');
            logger.info('Scene modified successfully', {
                service: 'godot-mcp',
                scenePath: fullScenePath,
                operationsApplied,
                backupCreated: !!backupPath,
                warningsCount: warnings.length
            });
            return {
                success: true,
                scenePath: fullScenePath,
                operationsApplied,
                backupCreated: !!backupPath,
                backupPath,
                validationPassed: validateAfter ? warnings.length === 0 : true,
                warnings: warnings.length > 0 ? warnings : undefined
            };
        }
        catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            logger.error('Failed to modify scene', {
                service: 'godot-mcp',
                error: error.message,
                stack: error.stack
            });
            throw new InternalError(`Failed to modify scene: ${error.message}`);
        }
    }
    /**
     * Apply a single operation to scene content
     */
    applyOperation(sceneContent, operation) {
        switch (operation.operation) {
            case 'modify_property':
                return this.applyModifyProperty(sceneContent, operation);
            case 'remove_node':
                return this.applyRemoveNode(sceneContent, operation);
            case 'add_node':
                return this.applyAddNode(sceneContent, operation);
            case 'rename_node':
                return this.applyRenameNode(sceneContent, operation);
            case 'reparent_node':
                return this.applyReparentNode(sceneContent, operation);
            default:
                throw new ValidationError(`Unknown operation type: ${operation.operation}`);
        }
    }
    /**
     * Apply modify_property operation
     */
    applyModifyProperty(sceneContent, operation) {
        const { nodePath, property, value } = operation;
        const lines = sceneContent.split('\n');
        // Find the node section
        const nodeIndex = this.findNodeSection(lines, nodePath);
        if (nodeIndex === -1) {
            throw new ValidationError(`Node not found: ${nodePath}`);
        }
        // Find the property within the node section
        const propertyPattern = new RegExp(`^${this.escapeRegex(property)}\\s*=`);
        let propertyIndex = -1;
        // Search from node header until next node or end
        for (let i = nodeIndex + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            // Stop if we hit another section
            if (line.startsWith('[')) {
                break;
            }
            if (propertyPattern.test(line)) {
                propertyIndex = i;
                break;
            }
        }
        const formattedValue = this.formatPropertyValue(value);
        const propertyLine = `${property} = ${formattedValue}`;
        if (propertyIndex === -1) {
            // Property doesn't exist, add it after the node header
            lines.splice(nodeIndex + 1, 0, propertyLine);
        }
        else {
            // Property exists, replace it
            lines[propertyIndex] = propertyLine;
        }
        return lines.join('\n');
    }
    /**
     * Apply remove_node operation (stub)
     */
    applyRemoveNode(_sceneContent, _operation) {
        throw new InternalError('remove_node operation not yet implemented');
    }
    /**
     * Apply add_node operation (stub)
     */
    applyAddNode(_sceneContent, _operation) {
        throw new InternalError('add_node operation not yet implemented');
    }
    /**
     * Apply rename_node operation (stub)
     */
    applyRenameNode(_sceneContent, _operation) {
        throw new InternalError('rename_node operation not yet implemented');
    }
    /**
     * Apply reparent_node operation (stub)
     */
    applyReparentNode(_sceneContent, _operation) {
        throw new InternalError('reparent_node operation not yet implemented');
    }
    /**
     * Find node section in scene file
     * Returns the line index of the node header, or -1 if not found
     */
    findNodeSection(lines, nodePath) {
        // Handle root node (path is ".")
        if (nodePath === '.') {
            // Find first node without parent attribute
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('[node ') && !line.includes('parent=')) {
                    return i;
                }
            }
            return -1;
        }
        // For non-root nodes, find by name and parent path
        const pathParts = nodePath.split('/');
        const nodeName = pathParts[pathParts.length - 1];
        const parentPath = pathParts.length > 1
            ? pathParts.slice(0, -1).join('/')
            : '.';
        const namePattern = new RegExp(`name="(${this.escapeRegex(nodeName)})"`);
        const parentPattern = parentPath === '.'
            ? /parent="\."/
            : new RegExp(`parent="(${this.escapeRegex(parentPath)})"`);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('[node ')) {
                // Check if this node matches both name and parent
                if (namePattern.test(line) && (parentPath === '.' ? !line.includes('parent=') : parentPattern.test(line))) {
                    return i;
                }
            }
        }
        return -1;
    }
    /**
     * Escape special regex characters
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    /**
     * Generate scene file content
     */
    generateSceneContent(rootNode, format, description) {
        const lines = [];
        // Header
        lines.push(`[gd_scene load_steps=1 format=${format}]`);
        lines.push('');
        // Description comment (optional)
        if (description) {
            lines.push(`; ${description}`);
            lines.push('');
        }
        // Generate nodes recursively
        this.generateNodes(rootNode, '.', lines);
        return lines.join('\n') + '\n';
    }
    /**
     * Generate node definitions recursively
     */
    generateNodes(node, parent, lines, depth = 0) {
        // Node header
        const nodeHeader = depth === 0
            ? `[node name="${node.name}" type="${node.type}"]`
            : `[node name="${node.name}" type="${node.type}" parent="${parent}"]`;
        lines.push(nodeHeader);
        // Node properties
        if (node.properties && Object.keys(node.properties).length > 0) {
            for (const [key, value] of Object.entries(node.properties)) {
                const formattedValue = this.formatPropertyValue(value);
                lines.push(`${key} = ${formattedValue}`);
            }
        }
        lines.push('');
        // Children
        if (node.children && node.children.length > 0) {
            const childParent = depth === 0 ? '.' : `${parent}/${node.name}`;
            for (const child of node.children) {
                this.generateNodes(child, childParent, lines, depth + 1);
            }
        }
    }
    /**
     * Format property value for .tscn format
     */
    formatPropertyValue(value) {
        if (typeof value === 'string') {
            // Escape quotes and special characters
            const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            return `"${escaped}"`;
        }
        if (typeof value === 'number') {
            return value.toString();
        }
        if (typeof value === 'boolean') {
            return value.toString();
        }
        // Complex types (Vector2, Vector3, Color, etc.)
        if (typeof value === 'object' && 'type' in value) {
            const { type, value: components } = value;
            if (Array.isArray(components)) {
                return `${type}(${components.join(', ')})`;
            }
            else {
                // For Transform types with named components
                const parts = Object.entries(components).map(([k, v]) => `${k}: ${v}`);
                return `${type}(${parts.join(', ')})`;
            }
        }
        throw new ValidationError(`Unsupported property value type: ${typeof value}`);
    }
    /**
     * Count total nodes in hierarchy
     */
    countNodes(node) {
        let count = 1; // Current node
        if (node.children) {
            for (const child of node.children) {
                count += this.countNodes(child);
            }
        }
        return count;
    }
}
//# sourceMappingURL=scene-operations.js.map