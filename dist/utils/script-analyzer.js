/**
 * GDScript file analyzer
 * Extracts metadata, functions, and documentation from .gd files
 */
/**
 * Analyze GDScript file content
 */
export function analyzeScript(content) {
    const lines = content.split('\n');
    const metadata = {
        functions: [],
        signals: [],
        constants: {},
        exports: [],
        lineCount: lines.length,
        characterCount: content.length,
    };
    let currentDocstring;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        // Skip empty lines
        if (!trimmed) {
            currentDocstring = undefined;
            continue;
        }
        // Parse class name
        if (trimmed.startsWith('class_name ')) {
            const match = trimmed.match(/class_name\s+(\w+)/);
            if (match) {
                metadata.className = match[1];
            }
            continue;
        }
        // Parse extends
        if (trimmed.startsWith('extends ')) {
            const match = trimmed.match(/extends\s+(\w+)/);
            if (match) {
                metadata.extends = match[1];
            }
            continue;
        }
        // Parse signals
        if (trimmed.startsWith('signal ')) {
            const match = trimmed.match(/signal\s+(\w+)/);
            if (match) {
                metadata.signals.push(match[1]);
            }
            continue;
        }
        // Parse constants
        if (trimmed.startsWith('const ')) {
            const match = trimmed.match(/const\s+(\w+)\s*=\s*(.+)/);
            if (match) {
                metadata.constants[match[1]] = match[2].trim();
            }
            continue;
        }
        // Parse exports
        if (trimmed.startsWith('@export')) {
            const nextLine = lines[i + 1];
            if (nextLine) {
                const varMatch = nextLine.match(/var\s+(\w+)/);
                if (varMatch) {
                    metadata.exports.push(varMatch[1]);
                }
            }
            continue;
        }
        // Collect docstrings (triple quoted comments)
        if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
            const docstringLines = [];
            let j = i;
            // Single-line docstring
            if (trimmed.endsWith('"""') || trimmed.endsWith("'''")) {
                currentDocstring = trimmed.slice(3, -3).trim();
                continue;
            }
            // Multi-line docstring
            docstringLines.push(trimmed.slice(3));
            j++;
            while (j < lines.length) {
                const docLine = lines[j].trim();
                if (docLine.endsWith('"""') || docLine.endsWith("'''")) {
                    docstringLines.push(docLine.slice(0, -3));
                    i = j;
                    break;
                }
                docstringLines.push(docLine);
                j++;
            }
            currentDocstring = docstringLines.join('\n').trim();
            // Check if this is the class docstring (first docstring before any func)
            if (metadata.functions.length === 0 && !metadata.docstring) {
                metadata.docstring = currentDocstring;
                currentDocstring = undefined;
            }
            continue;
        }
        // Parse function definitions
        if (trimmed.startsWith('func ') || trimmed.startsWith('static func ')) {
            const func = parseFunctionSignature(trimmed, i + 1);
            if (func) {
                func.docstring = currentDocstring;
                metadata.functions.push(func);
            }
            currentDocstring = undefined;
            continue;
        }
        // Reset docstring for non-function/non-comment lines
        if (!trimmed.startsWith('#')) {
            currentDocstring = undefined;
        }
    }
    return metadata;
}
/**
 * Parse function signature from line
 */
function parseFunctionSignature(line, lineNumber) {
    const isStatic = line.startsWith('static func ');
    const funcMatch = line.match(/func\s+(\w+)\s*\((.*?)\)/);
    if (!funcMatch) {
        return null;
    }
    const name = funcMatch[1];
    const paramsStr = funcMatch[2].trim();
    // Parse parameters
    const parameters = [];
    if (paramsStr) {
        const params = paramsStr.split(',').map((p) => p.trim());
        for (const param of params) {
            // Extract parameter name (before : or = if present)
            const paramMatch = param.match(/^(\w+)/);
            if (paramMatch) {
                parameters.push(paramMatch[1]);
            }
        }
    }
    // Parse return type
    let returnType;
    const returnMatch = line.match(/\)\s*->\s*(\w+)/);
    if (returnMatch) {
        returnType = returnMatch[1];
    }
    return {
        name,
        parameters,
        returnType,
        isStatic,
        lineNumber,
    };
}
/**
 * Extract function at specific line number
 */
export function extractFunctionAtLine(content, targetLine) {
    const lines = content.split('\n');
    // Find function start
    let funcStartLine = -1;
    for (let i = targetLine - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('func ') || line.startsWith('static func ')) {
            funcStartLine = i;
            break;
        }
        // Stop if we hit another function or class-level statement
        if (line.startsWith('func ') || line.startsWith('class ') || line.startsWith('extends ')) {
            break;
        }
    }
    if (funcStartLine === -1) {
        return null;
    }
    // Find function end (next function or end of file)
    const funcLines = [];
    const baseIndent = lines[funcStartLine].match(/^(\s*)/)?.[1]?.length || 0;
    funcLines.push(lines[funcStartLine]);
    for (let i = funcStartLine + 1; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        // Empty line - include it
        if (!trimmed) {
            funcLines.push(line);
            continue;
        }
        // Check indentation
        const indent = line.match(/^(\s*)/)?.[1]?.length || 0;
        // If we hit same or less indentation with non-empty content, function ends
        if (indent <= baseIndent && trimmed) {
            break;
        }
        funcLines.push(line);
    }
    return funcLines.join('\n');
}
export function calculateComplexity(content, metadata) {
    const lines = content.split('\n');
    // Calculate average and max function length
    const functionLengths = [];
    for (const func of metadata.functions) {
        const funcContent = extractFunctionAtLine(content, func.lineNumber);
        if (funcContent) {
            functionLengths.push(funcContent.split('\n').length);
        }
    }
    const avgLength = functionLengths.length > 0
        ? functionLengths.reduce((a, b) => a + b, 0) / functionLengths.length
        : 0;
    const maxLength = functionLengths.length > 0
        ? Math.max(...functionLengths)
        : 0;
    // Simple cyclomatic complexity (count decision points)
    let complexity = 1; // Base complexity
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('if ') ||
            trimmed.includes(' if ') ||
            trimmed.startsWith('elif ') ||
            trimmed.startsWith('for ') ||
            trimmed.startsWith('while ') ||
            trimmed.includes(' and ') ||
            trimmed.includes(' or ')) {
            complexity++;
        }
    }
    return {
        functionCount: metadata.functions.length,
        averageFunctionLength: avgLength,
        maxFunctionLength: maxLength,
        signalCount: metadata.signals.length,
        exportCount: metadata.exports.length,
        cyclomaticComplexity: complexity,
    };
}
/**
 * Find all references to a function/variable
 */
export function findReferences(content, identifier) {
    const lines = content.split('\n');
    const references = [];
    const regex = new RegExp(`\\b${identifier}\\b`);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (regex.test(line)) {
            references.push(i + 1); // 1-indexed line numbers
        }
    }
    return references;
}
/**
 * Extract all class names referenced in script
 */
export function extractTypeDependencies(content) {
    const types = new Set();
    const lines = content.split('\n');
    for (const line of lines) {
        // Match type hints: var x: Type, func f() -> Type, param: Type
        const typeMatches = line.matchAll(/:\s*(\w+)/g);
        for (const match of typeMatches) {
            const type = match[1];
            if (type && !isBuiltinType(type)) {
                types.add(type);
            }
        }
        // Match extends
        const extendsMatch = line.match(/extends\s+(\w+)/);
        if (extendsMatch) {
            types.add(extendsMatch[1]);
        }
        // Match preload/load
        const preloadMatch = line.match(/preload\("res:\/\/.*?(\w+)\.gd"\)/);
        if (preloadMatch) {
            types.add(preloadMatch[1]);
        }
    }
    return Array.from(types);
}
/**
 * Check if type is a GDScript built-in
 */
function isBuiltinType(type) {
    const builtins = [
        'int', 'float', 'bool', 'String', 'Vector2', 'Vector3', 'Color',
        'Array', 'Dictionary', 'Object', 'Node', 'Node2D', 'Node3D',
        'Resource', 'PackedScene', 'Texture2D', 'AudioStream',
    ];
    return builtins.includes(type);
}
//# sourceMappingURL=script-analyzer.js.map