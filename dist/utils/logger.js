/**
 * Winston logger configuration for structured logging
 */
import winston from 'winston';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
/**
 * Custom log format for console output
 */
const consoleFormat = winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.colorize(), winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} [${level}] ${message} ${metaStr}`;
}));
/**
 * JSON format for file output
 */
const jsonFormat = winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json());
/**
 * Main application logger instance
 */
export const logger = winston.createLogger({
    level: LOG_LEVEL,
    format: jsonFormat,
    defaultMeta: { service: 'godot-mcp' },
    transports: [
        new winston.transports.Console({
            format: consoleFormat,
        }),
    ],
});
/**
 * Log a structured message with context
 * @param level - Log level
 * @param message - Log message
 * @param context - Additional context data
 */
export function log(level, message, context) {
    logger.log(level, message, context);
}
/**
 * Log an error with full stack trace
 * @param error - Error object
 * @param message - Optional context message
 * @param context - Additional context data (e.g., correlationId)
 */
export function logError(error, message, context) {
    logger.error(message || error.message, {
        ...context,
        error: error.message,
        stack: error.stack,
        name: error.name,
    });
}
//# sourceMappingURL=logger.js.map