/**
 * Winston logger configuration for structured logging
 */
import winston from 'winston';
/**
 * Main application logger instance
 */
export declare const logger: winston.Logger;
/**
 * Log a structured message with context
 * @param level - Log level
 * @param message - Log message
 * @param context - Additional context data
 */
export declare function log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void;
/**
 * Log an error with full stack trace
 * @param error - Error object
 * @param message - Optional context message
 */
export declare function logError(error: Error, message?: string): void;
//# sourceMappingURL=logger.d.ts.map