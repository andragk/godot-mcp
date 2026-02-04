/**
 * Structured error types for MCP server
 */
/**
 * Base error class with correlation ID support
 */
export class MCPError extends Error {
    correlationId;
    timestamp;
    constructor(message, correlationId) {
        super(message);
        this.name = this.constructor.name;
        this.correlationId = correlationId;
        this.timestamp = new Date();
        Error.captureStackTrace(this, this.constructor);
    }
    /**
     * Get sanitized error for client response (no stack traces or internal details)
     */
    toClientError() {
        return {
            code: this.code,
            message: this.message,
            correlationId: this.correlationId,
        };
    }
}
/**
 * Validation error - invalid input from client
 */
export class ValidationError extends MCPError {
    code = 'VALIDATION_ERROR';
    statusCode = 400;
    field;
    issues;
    constructor(message, correlationId, field, issues) {
        super(message, correlationId);
        this.field = field;
        this.issues = issues;
    }
    toClientError() {
        return {
            ...super.toClientError(),
            field: this.field,
            issues: this.issues,
        };
    }
}
/**
 * Network error - communication failure with Godot bridge
 */
export class NetworkError extends MCPError {
    code = 'NETWORK_ERROR';
    statusCode = 503;
    retryable;
    constructor(message, correlationId, retryable = true) {
        super(message, correlationId);
        this.retryable = retryable;
    }
    toClientError() {
        return {
            ...super.toClientError(),
            retryable: this.retryable,
        };
    }
}
/**
 * Tool not found error
 */
export class ToolNotFoundError extends MCPError {
    code = 'TOOL_NOT_FOUND';
    statusCode = 404;
    toolName;
    constructor(toolName, correlationId) {
        super(`Tool not found: ${toolName}`, correlationId);
        this.toolName = toolName;
    }
    toClientError() {
        return {
            ...super.toClientError(),
            toolName: this.toolName,
        };
    }
}
/**
 * Internal server error - unexpected failures
 */
export class InternalError extends MCPError {
    code = 'INTERNAL_ERROR';
    statusCode = 500;
    constructor(_message, correlationId) {
        // Sanitize message to avoid leaking internal details
        super('An internal error occurred. Please contact support with the correlation ID.', correlationId);
    }
}
/**
 * Timeout error - operation took too long
 */
export class TimeoutError extends MCPError {
    code = 'TIMEOUT_ERROR';
    statusCode = 504;
    timeoutMs;
    operation;
    constructor(operation, timeoutMs, correlationId) {
        super(`Operation timed out after ${timeoutMs}ms: ${operation}`, correlationId);
        this.timeoutMs = timeoutMs;
        this.operation = operation;
    }
    toClientError() {
        return {
            ...super.toClientError(),
            timeoutMs: this.timeoutMs,
            operation: this.operation,
        };
    }
}
/**
 * Circuit breaker error - service unavailable
 */
export class CircuitBreakerError extends MCPError {
    code = 'CIRCUIT_BREAKER_OPEN';
    statusCode = 503;
    retryAfterMs;
    constructor(retryAfterMs, correlationId) {
        super(`Circuit breaker is OPEN - service unavailable. Retry after ${retryAfterMs}ms`, correlationId);
        this.retryAfterMs = retryAfterMs;
    }
    toClientError() {
        return {
            ...super.toClientError(),
            retryAfterMs: this.retryAfterMs,
        };
    }
}
/**
 * Convert unknown error to MCPError
 */
export function toMCPError(error, correlationId) {
    if (error instanceof MCPError) {
        return error;
    }
    if (error instanceof Error) {
        // Check for specific error types based on message content
        const message = error.message.toLowerCase();
        if (message.includes('timeout') || message.includes('etimedout') || message.includes('timed out')) {
            return new TimeoutError('Operation timed out', 5000, correlationId);
        }
        if (message.includes('econnrefused') || message.includes('enotfound') || message.includes('connection')) {
            return new NetworkError('Cannot connect to Godot bridge', correlationId, true);
        }
        // Default to internal error for unhandled Error types
        return new InternalError(error.message, correlationId);
    }
    // Unknown error type
    return new InternalError('An unexpected error occurred', correlationId);
}
//# sourceMappingURL=errors.js.map