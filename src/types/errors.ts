/**
 * Structured error types for MCP server
 */

/**
 * Base error class with correlation ID support
 */
export abstract class MCPError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly correlationId?: string;
  readonly timestamp: Date;

  constructor(message: string, correlationId?: string) {
    super(message);
    this.name = this.constructor.name;
    this.correlationId = correlationId;
    this.timestamp = new Date();
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Get sanitized error for client response (no stack traces or internal details)
   */
  toClientError(): { code: string; message: string; correlationId?: string } {
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
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
  readonly field?: string;
  readonly issues?: Array<{ path: string[]; message: string }>;

  constructor(message: string, correlationId?: string, field?: string, issues?: Array<{ path: string[]; message: string }>) {
    super(message, correlationId);
    this.field = field;
    this.issues = issues;
  }

  override toClientError() {
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
  readonly code = 'NETWORK_ERROR';
  readonly statusCode = 503;
  readonly retryable: boolean;

  constructor(message: string, correlationId?: string, retryable = true) {
    super(message, correlationId);
    this.retryable = retryable;
  }

  override toClientError() {
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
  readonly code = 'TOOL_NOT_FOUND';
  readonly statusCode = 404;
  readonly toolName: string;

  constructor(toolName: string, correlationId?: string) {
    super(`Tool not found: ${toolName}`, correlationId);
    this.toolName = toolName;
  }

  override toClientError() {
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
  readonly code = 'INTERNAL_ERROR';
  readonly statusCode = 500;

  constructor(_message: string, correlationId?: string) {
    // Sanitize message to avoid leaking internal details
    super('An internal error occurred. Please contact support with the correlation ID.', correlationId);
  }
}

/**
 * Timeout error - operation took too long
 */
export class TimeoutError extends MCPError {
  readonly code = 'TIMEOUT_ERROR';
  readonly statusCode = 504;
  readonly timeoutMs: number;
  readonly operation: string;

  constructor(operation: string, timeoutMs: number, correlationId?: string) {
    super(`Operation timed out after ${timeoutMs}ms: ${operation}`, correlationId);
    this.timeoutMs = timeoutMs;
    this.operation = operation;
  }

  override toClientError() {
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
  readonly code = 'CIRCUIT_BREAKER_OPEN';
  readonly statusCode = 503;
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number, correlationId?: string) {
    super(`Circuit breaker is OPEN - service unavailable. Retry after ${retryAfterMs}ms`, correlationId);
    this.retryAfterMs = retryAfterMs;
  }

  override toClientError() {
    return {
      ...super.toClientError(),
      retryAfterMs: this.retryAfterMs,
    };
  }
}

/**
 * Configuration error - invalid configuration or setup
 */
export class ConfigurationError extends MCPError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly statusCode = 500;
  readonly configKey?: string;

  constructor(message: string, correlationId?: string, configKey?: string) {
    super(message, correlationId);
    this.configKey = configKey;
  }

  override toClientError() {
    return {
      ...super.toClientError(),
      configKey: this.configKey,
    };
  }
}

/**
 * JSON-RPC error - structured error from Godot bridge
 */
export class RpcError extends MCPError {
  readonly code = 'RPC_ERROR';
  readonly statusCode = 500;
  readonly rpcCode: number;
  readonly rpcData?: unknown;

  constructor(rpcCode: number, message: string, correlationId?: string, rpcData?: unknown) {
    super(`RPC error ${rpcCode}: ${message}`, correlationId);
    this.rpcCode = rpcCode;
    this.rpcData = rpcData;
  }

  override toClientError() {
    return {
      ...super.toClientError(),
      rpcCode: this.rpcCode,
      rpcData: this.rpcData,
    };
  }
}

/**
 * Convert unknown error to MCPError
 */
export function toMCPError(error: unknown, correlationId?: string): MCPError {
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

/**
 * Convert MCPError to JSON-RPC 2.0 error format
 * Maps MCP error types to JSON-RPC error codes
 */
export function toMCPRPCError(error: Error): {
  code: number;
  message: string;
  data?: unknown;
} {
  // Handle MCP-specific errors
  if (error instanceof ValidationError) {
    return {
      code: -32602, // Invalid params
      message: error.message,
      data: {
        field: error.field,
        issues: error.issues,
      },
    };
  }

  if (error instanceof ToolNotFoundError) {
    return {
      code: -32601, // Method not found
      message: error.message,
      data: { toolName: error.toolName },
    };
  }

  if (error instanceof TimeoutError) {
    return {
      code: -32000, // Server error
      message: error.message,
      data: {
        timeout: true,
        timeoutMs: error.timeoutMs,
        operation: error.operation,
      },
    };
  }

  if (error instanceof NetworkError) {
    return {
      code: -32000, // Server error
      message: error.message,
      data: {
        retryable: error.retryable,
      },
    };
  }

  if (error instanceof CircuitBreakerError) {
    return {
      code: -32000, // Server error
      message: error.message,
      data: {
        retryAfterMs: error.retryAfterMs,
      },
    };
  }

  if (error instanceof RpcError) {
    return {
      code: error.rpcCode,
      message: error.message,
      data: error.rpcData,
    };
  }

  // Generic internal error
  return {
    code: -32603, // Internal error
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal error' 
      : error.message,
    data: process.env.NODE_ENV === 'production' 
      ? undefined 
      : { originalMessage: error.message },
  };
}
