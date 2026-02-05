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
const NodeDefinitionSchema: z.ZodType<{
  name: string;
  type: string;
  properties?: Record<string, z.infer<typeof NodePropertyValueSchema>>;
  children?: any[];
}> = z.object({
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

export type CreateSceneInput = z.infer<typeof CreateSceneInputSchema>;
export type NodeDefinition = z.infer<typeof NodeDefinitionSchema>;
export type NodePropertyValue = z.infer<typeof NodePropertyValueSchema>;

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

export type ModifySceneInput = z.infer<typeof ModifySceneInputSchema>;
export type ModifyOperation = z.infer<typeof ModifyOperationSchema>;

/**
 * Create scene tool result
 */
export interface CreateSceneResult {
  success: boolean;
  scenePath: string;
  nodeCount: number;
  validationPassed: boolean;
  errors?: string[];
}

/**
 * Modify scene tool result
 */
export interface ModifySceneResult {
  success: boolean;
  scenePath: string;
  operationsApplied: number;
  backupCreated: boolean;
  backupPath?: string;
  validationPassed: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Scene Operations Tools
 */
export class SceneOperationsTools {
  private validator: SceneValidator;
  private backupManager: BackupManager;

  constructor() {
    this.validator = new SceneValidator();
    this.backupManager = new BackupManager();
  }

  /**
   * Create a new scene file
   */
  async createScene(input: unknown): Promise<CreateSceneResult> {
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
        throw new ValidationError(
          `Scene already exists: ${scenePath}`
        );
      } catch (error: any) {
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
        const errorMessages = validationResult.errors.map(e => 
          `${e.severity.toUpperCase()}: ${e.message} (line ${e.line})`
        );
        logger.warn('Generated scene failed validation', {
          service: 'godot-mcp',
          errors: errorMessages
        });
        
        // Only fail on errors, allow warnings
        const hasErrors = validationResult.errors.some(e => e.severity === 'error');
        if (hasErrors) {
          throw new ValidationError(
            'Generated scene content is invalid'
          );
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

    } catch (error: any) {
      if (error instanceof ValidationError) {
        throw error;
      }

      logger.error('Failed to create scene', {
        service: 'godot-mcp',
        error: error.message,
        stack: error.stack
      });

      throw new InternalError(
        `Failed to create scene: ${error.message}`
      );
    }
  }

  /**
   * Modify an existing scene file
   */
  async modifyScene(input: unknown): Promise<ModifySceneResult> {
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
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          throw new ValidationError(
            `Scene file does not exist: ${scenePath}`
          );
        }
        throw error;
      }

      // Create backup if requested
      let backupPath: string | undefined;
      if (createBackup) {
        const backup = await this.backupManager.createBackup(
          projectPath,
          scenePath,
          'modify_scene',
          { operationCount: operations.length }
        );
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
      const warnings: string[] = [];

      for (const operation of operations) {
        try {
          sceneContent = this.applyOperation(sceneContent, operation);
          operationsApplied++;
        } catch (error : any) {
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
          
          throw new InternalError(
            `Failed to apply operations: ${errorMsg}`
          );
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
            } else {
              // Restore original content if no backup was created
              await fs.writeFile(fullScenePath, originalContent, 'utf-8');
            }
            
            throw new ValidationError(
              `Modified scene failed validation: ${errorMessages.join('; ')}`
            );
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

    } catch (error: any) {
      if (error instanceof ValidationError) {
        throw error;
      }

      logger.error('Failed to modify scene', {
        service: 'godot-mcp',
        error: error.message,
        stack: error.stack
      });

      throw new InternalError(
        `Failed to modify scene: ${error.message}`
      );
    }
  }

  /**
   * Apply a single operation to scene content
   */
  private applyOperation(sceneContent: string, operation: ModifyOperation): string {
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
        throw new ValidationError(`Unknown operation type: ${(operation as any).operation}`);
    }
  }

  /**
   * Apply modify_property operation
   */
  private applyModifyProperty(
    sceneContent: string,
    operation: Extract<ModifyOperation, { operation: 'modify_property' }>
  ): string {
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

    const formattedValue = this.formatPropertyValue(value as NodePropertyValue);
    const propertyLine = `${property} = ${formattedValue}`;

    if (propertyIndex === -1) {
      // Property doesn't exist, add it after the node header
      lines.splice(nodeIndex + 1, 0, propertyLine);
    } else {
      // Property exists, replace it
      lines[propertyIndex] = propertyLine;
    }

    return lines.join('\n');
  }

  /**
   * Apply remove_node operation
   */
  private applyRemoveNode(
    sceneContent: string,
    operation: Extract<ModifyOperation, { operation: 'remove_node' }>
  ): string {
    const { nodePath } = operation;
    const lines = sceneContent.split('\n');
    
    // Find the node section
    const nodeIndex = this.findNodeSection(lines, nodePath);
    if (nodeIndex === -1) {
      throw new ValidationError(`Node not found: ${nodePath}`);
    }

    // Find the end of this node's section (next section start or EOF)
    let endIndex = nodeIndex + 1;
    for (let i = nodeIndex + 1; i < lines.length; i++) {
      if (lines[i].trim().startsWith('[')) {
        endIndex = i;
        break;
      }
      endIndex = i + 1;
    }

    // Remove the node section and any blank lines immediately after
    while (endIndex < lines.length && lines[endIndex].trim() === '') {
      endIndex++;
    }

    // Remove from nodeIndex to endIndex (exclusive)
    lines.splice(nodeIndex, endIndex - nodeIndex);

    // Also need to remove any child nodes
    const childPrefix = nodePath === '.' ? '' : `${nodePath}/`;
    const result = lines.filter(line => {
      const parentMatch = line.match(/parent="([^"]+)"/);
      if (parentMatch) {
        const parent = parentMatch[1];
        // Remove if parent is the removed node or a descendant
        if (parent === nodePath || parent.startsWith(childPrefix)) {
          return false;
        }
      }
      return true;
    });

    return result.join('\n');
  }

  /**
   * Apply add_node operation
   */
  private applyAddNode(
    sceneContent: string,
    operation: Extract<ModifyOperation, { operation: 'add_node' }>
  ): string {
    const { parentPath, node } = operation;
    const lines = sceneContent.split('\n');
    
    // Validate parent exists
    if (parentPath !== '.') {
      const parentIndex = this.findNodeSection(lines, parentPath);
      if (parentIndex === -1) {
        throw new ValidationError(`Parent node not found: ${parentPath}`);
      }
    }

    // Check if node with this name already exists under this parent
    const existingIndex = this.findNodeSection(lines, 
      parentPath === '.' ? node.name : `${parentPath}/${node.name}`
    );
    if (existingIndex !== -1) {
      throw new ValidationError(
        `Node '${node.name}' already exists under parent '${parentPath}'`
      );
    }

    // Generate node content
    const nodeLines: string[] = [];
    const nodeHeader = parentPath === '.'
      ? `[node name="${node.name}" type="${node.type}"]`
      : `[node name="${node.name}" type="${node.type}" parent="${parentPath}"]`;
    
    nodeLines.push(nodeHeader);

    // Add properties
    if (node.properties && Object.keys(node.properties).length > 0) {
      for (const [key, value] of Object.entries(node.properties)) {
        const formattedValue = this.formatPropertyValue(value as NodePropertyValue);
        nodeLines.push(`${key} = ${formattedValue}`);
      }
    }

    nodeLines.push(''); // Blank line after node

    // Find where to insert the new node
    // Insert after the last child of the parent, or after the parent itself
    let insertIndex = lines.length;
    
    if (parentPath === '.') {
      // For root's children, find the last node with parent="."
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('[node ') && line.includes('parent="."')) {
          // Find the end of this node's section
          insertIndex = i + 1;
          while (insertIndex < lines.length && !lines[insertIndex].trim().startsWith('[')) {
            insertIndex++;
          }
          break;
        }
      }
      
      // If no children found, insert after root node
      if (insertIndex === lines.length) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('[node ') && !line.includes('parent=')) {
            insertIndex = i + 1;
            while (insertIndex < lines.length && !lines[insertIndex].trim().startsWith('[')) {
              insertIndex++;
            }
            break;
          }
        }
      }
    } else {
      // For non-root parents, find the last child of this parent
      const parentPrefix = `${parentPath}/`;
      let lastChildIndex = -1;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('[node ')) {
          const parentMatch = line.match(/parent="([^"]+)"/);
          if (parentMatch) {
            const parent = parentMatch[1];
            if (parent === parentPath || parent.startsWith(parentPrefix)) {
              lastChildIndex = i;
            }
          }
        }
      }
      
      if (lastChildIndex !== -1) {
        // Insert after the last child
        insertIndex = lastChildIndex + 1;
        while (insertIndex < lines.length && !lines[insertIndex].trim().startsWith('[')) {
          insertIndex++;
        }
      } else {
        // No children found, insert after parent
        const parentIndex = this.findNodeSection(lines, parentPath);
        insertIndex = parentIndex + 1;
        while (insertIndex < lines.length && !lines[insertIndex].trim().startsWith('[')) {
          insertIndex++;
        }
      }
    }

    // Insert the new node
    lines.splice(insertIndex, 0, ...nodeLines);

    // Recursively add children if specified
    let result = lines.join('\n');
    if (node.children && node.children.length > 0) {
      const newNodePath = parentPath === '.' ? node.name : `${parentPath}/${node.name}`;
      for (const child of node.children) {
        result = this.applyAddNode(result, {
          operation: 'add_node',
          parentPath: newNodePath,
          node: child as NodeDefinition
        });
      }
    }

    return result;
  }

  /**
   * Apply rename_node operation
   */
  private applyRenameNode(
    sceneContent: string,
    operation: Extract<ModifyOperation, { operation: 'rename_node' }>
  ): string {
    const { nodePath, newName } = operation;
    const lines = sceneContent.split('\n');
    
    // Find the node section
    const nodeIndex = this.findNodeSection(lines, nodePath);
    if (nodeIndex === -1) {
      throw new ValidationError(`Node not found: ${nodePath}`);
    }

    // Get parent path for checking duplicate names
    const pathParts = nodePath.split('/');
    const parentPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '.';

    // Check if a node with the new name already exists under the same parent
    const newPath = parentPath === '.' ? newName : `${parentPath}/${newName}`;
    const duplicateIndex = this.findNodeSection(lines, newPath);
    if (duplicateIndex !== -1 && duplicateIndex !== nodeIndex) {
      throw new ValidationError(
        `A node named '${newName}' already exists under parent '${parentPath}'`
      );
    }

    // Replace the name in the node header
    const line = lines[nodeIndex];
    const updatedLine = line.replace(
      /name="[^"]+"/,
      `name="${newName}"`
    );
    lines[nodeIndex] = updatedLine;

    // Update all child nodes' parent paths
    const oldPrefix = nodePath === '.' ? '' : `${nodePath}/`;
    const newPrefix = newPath === '.' ? '' : `${newPath}/`;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('[node ')) {
        const parentMatch = line.match(/parent="([^"]+)"/);
        if (parentMatch) {
          const parent = parentMatch[1];
          if (parent === nodePath) {
            // Direct child
            lines[i] = lines[i].replace(
              /parent="[^"]+"/,
              `parent="${newPath}"`
            );
          } else if (parent.startsWith(oldPrefix)) {
            // Descendant
            const newParent = newPrefix + parent.substring(oldPrefix.length);
            lines[i] = lines[i].replace(
              /parent="[^"]+"/,
              `parent="${newParent}"`
            );
          }
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Apply reparent_node operation
   */
  private applyReparentNode(
    sceneContent: string,
    operation: Extract<ModifyOperation, { operation: 'reparent_node' }>
  ): string {
    const { nodePath, newParentPath } = operation;
    const lines = sceneContent.split('\n');
    
    // Validate node exists
    const nodeIndex = this.findNodeSection(lines, nodePath);
    if (nodeIndex === -1) {
      throw new ValidationError(`Node not found: ${nodePath}`);
    }

    // Validate new parent exists
    if (newParentPath !== '.') {
      const newParentIndex = this.findNodeSection(lines, newParentPath);
      if (newParentIndex === -1) {
        throw new ValidationError(`New parent node not found: ${newParentPath}`);
      }
    }

    // Prevent moving a node to be a child of itself or its descendants
    if (newParentPath === nodePath || newParentPath.startsWith(`${nodePath}/`)) {
      throw new ValidationError(
        `Cannot reparent node to itself or its descendant`
      );
    }

    // Get node name
    const pathParts = nodePath.split('/');
    const nodeName = pathParts[pathParts.length - 1];

    // Check if a node with this name already exists under the new parent
    const newPath = newParentPath === '.' ? nodeName : `${newParentPath}/${nodeName}`;
    const duplicateIndex = this.findNodeSection(lines, newPath);
    if (duplicateIndex !== -1 && duplicateIndex !== nodeIndex) {
      throw new ValidationError(
        `A node named '${nodeName}' already exists under parent '${newParentPath}'`
      );
    }

    // Update the node's parent attribute
    const line = lines[nodeIndex];
    
    if (newParentPath === '.') {
      // Moving to root level - should have parent="."
      if (line.includes('parent=')) {
        lines[nodeIndex] = line.replace(/parent="[^"]+"/, 'parent="."');
      } else {
        // This shouldn't happen (only root has no parent), but handle it
        lines[nodeIndex] = line.replace(
          /]$/,
          ` parent="."]`
        );
      }
    } else {
      // Moving to a non-root parent
      if (line.includes('parent=')) {
        lines[nodeIndex] = line.replace(/parent="[^"]+"/, `parent="${newParentPath}"`);
      } else {
        // Moving from root to non-root
        lines[nodeIndex] = line.replace(
          /]$/,
          ` parent="${newParentPath}"]`
        );
      }
    }

    // Update all descendant nodes' parent paths
    const oldPrefix = nodePath === '.' ? '' : `${nodePath}/`;
    const newPrefix = newPath === '.' ? '' : `${newPath}/`;
    
    for (let i = 0; i < lines.length; i++) {
      if (i === nodeIndex) continue;
      
      const line = lines[i].trim();
      if (line.startsWith('[node ')) {
        const parentMatch = line.match(/parent="([^"]+)"/);
        if (parentMatch) {
          const parent = parentMatch[1];
          if (parent === nodePath) {
            // Direct child
            lines[i] = lines[i].replace(
              /parent="[^"]+"/,
              `parent="${newPath}"`
            );
          } else if (oldPrefix && parent.startsWith(oldPrefix)) {
            // Descendant
            const newParent = newPrefix + parent.substring(oldPrefix.length);
            lines[i] = lines[i].replace(
              /parent="[^"]+"/,
              `parent="${newParent}"`
            );
          }
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Find node section in scene file
   * Returns the line index of the node header, or -1 if not found
   */
  private findNodeSection(lines: string[], nodePath: string): number {
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
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Generate scene file content
   */
  private generateSceneContent(
    rootNode: NodeDefinition,
    format: number,
    description?: string
  ): string {
    const lines: string[] = [];

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
  private generateNodes(
    node: NodeDefinition,
    parent: string,
    lines: string[],
    depth: number = 0
  ): void {
    // Node header
    const nodeHeader = depth === 0
      ? `[node name="${node.name}" type="${node.type}"]`
      : `[node name="${node.name}" type="${node.type}" parent="${parent}"]`;
    
    lines.push(nodeHeader);

    // Node properties
    if (node.properties && Object.keys(node.properties).length > 0) {
      for (const [key, value] of Object.entries(node.properties)) {
        const formattedValue = this.formatPropertyValue(value as NodePropertyValue);
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
  private formatPropertyValue(value: NodePropertyValue): string {
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
      const { type, value: components } = value as { type: string; value: number[] | Record<string, number> };
      
      if (Array.isArray(components)) {
        return `${type}(${components.join(', ')})`;
      } else {
        // For Transform types with named components
        const parts = Object.entries(components).map(([k, v]) => `${k}: ${v}`);
        return `${type}(${parts.join(', ')})`;
      }
    }

    throw new ValidationError(
      `Unsupported property value type: ${typeof value}`
    );
  }

  /**
   * Count total nodes in hierarchy
   */
  private countNodes(node: NodeDefinition): number {
    let count = 1; // Current node
    if (node.children) {
      for (const child of node.children) {
        count += this.countNodes(child);
      }
    }
    return count;
  }
}
