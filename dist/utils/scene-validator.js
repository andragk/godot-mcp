/**
 * Scene Validator
 * Validates Godot .tscn files for correctness and integrity
 */
import { logger } from './logger.js';
/**
 * Scene Validator class
 */
export class SceneValidator {
    /**
     * Validate a scene file
     */
    validate(content) {
        const errors = [];
        const warnings = [];
        // Run all validation layers
        this.validateSyntax(content, errors, warnings);
        this.validateStructure(content, errors, warnings);
        this.validateProperties(content, errors, warnings);
        this.validateReferences(content, errors, warnings);
        const valid = errors.length === 0;
        if (!valid) {
            logger.warn('Scene validation failed', {
                errorCount: errors.length,
                warningCount: warnings.length
            });
        }
        return { valid, errors, warnings };
    }
    /**
     * Syntax validation: Check .tscn format correctness
     */
    validateSyntax(content, errors, warnings) {
        const lines = content.split('\n');
        // Check for gd_scene header
        if (!lines[0]?.startsWith('[gd_scene')) {
            errors.push({
                type: 'syntax',
                severity: 'error',
                message: 'Missing [gd_scene] header',
                line: 1,
                suggestion: 'Scene file must start with [gd_scene load_steps=N format=3]'
            });
        }
        // Check format version
        const formatMatch = lines[0]?.match(/format=(\d+)/);
        if (formatMatch) {
            const format = parseInt(formatMatch[1]);
            if (format !== 3) {
                warnings.push({
                    type: 'syntax',
                    severity: 'warning',
                    message: `Unexpected format version: ${format}`,
                    line: 1,
                    suggestion: 'Godot 4.x uses format=3'
                });
            }
        }
        // Validate section headers
        const sectionPattern = /^\[(gd_scene|ext_resource|sub_resource|node|connection)\b.*\]$/;
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('[') && !trimmed.startsWith('[[')) {
                if (!sectionPattern.test(trimmed)) {
                    errors.push({
                        type: 'syntax',
                        severity: 'error',
                        message: `Invalid section header: ${trimmed}`,
                        line: index + 1,
                        suggestion: 'Valid sections: gd_scene, ext_resource, sub_resource, node, connection'
                    });
                }
            }
        });
        // Check for unmatched quotes
        lines.forEach((line, index) => {
            const quotes = line.match(/(?<!\\)"/g);
            if (quotes && quotes.length % 2 !== 0) {
                errors.push({
                    type: 'syntax',
                    severity: 'error',
                    message: 'Unmatched quote',
                    line: index + 1,
                    suggestion: 'Ensure all quotes are properly closed'
                });
            }
        });
        // Check for balanced brackets (but skip section headers)
        let bracketDepth = 0;
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            // Skip section headers completely
            if (trimmed.startsWith('[') && sectionPattern.test(trimmed)) {
                return;
            }
            // Skip quoted content
            const withoutStrings = line.replace(/"(?:[^"\\]|\\.)*"/g, '');
            for (const char of withoutStrings) {
                if (char === '[')
                    bracketDepth++;
                if (char === ']')
                    bracketDepth--;
                if (bracketDepth < 0) {
                    errors.push({
                        type: 'syntax',
                        severity: 'error',
                        message: 'Unmatched closing bracket',
                        line: index + 1
                    });
                    bracketDepth = 0; // Reset to continue checking
                }
            }
        });
        if (bracketDepth > 0) {
            errors.push({
                type: 'syntax',
                severity: 'error',
                message: `${bracketDepth} unclosed bracket(s)`,
                suggestion: 'Ensure all brackets are properly closed'
            });
        }
    }
    /**
     * Structure validation: Check node hierarchy and relationships
     */
    validateStructure(content, errors, warnings) {
        const lines = content.split('\n');
        const nodes = [];
        let hasRootNode = false;
        const nodePaths = new Set();
        // Extract all nodes
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const nodeMatch = line.match(/^\[node\s+name="([^"]+)"(?:\s+type="[^"]+")?\s*(?:parent="([^"]*)")?\]/);
            if (nodeMatch) {
                const name = nodeMatch[1];
                const parent = nodeMatch[2] !== undefined ? nodeMatch[2] : null;
                nodes.push({ name, parent, line: i + 1 });
                // Check for root node (no parent attribute at all)
                // Note: parent="." means child of root, not root itself
                if (parent === null) {
                    if (hasRootNode) {
                        errors.push({
                            type: 'structure',
                            severity: 'error',
                            message: 'Multiple root nodes found',
                            line: i + 1,
                            suggestion: 'Scene should have exactly one root node'
                        });
                    }
                    hasRootNode = true;
                }
                // Build full path for uniqueness check
                const path = parent && parent !== '.' ? `${parent}/${name}` : name;
                if (nodePaths.has(path)) {
                    errors.push({
                        type: 'structure',
                        severity: 'error',
                        message: `Duplicate node path: ${path}`,
                        line: i + 1,
                        suggestion: 'Node paths must be unique within the scene'
                    });
                }
                nodePaths.add(path);
            }
        }
        // Check for root node existence
        if (!hasRootNode && nodes.length > 0) {
            errors.push({
                type: 'structure',
                severity: 'error',
                message: 'No root node found',
                suggestion: 'Scene must have a root node (node with no parent or parent=".")'
            });
        }
        // Validate parent references
        nodes.forEach(node => {
            if (node.parent && node.parent !== '.') {
                // Build a map of node paths for lookup
                const nodePathMap = new Map();
                nodes.forEach(n => {
                    if (n.line < node.line) {
                        // Add both just the name and potential full paths
                        nodePathMap.set(n.name, true);
                        if (n.parent && n.parent !== '.') {
                            nodePathMap.set(`${n.parent}/${n.name}`, true);
                        }
                    }
                });
                // Check if the parent path exists
                if (!nodePathMap.has(node.parent)) {
                    // Try just the last segment
                    const parentName = node.parent.split('/').pop();
                    if (!nodePathMap.has(parentName)) {
                        errors.push({
                            type: 'structure',
                            severity: 'error',
                            message: `Parent node not found: ${node.parent}`,
                            line: node.line,
                            suggestion: 'Ensure parent node is defined before child nodes'
                        });
                    }
                }
            }
        });
        // Warn about deeply nested hierarchies (>10 levels)
        nodes.forEach(node => {
            if (node.parent && node.parent !== '.') {
                // Count depth by number of slashes + 1
                const depth = node.parent.split('/').length + 1;
                if (depth > 10) {
                    warnings.push({
                        type: 'structure',
                        severity: 'warning',
                        message: `Deeply nested node (depth ${depth}): ${node.name}`,
                        line: node.line,
                        suggestion: 'Consider flattening node hierarchy for better performance'
                    });
                }
            }
        });
    }
    /**
     * Property validation: Check property types and values
     */
    validateProperties(content, errors, warnings) {
        const lines = content.split('\n');
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            // Check Vector2/Vector3 format
            const vectorMatch = trimmed.match(/=\s*Vector[23]\((.*?)\)/);
            if (vectorMatch) {
                const values = vectorMatch[1].split(',').map(v => v.trim());
                const expectedCount = trimmed.includes('Vector2') ? 2 : 3;
                if (values.length !== expectedCount) {
                    errors.push({
                        type: 'property',
                        severity: 'error',
                        message: `Invalid Vector${expectedCount === 2 ? '2' : '3'} format: expected ${expectedCount} values, got ${values.length}`,
                        line: index + 1,
                        suggestion: `Use Vector${expectedCount === 2 ? '2' : '3'}(x, y${expectedCount === 3 ? ', z' : ''})`
                    });
                }
                // Validate numeric values
                values.forEach(val => {
                    if (isNaN(parseFloat(val))) {
                        errors.push({
                            type: 'property',
                            severity: 'error',
                            message: `Non-numeric value in vector: ${val}`,
                            line: index + 1
                        });
                    }
                });
            }
            // Check Color format
            const colorMatch = trimmed.match(/=\s*Color\((.*?)\)/);
            if (colorMatch) {
                const values = colorMatch[1].split(',').map(v => v.trim());
                if (values.length !== 3 && values.length !== 4) {
                    errors.push({
                        type: 'property',
                        severity: 'error',
                        message: `Invalid Color format: expected 3 or 4 values, got ${values.length}`,
                        line: index + 1,
                        suggestion: 'Use Color(r, g, b) or Color(r, g, b, a)'
                    });
                }
                // Validate color values are in range [0, 1]
                values.forEach(val => {
                    const num = parseFloat(val);
                    if (isNaN(num)) {
                        errors.push({
                            type: 'property',
                            severity: 'error',
                            message: `Non-numeric value in color: ${val}`,
                            line: index + 1
                        });
                    }
                    else if (num < 0 || num > 1) {
                        warnings.push({
                            type: 'property',
                            severity: 'warning',
                            message: `Color value out of range [0, 1]: ${num}`,
                            line: index + 1,
                            suggestion: 'Color components should typically be between 0 and 1'
                        });
                    }
                });
            }
            // Check resource paths
            const resPathMatch = trimmed.match(/=\s*"(res:\/\/[^"]+)"/);
            if (resPathMatch) {
                const path = resPathMatch[1];
                // Warn about absolute paths outside project
                if (path.includes('..')) {
                    warnings.push({
                        type: 'property',
                        severity: 'warning',
                        message: `Resource path contains ..: ${path}`,
                        line: index + 1,
                        suggestion: 'Use paths relative to project root'
                    });
                }
                // Check for common file extensions
                const validExtensions = ['.tscn', '.scn', '.tres', '.res', '.gd', '.png', '.jpg', '.wav', '.ogg', '.mp3', '.glb', '.fbx'];
                const hasValidExt = validExtensions.some(ext => path.toLowerCase().endsWith(ext));
                if (!hasValidExt && !path.endsWith('/')) {
                    warnings.push({
                        type: 'property',
                        severity: 'warning',
                        message: `Unusual file extension in resource path: ${path}`,
                        line: index + 1
                    });
                }
            }
            // Check for boolean values
            const boolMatch = trimmed.match(/=\s*(true|false|True|False|TRUE|FALSE)\b/);
            if (boolMatch && boolMatch[1] !== 'true' && boolMatch[1] !== 'false') {
                warnings.push({
                    type: 'property',
                    severity: 'warning',
                    message: `Non-standard boolean format: ${boolMatch[1]}`,
                    line: index + 1,
                    suggestion: 'Use lowercase "true" or "false"'
                });
            }
        });
    }
    /**
     * Reference validation: Check external resources and sub-resources
     */
    validateReferences(content, errors, warnings) {
        const lines = content.split('\n');
        // Collect all defined resource IDs
        const extResourceIds = new Set();
        const subResourceIds = new Set();
        const usedExtResources = new Set();
        const usedSubResources = new Set();
        // First pass: collect defined resources
        lines.forEach((line, index) => {
            const extResMatch = line.match(/^\[ext_resource\s+.*id="([^"]+)"/);
            if (extResMatch) {
                const id = extResMatch[1];
                if (extResourceIds.has(id)) {
                    errors.push({
                        type: 'reference',
                        severity: 'error',
                        message: `Duplicate ext_resource id: ${id}`,
                        line: index + 1,
                        suggestion: 'Resource IDs must be unique'
                    });
                }
                extResourceIds.add(id);
            }
            const subResMatch = line.match(/^\[sub_resource\s+.*id="([^"]+)"/);
            if (subResMatch) {
                const id = subResMatch[1];
                if (subResourceIds.has(id)) {
                    errors.push({
                        type: 'reference',
                        severity: 'error',
                        message: `Duplicate sub_resource id: ${id}`,
                        line: index + 1,
                        suggestion: 'Resource IDs must be unique'
                    });
                }
                subResourceIds.add(id);
            }
        });
        // Second pass: validate resource references
        lines.forEach((line, index) => {
            // Check ExtResource() references
            const extResRefs = line.matchAll(/ExtResource\(\s*"([^"]+)"\s*\)/g);
            for (const match of extResRefs) {
                const id = match[1];
                usedExtResources.add(id);
                if (!extResourceIds.has(id)) {
                    errors.push({
                        type: 'reference',
                        severity: 'error',
                        message: `Reference to undefined ext_resource: ${id}`,
                        line: index + 1,
                        suggestion: 'Ensure ext_resource is defined before use'
                    });
                }
            }
            // Check SubResource() references
            const subResRefs = line.matchAll(/SubResource\(\s*"([^"]+)"\s*\)/g);
            for (const match of subResRefs) {
                const id = match[1];
                usedSubResources.add(id);
                if (!subResourceIds.has(id)) {
                    errors.push({
                        type: 'reference',
                        severity: 'error',
                        message: `Reference to undefined sub_resource: ${id}`,
                        line: index + 1,
                        suggestion: 'Ensure sub_resource is defined before use'
                    });
                }
            }
            // Check signal connections
            const connectionMatch = line.match(/^\[connection\s+signal="([^"]*)"\s+from="([^"]*)"\s+to="([^"]*)"/);
            if (connectionMatch) {
                const [, signal, from, to] = connectionMatch;
                // Basic validation - check for empty strings
                if (signal === '' || from === '' || to === '') {
                    errors.push({
                        type: 'reference',
                        severity: 'error',
                        message: 'Incomplete connection definition',
                        line: index + 1,
                        suggestion: 'Connection must have signal, from, and to attributes'
                    });
                }
            }
        });
        // Check for unused resources
        extResourceIds.forEach(id => {
            if (!usedExtResources.has(id)) {
                warnings.push({
                    type: 'reference',
                    severity: 'warning',
                    message: `Unused ext_resource: ${id}`,
                    suggestion: 'Consider removing unused external resources'
                });
            }
        });
        subResourceIds.forEach(id => {
            if (!usedSubResources.has(id)) {
                warnings.push({
                    type: 'reference',
                    severity: 'warning',
                    message: `Unused sub_resource: ${id}`,
                    suggestion: 'Consider removing unused sub-resources'
                });
            }
        });
    }
}
/**
 * Create a default scene validator instance
 */
export const sceneValidator = new SceneValidator();
//# sourceMappingURL=scene-validator.js.map