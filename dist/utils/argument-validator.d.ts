/**
 * Validate Godot command-line arguments
 * @param args Arguments to validate
 * @returns Validated arguments
 * @throws ValidationError if any argument is invalid or unsafe
 */
export declare function validateGodotArguments(args: string[]): string[];
/**
 * Combine Godot executable path with validated arguments
 * @param executable Godot executable path
 * @param args Arguments to validate and combine
 * @returns Command parts ready for spawn
 */
export declare function prepareGodotCommand(executable: string, args: string[]): {
    command: string;
    args: string[];
};
/**
 * Check if an argument is in the whitelist
 * @param arg Argument to check
 * @returns true if argument is allowed
 */
export declare function isArgumentAllowed(arg: string): boolean;
//# sourceMappingURL=argument-validator.d.ts.map