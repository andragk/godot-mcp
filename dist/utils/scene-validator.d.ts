/**
 * Validation error
 */
export interface ValidationError {
    type: 'syntax' | 'structure' | 'property' | 'reference';
    severity: 'error' | 'warning';
    message: string;
    line?: number;
    suggestion?: string;
}
/**
 * Validation result
 */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
}
/**
 * Scene Validator class
 */
export declare class SceneValidator {
    /**
     * Validate a scene file
     */
    validate(content: string): ValidationResult;
    /**
     * Syntax validation: Check .tscn format correctness
     */
    private validateSyntax;
    /**
     * Structure validation: Check node hierarchy and relationships
     */
    private validateStructure;
    /**
     * Property validation: Check property types and values
     */
    private validateProperties;
    /**
     * Reference validation: Check external resources and sub-resources
     */
    private validateReferences;
}
/**
 * Create a default scene validator instance
 */
export declare const sceneValidator: SceneValidator;
//# sourceMappingURL=scene-validator.d.ts.map