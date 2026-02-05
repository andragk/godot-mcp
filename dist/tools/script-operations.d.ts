/**
 * Script Operations Tools
 *
 * Provides tools for creating, modifying, and validating Godot script files.
 */
import { z } from 'zod';
declare const ScriptChangeSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"replace">;
    startLine: z.ZodNumber;
    endLine: z.ZodNumber;
    newContent: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "replace";
    startLine: number;
    endLine: number;
    newContent: string;
}, {
    type: "replace";
    startLine: number;
    endLine: number;
    newContent: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"insert">;
    startLine: z.ZodNumber;
    newContent: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "insert";
    startLine: number;
    newContent: string;
}, {
    type: "insert";
    startLine: number;
    newContent: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"delete">;
    startLine: z.ZodNumber;
    endLine: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "delete";
    startLine: number;
    endLine: number;
}, {
    type: "delete";
    startLine: number;
    endLine: number;
}>]>;
export declare const CreateScriptInputSchema: z.ZodObject<{
    projectPath: z.ZodString;
    scriptPath: z.ZodString;
    content: z.ZodOptional<z.ZodString>;
    template: z.ZodDefault<z.ZodOptional<z.ZodEnum<["empty", "node", "character_body_2d", "area_2d", "resource"]>>>;
    overwrite: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    attachToScene: z.ZodOptional<z.ZodObject<{
        scenePath: z.ZodString;
        nodePath: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        scenePath: string;
        nodePath: string;
    }, {
        scenePath: string;
        nodePath: string;
    }>>;
    validate: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    editorPath: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    projectPath: string;
    scriptPath: string;
    template: "node" | "empty" | "character_body_2d" | "area_2d" | "resource";
    overwrite: boolean;
    validate: boolean;
    content?: string | undefined;
    editorPath?: string | undefined;
    attachToScene?: {
        scenePath: string;
        nodePath: string;
    } | undefined;
}, {
    projectPath: string;
    scriptPath: string;
    content?: string | undefined;
    editorPath?: string | undefined;
    template?: "node" | "empty" | "character_body_2d" | "area_2d" | "resource" | undefined;
    overwrite?: boolean | undefined;
    attachToScene?: {
        scenePath: string;
        nodePath: string;
    } | undefined;
    validate?: boolean | undefined;
}>;
export declare const ModifyScriptInputSchema: z.ZodObject<{
    projectPath: z.ZodString;
    scriptPath: z.ZodString;
    changes: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"replace">;
        startLine: z.ZodNumber;
        endLine: z.ZodNumber;
        newContent: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "replace";
        startLine: number;
        endLine: number;
        newContent: string;
    }, {
        type: "replace";
        startLine: number;
        endLine: number;
        newContent: string;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"insert">;
        startLine: z.ZodNumber;
        newContent: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "insert";
        startLine: number;
        newContent: string;
    }, {
        type: "insert";
        startLine: number;
        newContent: string;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"delete">;
        startLine: z.ZodNumber;
        endLine: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        type: "delete";
        startLine: number;
        endLine: number;
    }, {
        type: "delete";
        startLine: number;
        endLine: number;
    }>]>, "many">;
    createBackup: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    validateAfter: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    editorPath: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    projectPath: string;
    scriptPath: string;
    changes: ({
        type: "replace";
        startLine: number;
        endLine: number;
        newContent: string;
    } | {
        type: "insert";
        startLine: number;
        newContent: string;
    } | {
        type: "delete";
        startLine: number;
        endLine: number;
    })[];
    createBackup: boolean;
    validateAfter: boolean;
    editorPath?: string | undefined;
}, {
    projectPath: string;
    scriptPath: string;
    changes: ({
        type: "replace";
        startLine: number;
        endLine: number;
        newContent: string;
    } | {
        type: "insert";
        startLine: number;
        newContent: string;
    } | {
        type: "delete";
        startLine: number;
        endLine: number;
    })[];
    editorPath?: string | undefined;
    createBackup?: boolean | undefined;
    validateAfter?: boolean | undefined;
}>;
export declare const ValidateScriptInputSchema: z.ZodObject<{
    projectPath: z.ZodString;
    scriptPath: z.ZodString;
    editorPath: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    projectPath: string;
    scriptPath: string;
    editorPath?: string | undefined;
}, {
    projectPath: string;
    scriptPath: string;
    editorPath?: string | undefined;
}>;
export type CreateScriptInput = z.infer<typeof CreateScriptInputSchema>;
export type ModifyScriptInput = z.infer<typeof ModifyScriptInputSchema>;
export type ValidateScriptInput = z.infer<typeof ValidateScriptInputSchema>;
export type ScriptChange = z.infer<typeof ScriptChangeSchema>;
export interface CreateScriptResult {
    success: boolean;
    scriptPath: string;
    validationPassed: boolean;
    warnings?: string[];
}
export interface ModifyScriptResult {
    success: boolean;
    scriptPath: string;
    backupCreated: boolean;
    backupPath?: string;
    validationPassed: boolean;
    warnings?: string[];
}
export interface ValidateScriptResult {
    valid: boolean;
    mode: 'godot' | 'basic';
    errors: string[];
    warnings: string[];
}
export declare class ScriptOperationsTools {
    private readonly backupManager;
    createScript(input: unknown): Promise<CreateScriptResult>;
    modifyScript(input: unknown): Promise<ModifyScriptResult>;
    validateScript(input: unknown): Promise<ValidateScriptResult>;
}
export {};
//# sourceMappingURL=script-operations.d.ts.map