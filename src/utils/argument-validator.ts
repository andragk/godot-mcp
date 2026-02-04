/**
 * Command Argument Validation Utilities
 * Provides secure argument validation to prevent command injection attacks
 */
import { ValidationError } from '../types/errors.js';

/**
 * Whitelist of allowed Godot command-line arguments
 * These are considered safe and can be passed to the Godot executable
 */
const ALLOWED_GODOT_ARGS = new Set([
  // Version and help
  '--version',
  '-v',
  '--help',
  '-h',
  
  // Editor mode
  '--editor',
  '-e',
  '--quit',
  '-q',
  
  // Project
  '--path',
  '--main-pack',
  '--upwards',
  
  // Rendering
  '--resolution',
  '--position',
  '--headless',
  '--display-driver',
  '--rendering-driver',
  '--rendering-method',
  '--screen',
  
  // Audio
  '--audio-driver',
  
  // Debug
  '--debug',
  '-d',
  '--breakpoints',
  '--profiling',
  '--frame-delay',
  '--time-scale',
  '--disable-vsync',
  '--fixed-fps',
  
  // Development
  '--verbose',
  '--debug-collisions',
  '--debug-paths',
  '--debug-navigation',
  '--remote-debug',
  '--debug-server',
  
  // Export
  '--export',
  '--export-debug',
  '--export-pack',
  '--doctool',
  '--no-docbase',
  '--build-solutions',
  '--dump-gdextension-interface',
  '--validate-extension-api',
  
  // Scripting
  '--script',
  '-s',
  
  // Testing
  '--check-only',
  '--benchmark',
  '--benchmark-file',
]);

/**
 * Arguments that accept values (e.g., --path /some/path)
 */
const ARGS_WITH_VALUES = new Set([
  '--path',
  '--main-pack',
  '--resolution',
  '--position',
  '--display-driver',
  '--rendering-driver',
  '--rendering-method',
  '--screen',
  '--audio-driver',
  '--breakpoints',
  '--frame-delay',
  '--time-scale',
  '--fixed-fps',
  '--remote-debug',
  '--debug-server',
  '--export',
  '--export-debug',
  '--export-pack',
  '--script',
  '--benchmark-file',
]);

/**
 * Dangerous patterns in argument values that indicate potential injection
 */
const DANGEROUS_VALUE_PATTERNS = [
  /[;&|`$()]/,        // Shell metacharacters
  /\n|\r/,            // Newlines
  /\0/,               // Null bytes
  /^-/,               // Start with dash (could be another argument)
];

/**
 * Validate Godot command-line arguments
 * @param args Arguments to validate
 * @returns Validated arguments
 * @throws ValidationError if any argument is invalid or unsafe
 */
export function validateGodotArguments(args: string[]): string[] {
  const validated: string[] = [];
  let i = 0;

  while (i < args.length) {
    const arg = args[i];
    
    if (!arg) {
      throw new ValidationError('Empty argument found');
    }

    // Extract argument name (before = if present)
    const argName = arg.includes('=') ? arg.split('=')[0] : arg;

    // Check if argument is whitelisted
    if (!ALLOWED_GODOT_ARGS.has(argName)) {
      throw new ValidationError(`Disallowed argument: ${argName}`);
    }

    // If argument uses = syntax (e.g., --path=/some/path)
    if (arg.includes('=')) {
      const value = arg.split('=')[1];
      validateArgumentValue(argName, value);
      validated.push(arg);
      i++;
      continue;
    }

    // Check if this argument expects a value
    if (ARGS_WITH_VALUES.has(argName)) {
      // Get the next argument as the value
      if (i + 1 >= args.length) {
        throw new ValidationError(`Argument ${argName} requires a value`);
      }
      
      const value = args[i + 1];
      validateArgumentValue(argName, value);
      
      validated.push(argName);
      validated.push(value);
      i += 2;
    } else {
      // Flag without value
      validated.push(arg);
      i++;
    }
  }

  return validated;
}

/**
 * Validate an argument value for dangerous patterns
 * @param argName Argument name
 * @param value Value to validate
 * @throws ValidationError if value contains dangerous patterns
 */
function validateArgumentValue(argName: string, value: string): void {
  // Check for dangerous patterns
  for (const pattern of DANGEROUS_VALUE_PATTERNS) {
    if (pattern.test(value)) {
      throw new ValidationError(
        `Argument ${argName} contains dangerous pattern in value: ${value}`
      );
    }
  }

  // Additional validation based on argument type
  switch (argName) {
    case '--resolution':
      if (!/^\d+x\d+$/.test(value)) {
        throw new ValidationError(
          `Invalid resolution format: ${value} (expected: WIDTHxHEIGHT, e.g., 1920x1080)`
        );
      }
      break;
    
    case '--position':
      if (!/^\d+,\d+$/.test(value)) {
        throw new ValidationError(
          `Invalid position format: ${value} (expected: X,Y, e.g., 100,100)`
        );
      }
      break;
    
    case '--screen':
    case '--fixed-fps':
    case '--frame-delay':
      if (!/^\d+$/.test(value)) {
        throw new ValidationError(
          `Argument ${argName} requires a numeric value, got: ${value}`
        );
      }
      break;
    
    case '--time-scale':
      if (!/^\d+\.?\d*$/.test(value)) {
        throw new ValidationError(
          `Argument ${argName} requires a numeric value, got: ${value}`
        );
      }
      break;
  }
}

/**
 * Combine Godot executable path with validated arguments
 * @param executable Godot executable path
 * @param args Arguments to validate and combine
 * @returns Command parts ready for spawn
 */
export function prepareGodotCommand(
  executable: string,
  args: string[]
): { command: string; args: string[] } {
  return {
    command: executable,
    args: validateGodotArguments(args),
  };
}

/**
 * Check if an argument is in the whitelist
 * @param arg Argument to check
 * @returns true if argument is allowed
 */
export function isArgumentAllowed(arg: string): boolean {
  const argName = arg.includes('=') ? arg.split('=')[0] : arg;
  return ALLOWED_GODOT_ARGS.has(argName);
}
