/**
 * Structured error types for MCP server
 */
/**
 * Base error class with correlation ID support
 */
export declare abstract class MCPError extends Error {
    abstract readonly code: string;
    abstract readonly statusCode: number;
    readonly correlationId?: string;
    readonly timestamp: Date;
    constructor(message: string, correlationId?: string);
    /**
     * Get sanitized error for client response (no stack traces or internal details)
     */
    toClientError(): {
        code: string;
        message: string;
        correlationId?: string;
    };
}
/**
 * Validation error - invalid input from client
 */
export declare class ValidationError extends MCPError {
    readonly code = "VALIDATION_ERROR";
    readonly statusCode = 400;
    readonly field?: string;
    readonly issues?: Array<{
        path: string[];
        message: string;
    }>;
    constructor(message: string, correlationId?: string, field?: string, issues?: Array<{
        path: string[];
        message: string;
    }>);
    toClientError(): {
        field: string | undefined;
        issues: {
            path: string[];
            message: string;
        }[] | undefined;
        code: string;
        message: string;
        correlationId?: string;
    };
}
/**
 * Network error - communication failure with Godot bridge
 */
export declare class NetworkError extends MCPError {
    readonly code = "NETWORK_ERROR";
    readonly statusCode = 503;
    readonly retryable: boolean;
    constructor(message: string, correlationId?: string, retryable?: boolean);
    toClientError(): {
        retryable: boolean;
        code: string;
        message: string;
        correlationId?: string;
    };
}
/**
 * Tool not found error
 */
export declare class ToolNotFoundError extends MCPError {
    readonly code = "TOOL_NOT_FOUND";
    readonly statusCode = 404;
    readonly toolName: string;
    constructor(toolName: string, correlationId?: string);
    toClientError(): {
        toolName: string;
        code: string;
        message: string;
        correlationId?: string;
    };
}
/**
 * Internal server error - unexpected failures
 */
export declare class InternalError extends MCPError {
    readonly code = "INTERNAL_ERROR";
    readonly statusCode = 500;
    constructor(_message: string, correlationId?: string);
}
/**
 * Timeout error - operation took too long
 */
export declare class TimeoutError extends MCPError {
    readonly code = "TIMEOUT_ERROR";
    readonly statusCode = 504;
    readonly timeoutMs: number;
    readonly operation: string;
    constructor(operation: string, timeoutMs: number, correlationId?: string);
    toClientError(): {
        timeoutMs: number;
        operation: string;
        code: string;
        message: string;
        correlationId?: string;
    };
}
/**
 * Circuit breaker error - service unavailable
 */
export declare class CircuitBreakerError extends MCPError {
    readonly code = "CIRCUIT_BREAKER_OPEN";
    readonly statusCode = 503;
    readonly retryAfterMs: number;
    constructor(retryAfterMs: number, correlationId?: string);
    toClientError(): {
        retryAfterMs: number;
        code: string;
        message: string;
        correlationId?: string;
    };
}
/**
 * Configuration error - invalid configuration or setup
 */
export declare class ConfigurationError extends MCPError {
    readonly code = "CONFIGURATION_ERROR";
    readonly statusCode = 500;
    readonly configKey?: string;
    constructor(message: string, correlationId?: string, configKey?: string);
    toClientError(): {
        configKey: string | undefined;
        code: string;
        message: string;
        correlationId?: string;
    };
}
/**
 * JSON-RPC error - structured error from Godot bridge
 */
export declare class RpcError extends MCPError {
    readonly code = "RPC_ERROR";
    readonly statusCode = 500;
    readonly rpcCode: number;
    readonly rpcData?: unknown;
    constructor(rpcCode: number, message: string, correlationId?: string, rpcData?: unknown);
    toClientError(): {
        rpcCode: number;
        rpcData: unknown;
        code: string;
        message: string;
        correlationId?: string;
    };
}
/**
 * Convert unknown error to MCPError
 */
export declare function toMCPError(error: unknown, correlationId?: string): MCPError;
/**
 * Convert MCPError to JSON-RPC 2.0 error format
 * Maps MCP error types to JSON-RPC error codes
 */
export declare function toMCPRPCError(error: Error): {
    code: number;
    message: string;
    data?: unknown;
};
//# sourceMappingURL=errors.d.ts.map