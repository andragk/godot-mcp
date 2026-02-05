/**
 * Scene Operations Tools
 *
 * Provides tools for creating and modifying Godot scene files (.tscn).
 * Integrates with SceneValidator for validation and BackupManager for rollback.
 */
import { z } from 'zod';
/**
 * Node property value types
 */
declare const NodePropertyValueSchema: z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodObject<{
    type: z.ZodEnum<["Vector2", "Vector3", "Color", "Transform2D", "Transform3D"]>;
    value: z.ZodUnion<[z.ZodArray<z.ZodNumber, "many">, z.ZodRecord<z.ZodString, z.ZodNumber>]>;
}, "strip", z.ZodTypeAny, {
    value: number[] | Record<string, number>;
    type: "Vector2" | "Vector3" | "Color" | "Transform2D" | "Transform3D";
}, {
    value: number[] | Record<string, number>;
    type: "Vector2" | "Vector3" | "Color" | "Transform2D" | "Transform3D";
}>]>;
/**
 * Node definition for scene creation
 */
declare const NodeDefinitionSchema: z.ZodType<{
    name: string;
    type: string;
    properties?: Record<string, z.infer<typeof NodePropertyValueSchema>>;
    children?: any[];
}>;
/**
 * Create scene tool input schema
 */
export declare const CreateSceneInputSchema: z.ZodObject<{
    projectPath: z.ZodString;
    scenePath: z.ZodString;
    rootNode: z.ZodType<{
        name: string;
        type: string;
        properties?: Record<string, z.infer<typeof NodePropertyValueSchema>>;
        children?: any[];
    }, z.ZodTypeDef, {
        name: string;
        type: string;
        properties?: Record<string, z.infer<typeof NodePropertyValueSchema>>;
        children?: any[];
    }>;
    format: z.ZodDefault<z.ZodNumber>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    format: number;
    projectPath: string;
    scenePath: string;
    rootNode: {
        name: string;
        type: string;
        properties?: Record<string, z.infer<typeof NodePropertyValueSchema>>;
        children?: any[];
    };
    description?: string | undefined;
}, {
    projectPath: string;
    scenePath: string;
    rootNode: {
        name: string;
        type: string;
        properties?: Record<string, z.infer<typeof NodePropertyValueSchema>>;
        children?: any[];
    };
    format?: number | undefined;
    description?: string | undefined;
}>;
export type CreateSceneInput = z.infer<typeof CreateSceneInputSchema>;
export type NodeDefinition = z.infer<typeof NodeDefinitionSchema>;
export type NodePropertyValue = z.infer<typeof NodePropertyValueSchema>;
/**
 * Modify scene operation types
 */
declare const ModifyOperationSchema: z.ZodDiscriminatedUnion<"operation", [z.ZodObject<{
    operation: z.ZodLiteral<"add_node">;
    parentPath: z.ZodString;
    node: z.ZodType<{
        name: string;
        type: string;
        properties?: Record<string, z.infer<typeof NodePropertyValueSchema>>;
        children?: any[];
    }, z.ZodTypeDef, {
        name: string;
        type: string;
        properties?: Record<string, z.infer<typeof NodePropertyValueSchema>>;
        children?: any[];
    }>;
}, "strip", z.ZodTypeAny, {
    node: {
        name: string;
        type: string;
        properties?: Record<string, z.infer<typeof NodePropertyValueSchema>>;
        children?: any[];
    };
    operation: "add_node";
    parentPath: string;
}, {
    node: {
        name: string;
        type: string;
        properties?: Record<string, z.infer<typeof NodePropertyValueSchema>>;
        children?: any[];
    };
    operation: "add_node";
    parentPath: string;
}>, z.ZodObject<{
    operation: z.ZodLiteral<"remove_node">;
    nodePath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    operation: "remove_node";
    nodePath: string;
}, {
    operation: "remove_node";
    nodePath: string;
}>, z.ZodObject<{
    operation: z.ZodLiteral<"modify_property">;
    nodePath: z.ZodString;
    property: z.ZodString;
    value: z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodObject<{
        type: z.ZodEnum<["Vector2", "Vector3", "Color", "Transform2D", "Transform3D"]>;
        value: z.ZodUnion<[z.ZodArray<z.ZodNumber, "many">, z.ZodRecord<z.ZodString, z.ZodNumber>]>;
    }, "strip", z.ZodTypeAny, {
        value: number[] | Record<string, number>;
        type: "Vector2" | "Vector3" | "Color" | "Transform2D" | "Transform3D";
    }, {
        value: number[] | Record<string, number>;
        type: "Vector2" | "Vector3" | "Color" | "Transform2D" | "Transform3D";
    }>]>;
}, "strip", z.ZodTypeAny, {
    value: string | number | boolean | {
        value: number[] | Record<string, number>;
        type: "Vector2" | "Vector3" | "Color" | "Transform2D" | "Transform3D";
    };
    property: string;
    operation: "modify_property";
    nodePath: string;
}, {
    value: string | number | boolean | {
        value: number[] | Record<string, number>;
        type: "Vector2" | "Vector3" | "Color" | "Transform2D" | "Transform3D";
    };
    property: string;
    operation: "modify_property";
    nodePath: string;
}>, z.ZodObject<{
    operation: z.ZodLiteral<"rename_node">;
    nodePath: z.ZodString;
    newName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    operation: "rename_node";
    nodePath: string;
    newName: string;
}, {
    operation: "rename_node";
    nodePath: string;
    newName: string;
}>, z.ZodObject<{
    operation: z.ZodLiteral<"reparent_node">;
    nodePath: z.ZodString;
    newParentPath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    operation: "reparent_node";
    nodePath: string;
    newParentPath: string;
}, {
    operation: "reparent_node";
    nodePath: string;
    newParentPath: string;
}>]>;
/**
 * Modify scene tool input schema
 */
export declare const ModifySceneInputSchema: z.ZodObject<{
    projectPath: z.ZodString;
    scenePath: z.ZodString;
    operations: z.ZodArray<z.ZodDiscriminatedUnion<"operation", [z.ZodObject<{
        operation: z.ZodLiteral<"add_node">;
        parentPath: z.ZodString;
        node: z.ZodType<{
            name: string;
            type: string;
            properties?: Record<string, z.infer<typeof NodePropertyValueSchema>>;
            children?: any[];
        }, z.ZodTypeDef, {
            name: string;
            type: string;
            properties?: Record<string, z.infer<typeof NodePropertyValueSchema>>;
            children?: any[];
        }>;
    }, "strip", z.ZodTypeAny, {
        node: {
            name: string;
            type: string;
            properties?: Record<string, z.infer<typeof NodePropertyValueSchema>>;
            children?: any[];
        };
        operation: "add_node";
        parentPath: string;
    }, {
        node: {
            name: string;
            type: string;
            properties?: Record<string, z.infer<typeof NodePropertyValueSchema>>;
            children?: any[];
        };
        operation: "add_node";
        parentPath: string;
    }>, z.ZodObject<{
        operation: z.ZodLiteral<"remove_node">;
        nodePath: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        operation: "remove_node";
        nodePath: string;
    }, {
        operation: "remove_node";
        nodePath: string;
    }>, z.ZodObject<{
        operation: z.ZodLiteral<"modify_property">;
        nodePath: z.ZodString;
        property: z.ZodString;
        value: z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodObject<{
            type: z.ZodEnum<["Vector2", "Vector3", "Color", "Transform2D", "Transform3D"]>;
            value: z.ZodUnion<[z.ZodArray<z.ZodNumber, "many">, z.ZodRecord<z.ZodString, z.ZodNumber>]>;
        }, "strip", z.ZodTypeAny, {
            value: number[] | Record<string, number>;
            type: "Vector2" | "Vector3" | "Color" | "Transform2D" | "Transform3D";
        }, {
            value: number[] | Record<string, number>;
            type: "Vector2" | "Vector3" | "Color" | "Transform2D" | "Transform3D";
        }>]>;
    }, "strip", z.ZodTypeAny, {
        value: string | number | boolean | {
            value: number[] | Record<string, number>;
            type: "Vector2" | "Vector3" | "Color" | "Transform2D" | "Transform3D";
        };
        property: string;
        operation: "modify_property";
        nodePath: string;
    }, {
        value: string | number | boolean | {
            value: number[] | Record<string, number>;
            type: "Vector2" | "Vector3" | "Color" | "Transform2D" | "Transform3D";
        };
        property: string;
        operation: "modify_property";
        nodePath: string;
    }>, z.ZodObject<{
        operation: z.ZodLiteral<"rename_node">;
        nodePath: z.ZodString;
        newName: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        operation: "rename_node";
        nodePath: string;
        newName: string;
    }, {
        operation: "rename_node";
        nodePath: string;
        newName: string;
    }>, z.ZodObject<{
        operation: z.ZodLiteral<"reparent_node">;
        nodePath: z.ZodString;
        newParentPath: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        operation: "reparent_node";
        nodePath: string;
        newParentPath: string;
    }, {
        operation: "reparent_node";
        nodePath: string;
        newParentPath: string;
    }>]>, "many">;
    createBackup: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    validateAfter: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    projectPath: string;
    scenePath: string;
    operations: ({
        node: {
            name: string;
            type: string;
            properties?: Record<string, z.infer<typeof NodePropertyValueSchema>>;
            children?: any[];
        };
        operation: "add_node";
        parentPath: string;
    } | {
        operation: "remove_node";
        nodePath: string;
    } | {
        value: string | number | boolean | {
            value: number[] | Record<string, number>;
            type: "Vector2" | "Vector3" | "Color" | "Transform2D" | "Transform3D";
        };
        property: string;
        operation: "modify_property";
        nodePath: string;
    } | {
        operation: "rename_node";
        nodePath: string;
        newName: string;
    } | {
        operation: "reparent_node";
        nodePath: string;
        newParentPath: string;
    })[];
    createBackup: boolean;
    validateAfter: boolean;
}, {
    projectPath: string;
    scenePath: string;
    operations: ({
        node: {
            name: string;
            type: string;
            properties?: Record<string, z.infer<typeof NodePropertyValueSchema>>;
            children?: any[];
        };
        operation: "add_node";
        parentPath: string;
    } | {
        operation: "remove_node";
        nodePath: string;
    } | {
        value: string | number | boolean | {
            value: number[] | Record<string, number>;
            type: "Vector2" | "Vector3" | "Color" | "Transform2D" | "Transform3D";
        };
        property: string;
        operation: "modify_property";
        nodePath: string;
    } | {
        operation: "rename_node";
        nodePath: string;
        newName: string;
    } | {
        operation: "reparent_node";
        nodePath: string;
        newParentPath: string;
    })[];
    createBackup?: boolean | undefined;
    validateAfter?: boolean | undefined;
}>;
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
export declare class SceneOperationsTools {
    private validator;
    constructor();
    /**
     * Create a new scene file
     */
    createScene(input: unknown): Promise<CreateSceneResult>;
    /**
     * Modify an existing scene file
     * TODO: Implement full modification operations
     */
    modifyScene(_input: unknown): Promise<ModifySceneResult>;
    /**
     * Generate scene file content
     */
    private generateSceneContent;
    /**
     * Generate node definitions recursively
     */
    private generateNodes;
    /**
     * Format property value for .tscn format
     */
    private formatPropertyValue;
    /**
     * Count total nodes in hierarchy
     */
    private countNodes;
}
export {};
//# sourceMappingURL=scene-operations.d.ts.map