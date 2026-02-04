/**
 * Winston logger configuration for structured logging
 */
import winston from 'winston';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

/**
 * Custom log format for console output
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} [${level}] ${message} ${metaStr}`;
  })
);

/**
 * JSON format for file output
 */
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

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
export function log(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>
): void {
  logger.log(level, message, context);
}

/**
 * Log an error with full stack trace
 * @param error - Error object
 * @param message - Optional context message
 */
export function logError(error: Error, message?: string): void {
  logger.error(message || error.message, {
    error: error.message,
    stack: error.stack,
  });
}
