/**
 * Script Operations Tools
 *
 * Provides tools for creating, modifying, and validating Godot script files.
 */
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../utils/logger.js';
import { validatePath } from '../utils/path-validator.js';
import { BackupManager } from '../utils/backup-manager.js';
import { ValidationError, InternalError } from '../types/errors.js';
const execFileAsync = promisify(execFile);
const ScriptTemplateSchema = z.enum([
    'empty',
    'node',
    'character_body_2d',
    'area_2d',
    'resource',
]);
const ScriptChangeSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('replace'),
        startLine: z.number().int().min(1),
        endLine: z.number().int().min(1),
        newContent: z.string(),
    }),
    z.object({
        type: z.literal('insert'),
        startLine: z.number().int().min(1),
        newContent: z.string(),
    }),
    z.object({
        type: z.literal('delete'),
        startLine: z.number().int().min(1),
        endLine: z.number().int().min(1),
    }),
]);
export const CreateScriptInputSchema = z.object({
    projectPath: z.string().min(1, 'Project path is required'),
    scriptPath: z
        .string()
        .min(1, 'Script path is required')
        .regex(/\.(gd|cs)$/, 'Script path must end with .gd or .cs'),
    content: z.string().optional(),
    template: ScriptTemplateSchema.optional().default('node'),
    overwrite: z.boolean().optional().default(false),
    attachToScene: z
        .object({
        scenePath: z.string().min(1),
        nodePath: z.string().min(1),
    })
        .optional(),
    validate: z.boolean().optional().default(true),
    editorPath: z.string().optional(),
});
export const ModifyScriptInputSchema = z.object({
    projectPath: z.string().min(1, 'Project path is required'),
    scriptPath: z
        .string()
        .min(1, 'Script path is required')
        .regex(/\.(gd|cs)$/, 'Script path must end with .gd or .cs'),
    changes: z.array(ScriptChangeSchema).min(1, 'At least one change is required'),
    createBackup: z.boolean().optional().default(true),
    validateAfter: z.boolean().optional().default(true),
    editorPath: z.string().optional(),
});
export const ValidateScriptInputSchema = z.object({
    projectPath: z.string().min(1, 'Project path is required'),
    scriptPath: z
        .string()
        .min(1, 'Script path is required')
        .regex(/\.(gd|cs)$/, 'Script path must end with .gd or .cs'),
    editorPath: z.string().optional(),
});
export class ScriptOperationsTools {
    backupManager = new BackupManager();
    async createScript(input) {
        const validated = CreateScriptInputSchema.parse(input);
        const { projectPath, scriptPath, content, template, overwrite, attachToScene, validate, editorPath, } = validated;
        try {
            const validatedProjectPath = await validatePath(projectPath, {
                mustExist: true,
                allowAbsolute: true,
            });
            const fullScriptPath = await validatePath(scriptPath, {
                baseDir: validatedProjectPath,
                allowedExtensions: ['gd', 'cs'],
            });
            const relativeScriptPath = path
                .relative(validatedProjectPath, fullScriptPath)
                .replace(/\\/g, '/');
            const exists = await fs
                .access(fullScriptPath)
                .then(() => true)
                .catch(() => false);
            if (exists && !overwrite) {
                throw new ValidationError(`Script already exists: ${relativeScriptPath}`);
            }
            await fs.mkdir(path.dirname(fullScriptPath), { recursive: true });
            const scriptContent = content ?? buildTemplateContent(template, fullScriptPath);
            await fs.writeFile(fullScriptPath, scriptContent, 'utf-8');
            const validation = validate
                ? await this.validateScript({ projectPath, scriptPath, editorPath })
                : { valid: true, mode: 'basic', errors: [], warnings: [] };
            if (!validation.valid) {
                await fs.unlink(fullScriptPath).catch(() => undefined);
                throw new ValidationError(`Script validation failed: ${validation.errors.join('; ')}`);
            }
            if (attachToScene) {
                await attachScriptToScene(validatedProjectPath, attachToScene.scenePath, attachToScene.nodePath, relativeScriptPath);
            }
            logger.info('Script created', {
                service: 'godot-mcp',
                scriptPath: relativeScriptPath,
                validationMode: validation.mode,
            });
            return {
                success: true,
                scriptPath: fullScriptPath,
                validationPassed: validation.valid,
                warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
            };
        }
        catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new InternalError(`Failed to create script: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async modifyScript(input) {
        const validated = ModifyScriptInputSchema.parse(input);
        const { projectPath, scriptPath, changes, createBackup, validateAfter, editorPath } = validated;
        try {
            const validatedProjectPath = await validatePath(projectPath, {
                mustExist: true,
                allowAbsolute: true,
            });
            const fullScriptPath = await validatePath(scriptPath, {
                baseDir: validatedProjectPath,
                allowedExtensions: ['gd', 'cs'],
                mustExist: true,
            });
            const relativeScriptPath = path
                .relative(validatedProjectPath, fullScriptPath)
                .replace(/\\/g, '/');
            let backupPath;
            if (createBackup) {
                const backup = await this.backupManager.createBackup(validatedProjectPath, relativeScriptPath, 'modify_script', { changeCount: changes.length });
                backupPath = backup.backupPath;
            }
            const originalContent = await fs.readFile(fullScriptPath, 'utf-8');
            const updatedContent = applyScriptChanges(originalContent, changes);
            await fs.writeFile(fullScriptPath, updatedContent, 'utf-8');
            const validation = validateAfter
                ? await this.validateScript({ projectPath, scriptPath, editorPath })
                : { valid: true, mode: 'basic', errors: [], warnings: [] };
            if (!validation.valid) {
                if (backupPath) {
                    await this.backupManager.restoreBackup(validatedProjectPath, backupPath);
                }
                else {
                    await fs.writeFile(fullScriptPath, originalContent, 'utf-8');
                }
                throw new ValidationError(`Script validation failed: ${validation.errors.join('; ')}`);
            }
            return {
                success: true,
                scriptPath: fullScriptPath,
                backupCreated: !!backupPath,
                backupPath,
                validationPassed: validation.valid,
                warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
            };
        }
        catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new InternalError(`Failed to modify script: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async validateScript(input) {
        const validated = ValidateScriptInputSchema.parse(input);
        const { projectPath, scriptPath, editorPath } = validated;
        const validatedProjectPath = await validatePath(projectPath, {
            mustExist: true,
            allowAbsolute: true,
        });
        const fullScriptPath = await validatePath(scriptPath, {
            baseDir: validatedProjectPath,
            allowedExtensions: ['gd', 'cs'],
            mustExist: true,
        });
        const validation = await validateScriptFile(fullScriptPath, editorPath);
        return validation;
    }
}
function buildTemplateContent(template, scriptPath) {
    const className = toClassName(scriptPath);
    const extension = path.extname(scriptPath).toLowerCase();
    if (extension === '.cs') {
        return buildCSharpTemplate(className);
    }
    const header = `extends ${templateParentClass(template)}\nclass_name ${className}\n\n`;
    switch (template) {
        case 'empty':
            return `${header}`;
        case 'node':
            return `${header}func _ready() -> void:\n\tpass\n\nfunc _process(_delta: float) -> void:\n\tpass\n`;
        case 'character_body_2d':
            return `${header}@export var speed: float = 200.0\n\nfunc _physics_process(_delta: float) -> void:\n\tvelocity = Vector2.ZERO\n\tif Input.is_action_pressed("ui_right"):\n\t\tvelocity.x += 1\n\tif Input.is_action_pressed("ui_left"):\n\t\tvelocity.x -= 1\n\tif Input.is_action_pressed("ui_down"):\n\t\tvelocity.y += 1\n\tif Input.is_action_pressed("ui_up"):\n\t\tvelocity.y -= 1\n\tvelocity = velocity.normalized() * speed\n\tmove_and_slide()\n`;
        case 'area_2d':
            return `${header}func _ready() -> void:\n\tconnect("body_entered", Callable(self, "_on_body_entered"))\n\nfunc _on_body_entered(body: Node) -> void:\n\tpass\n`;
        case 'resource':
            return `${header}@export var id: String = ""\n@export var data: Dictionary = {}\n`;
        default:
            return `${header}`;
    }
}
function buildCSharpTemplate(className) {
    const pascalName = toPascalCase(className);
    return `using Godot;\n\npublic partial class ${pascalName} : Node\n{\n    public override void _Ready()\n    {\n    }\n\n    public override void _Process(double delta)\n    {\n    }\n}\n`;
}
function toPascalCase(value) {
    return value
        .split(/[_\-\s]+/)
        .filter((part) => part.length > 0)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}
function templateParentClass(template) {
    switch (template) {
        case 'character_body_2d':
            return 'CharacterBody2D';
        case 'area_2d':
            return 'Area2D';
        case 'resource':
            return 'Resource';
        case 'node':
        case 'empty':
        default:
            return 'Node';
    }
}
function toClassName(scriptPath) {
    const base = path.basename(scriptPath, path.extname(scriptPath));
    const cleaned = base.replace(/[^A-Za-z0-9_]/g, '_');
    if (!cleaned) {
        return 'Script';
    }
    return cleaned.match(/^[A-Za-z_]/) ? cleaned : `_${cleaned}`;
}
function applyScriptChanges(content, changes) {
    const lines = content.split('\n');
    for (const change of changes) {
        if (change.type === 'insert') {
            const index = clampLine(change.startLine, lines.length + 1) - 1;
            const insertLines = change.newContent.split('\n');
            lines.splice(index, 0, ...insertLines);
            continue;
        }
        if (change.type === 'replace') {
            const start = clampLine(change.startLine, lines.length) - 1;
            const end = clampLine(change.endLine, lines.length) - 1;
            if (end < start) {
                throw new ValidationError('replace change endLine must be >= startLine');
            }
            const newLines = change.newContent.split('\n');
            lines.splice(start, end - start + 1, ...newLines);
            continue;
        }
        if (change.type === 'delete') {
            const start = clampLine(change.startLine, lines.length) - 1;
            const end = clampLine(change.endLine, lines.length) - 1;
            if (end < start) {
                throw new ValidationError('delete change endLine must be >= startLine');
            }
            lines.splice(start, end - start + 1);
        }
    }
    return lines.join('\n');
}
function clampLine(line, max) {
    if (line < 1)
        return 1;
    if (line > max)
        return max;
    return line;
}
async function validateScriptFile(scriptPath, editorPath) {
    const resolvedEditorPath = editorPath || process.env.GODOT_EDITOR_PATH || process.env.GODOT_PATH;
    const extension = path.extname(scriptPath).toLowerCase();
    if (resolvedEditorPath) {
        try {
            const result = await execFileAsync(resolvedEditorPath, ['--headless', '--check-only', scriptPath], {
                timeout: 10000,
            });
            if (result.stderr && result.stderr.trim().length > 0) {
                return {
                    valid: false,
                    mode: 'godot',
                    errors: [result.stderr.trim()],
                    warnings: [],
                };
            }
            return {
                valid: true,
                mode: 'godot',
                errors: [],
                warnings: [],
            };
        }
        catch (error) {
            return {
                valid: false,
                mode: 'godot',
                errors: [error instanceof Error ? error.message : String(error)],
                warnings: [],
            };
        }
    }
    if (extension === '.cs') {
        return {
            valid: true,
            mode: 'basic',
            errors: [],
            warnings: ['C# validation requires external tooling or a configured Godot editor path'],
        };
    }
    const content = await fs.readFile(scriptPath, 'utf-8');
    const basic = basicValidateGDScript(content);
    return {
        valid: basic.errors.length === 0,
        mode: 'basic',
        errors: basic.errors,
        warnings: basic.warnings,
    };
}
function basicValidateGDScript(content) {
    const errors = [];
    const warnings = [];
    const quoteMatches = content.match(/"/g) ?? [];
    if (quoteMatches.length % 2 !== 0) {
        errors.push('Unmatched quote detected');
    }
    const parenBalance = countBalance(content, '(', ')');
    if (parenBalance !== 0) {
        errors.push('Unbalanced parentheses');
    }
    const bracketBalance = countBalance(content, '[', ']');
    if (bracketBalance !== 0) {
        errors.push('Unbalanced brackets');
    }
    if (!content.includes('extends')) {
        warnings.push('Missing extends declaration');
    }
    return { errors, warnings };
}
function countBalance(content, openChar, closeChar) {
    let balance = 0;
    for (const ch of content) {
        if (ch === openChar)
            balance++;
        if (ch === closeChar)
            balance--;
    }
    return balance;
}
async function attachScriptToScene(projectPath, scenePath, nodePath, scriptPath) {
    const fullScenePath = await validatePath(scenePath, {
        baseDir: projectPath,
        allowedExtensions: ['tscn'],
    });
    const content = await fs.readFile(fullScenePath, 'utf-8');
    const resScriptPath = toResPath(scriptPath);
    const { updatedContent, resourceId } = ensureScriptExtResource(content, resScriptPath);
    const finalContent = applyScriptProperty(updatedContent, nodePath, resourceId);
    await fs.writeFile(fullScenePath, finalContent, 'utf-8');
}
function toResPath(relativePath) {
    const normalized = relativePath.replace(/\\/g, '/');
    return normalized.startsWith('res://') ? normalized : `res://${normalized}`;
}
function ensureScriptExtResource(content, scriptResPath) {
    const lines = content.split('\n');
    const extResourcePattern = /^\[ext_resource\s+type="([^"]+)"\s+path="([^"]+)"\s+id="?([^\"]+)"?\]$/;
    let lastExtResourceIndex = -1;
    let maxId = 0;
    let existingId = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('[ext_resource')) {
            lastExtResourceIndex = i;
            const match = line.match(extResourcePattern);
            if (match) {
                const [, type, pathValue, id] = match;
                const numericId = parseInt(id, 10);
                if (!Number.isNaN(numericId)) {
                    maxId = Math.max(maxId, numericId);
                }
                if (type === 'Script' && pathValue === scriptResPath) {
                    existingId = id;
                }
            }
        }
    }
    if (existingId) {
        return { updatedContent: content, resourceId: existingId };
    }
    const newId = String(maxId + 1 || 1);
    const insertLine = `[ext_resource type="Script" path="${scriptResPath}" id="${newId}"]`;
    if (lastExtResourceIndex === -1) {
        lines.splice(1, 0, insertLine, '');
    }
    else {
        lines.splice(lastExtResourceIndex + 1, 0, insertLine);
    }
    return { updatedContent: lines.join('\n'), resourceId: newId };
}
function applyScriptProperty(content, nodePath, resourceId) {
    const lines = content.split('\n');
    const nodeIndex = findNodeSection(lines, nodePath);
    if (nodeIndex === -1) {
        throw new ValidationError(`Node not found: ${nodePath}`);
    }
    const propertyLine = `script = ExtResource("${resourceId}")`;
    for (let i = nodeIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('[')) {
            lines.splice(i, 0, propertyLine);
            return lines.join('\n');
        }
        if (line.startsWith('script =')) {
            lines[i] = propertyLine;
            return lines.join('\n');
        }
    }
    lines.push(propertyLine);
    return lines.join('\n');
}
function findNodeSection(lines, nodePath) {
    if (nodePath === '.') {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('[node ') && !line.includes('parent=')) {
                return i;
            }
        }
        return -1;
    }
    const parts = nodePath.split('/');
    const nodeName = parts[parts.length - 1];
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    const namePattern = new RegExp(`name="${escapeRegex(nodeName)}"`);
    const parentPattern = parentPath === '.'
        ? /parent="\."/
        : new RegExp(`parent="${escapeRegex(parentPath)}"`);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('[node ') && namePattern.test(line) && parentPattern.test(line)) {
            return i;
        }
    }
    return -1;
}
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=script-operations.js.map