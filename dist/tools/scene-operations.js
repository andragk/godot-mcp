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
// import { BackupManager } from '../utils/backup-manager.js'; // TODO: Uncomment when modify_scene is implemented
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
    // private backupManager: BackupManager; // TODO: Enable when modify_scene is implemented
    constructor() {
        this.validator = new SceneValidator();
        // this.backupManager = new BackupManager(); // TODO: Enable when modify_scene is implemented
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
     * TODO: Implement full modification operations
     */
    async modifyScene(_input) {
        // const validated = ModifySceneInputSchema.parse(input); // TODO: Uncomment when implementing
        throw new InternalError('modify_scene is not yet fully implemented. Only create_scene is currently available.');
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