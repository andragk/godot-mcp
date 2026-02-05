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
 * Base format for all transports
 */
const baseFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  winston.format((info) => sanitizeLogInfo(info))()
);

/**
 * Main application logger instance
 */
export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: baseFormat,
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
 * @param context - Additional context data (e.g., correlationId)
 */
export function logError(error: Error, message?: string, context?: Record<string, unknown>): void {
  logger.error(message || error.message, {
    ...context,
    error: error.message,
    stack: error.stack,
    name: error.name,
  });
}

function sanitizeLogInfo(info: winston.Logform.TransformableInfo): winston.Logform.TransformableInfo {
  const seen = new WeakSet<object>();
  const maxDepth = 6;

  const sanitizeValue = (value: unknown, depth: number): unknown => {
    if (depth > maxDepth) {
      return '[MaxDepth]';
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (typeof value !== 'object' || value === null) {
      return value;
    }

    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, depth + 1));
    }

    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'function') {
        continue;
      }
      result[key] = sanitizeValue(entry, depth + 1);
    }
    return result;
  };

  const sanitized = sanitizeValue(info, 0) as Record<string, unknown>;
  Object.assign(info, sanitized);
  return info;
}
