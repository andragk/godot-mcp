/**
 * GDScript file analyzer
 * Extracts metadata, functions, and documentation from .gd files
 */
export interface FunctionSignature {
    name: string;
    parameters: string[];
    returnType?: string;
    isStatic: boolean;
    docstring?: string;
    lineNumber: number;
}
export interface ScriptMetadata {
    className?: string;
    extends?: string;
    docstring?: string;
    functions: FunctionSignature[];
    signals: string[];
    constants: Record<string, string>;
    exports: string[];
    lineCount: number;
    characterCount: number;
}
/**
 * Analyze GDScript file content
 */
export declare function analyzeScript(content: string): ScriptMetadata;
/**
 * Analyze C# script content with basic pattern extraction
 */
export declare function analyzeCSharpScript(content: string): ScriptMetadata;
/**
 * Extract function at specific line number
 */
export declare function extractFunctionAtLine(content: string, targetLine: number): string | null;
/**
 * Calculate script complexity metrics
 */
export interface ComplexityMetrics {
    functionCount: number;
    averageFunctionLength: number;
    maxFunctionLength: number;
    signalCount: number;
    exportCount: number;
    cyclomaticComplexity: number;
}
export declare function calculateComplexity(content: string, metadata: ScriptMetadata): ComplexityMetrics;
/**
 * Find all references to a function/variable
 */
export declare function findReferences(content: string, identifier: string): number[];
/**
 * Extract all class names referenced in script
 */
export declare function extractTypeDependencies(content: string): string[];
//# sourceMappingURL=script-analyzer.d.ts.map