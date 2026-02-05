/**
 * Tests for structured error types
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MCPError,
  ValidationError,
  NetworkError,
  ToolNotFoundError,
  InternalError,
  TimeoutError,
  CircuitBreakerError,
  ConfigurationError,
  toMCPError,
  toMCPRPCError,
} from '../../src/types/errors.js';

describe('MCPError', () => {
  describe('ValidationError', () => {
    it('should create validation error with correlation ID', () => {
      const error = new ValidationError('Invalid input', 'test-correlation-id');
      
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.correlationId).toBe('test-correlation-id');
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should include field and issues in client error', () => {
      const issues = [{ path: ['name'], message: 'Required' }];
      const error = new ValidationError('Invalid', 'test-id', 'name', issues);
      
      const clientError = error.toClientError();
      expect(clientError.code).toBe('VALIDATION_ERROR');
      expect(clientError.field).toBe('name');
      expect(clientError.issues).toEqual(issues);
      expect(clientError.correlationId).toBe('test-id');
    });
  });

  describe('NetworkError', () => {
    it('should create network error with retryable flag', () => {
      const error = new NetworkError('Connection failed', 'test-id', true);
      
      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.statusCode).toBe(503);
      expect(error.retryable).toBe(true);
    });

    it('should default retryable to true', () => {
      const error = new NetworkError('Connection failed');
      expect(error.retryable).toBe(true);
    });

    it('should include retryable in client error', () => {
      const error = new NetworkError('Connection failed', 'test-id', false);
      const clientError = error.toClientError();
      
      expect(clientError.retryable).toBe(false);
    });
  });

  describe('ToolNotFoundError', () => {
    it('should create tool not found error', () => {
      const error = new ToolNotFoundError('my_tool', 'test-id');
      
      expect(error.message).toBe('Tool not found: my_tool');
      expect(error.code).toBe('TOOL_NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.toolName).toBe('my_tool');
    });

    it('should include tool name in client error', () => {
      const error = new ToolNotFoundError('my_tool', 'test-id');
      const clientError = error.toClientError();
      
      expect(clientError.toolName).toBe('my_tool');
    });
  });

  describe('InternalError', () => {
    it('should sanitize error message', () => {
      const error = new InternalError('Detailed internal error', 'test-id');
      
      // Message should be sanitized to avoid leaking details
      expect(error.message).toBe(
        'An internal error occurred. Please contact support with the correlation ID.'
      );
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.statusCode).toBe(500);
    });

    it('should not expose internal details in client error', () => {
      const error = new InternalError('Database connection failed', 'test-id');
      const clientError = error.toClientError();
      
      expect(clientError.message).not.toContain('Database');
      expect(clientError.correlationId).toBe('test-id');
    });
  });

  describe('TimeoutError', () => {
    it('should create timeout error with duration', () => {
      const error = new TimeoutError('API call', 5000, 'test-id');
      
      expect(error.message).toBe('Operation timed out after 5000ms: API call');
      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.statusCode).toBe(504);
      expect(error.timeoutMs).toBe(5000);
    });

    it('should include timeout in client error', () => {
      const error = new TimeoutError('API call', 3000, 'test-id');
      const clientError = error.toClientError();
      
      expect(clientError.timeoutMs).toBe(3000);
    });
  });

  describe('toMCPError', () => {
    it('should return MCPError unchanged', () => {
      const original = new ValidationError('Test', 'test-id');
      const converted = toMCPError(original, 'test-id');
      
      expect(converted).toBe(original);
    });

    it('should convert timeout error', () => {
      const error = new Error('Operation timed out');
      const converted = toMCPError(error, 'test-id');
      
      expect(converted).toBeInstanceOf(TimeoutError);
      expect(converted.correlationId).toBe('test-id');
    });

    it('should convert connection error', () => {
      const error = new Error('ECONNREFUSED: Connection refused');
      const converted = toMCPError(error, 'test-id');
      
      expect(converted).toBeInstanceOf(NetworkError);
      expect(converted.correlationId).toBe('test-id');
    });

    it('should convert unknown Error to InternalError', () => {
      const error = new Error('Something went wrong');
      const converted = toMCPError(error, 'test-id');
      
      expect(converted).toBeInstanceOf(InternalError);
      expect(converted.correlationId).toBe('test-id');
    });

    it('should convert unknown type to InternalError', () => {
      const converted = toMCPError('string error', 'test-id');
      
      expect(converted).toBeInstanceOf(InternalError);
      expect(converted.correlationId).toBe('test-id');
    });

    it('should not expose stack traces in client errors', () => {
      const error = new ValidationError('Test', 'test-id');
      const clientError = error.toClientError();
      
      expect(clientError).not.toHaveProperty('stack');
      expect(clientError).not.toHaveProperty('name');
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error with config key', () => {
      const error = new ConfigurationError('Invalid port number', 'test-id', 'PORT');
      
      expect(error.message).toBe('Invalid port number');
      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.configKey).toBe('PORT');
      expect(error.correlationId).toBe('test-id');
    });

    it('should create configuration error without config key', () => {
      const error = new ConfigurationError('Missing required configuration', 'test-id');
      
      expect(error.message).toBe('Missing required configuration');
      expect(error.configKey).toBeUndefined();
    });

    it('should include config key in client error', () => {
      const error = new ConfigurationError('Invalid timeout', 'test-id', 'TIMEOUT_MS');
      const clientError = error.toClientError();
      
      expect(clientError.code).toBe('CONFIGURATION_ERROR');
      expect(clientError.configKey).toBe('TIMEOUT_MS');
      expect(clientError.correlationId).toBe('test-id');
    });
  });

  describe('toMCPRPCError', () => {
    it('should map ValidationError to JSON-RPC invalid params error', () => {
      const error = new ValidationError('Invalid input', 'test-id', 'name', [
        { path: ['name'], message: 'Required' }
      ]);
      const rpcError = toMCPRPCError(error);
      
      expect(rpcError.code).toBe(-32602); // Invalid params
      expect(rpcError.message).toBe('Invalid input');
      expect(rpcError.data).toHaveProperty('field', 'name');
      expect(rpcError.data).toHaveProperty('issues');
    });

    it('should map ToolNotFoundError to JSON-RPC method not found error', () => {
      const error = new ToolNotFoundError('my_tool', 'test-id');
      const rpcError = toMCPRPCError(error);
      
      expect(rpcError.code).toBe(-32601); // Method not found
      expect(rpcError.message).toBe('Tool not found: my_tool');
      expect(rpcError.data).toEqual({ toolName: 'my_tool' });
    });

    it('should map TimeoutError to JSON-RPC server error', () => {
      const error = new TimeoutError('API call', 5000, 'test-id');
      const rpcError = toMCPRPCError(error);
      
      expect(rpcError.code).toBe(-32000); // Server error
      expect(rpcError.message).toContain('timed out');
      expect(rpcError.data).toEqual({
        timeout: true,
        timeoutMs: 5000,
        operation: 'API call'
      });
    });

    it('should map NetworkError to JSON-RPC server error', () => {
      const error = new NetworkError('Connection failed', 'test-id', true);
      const rpcError = toMCPRPCError(error);
      
      expect(rpcError.code).toBe(-32000); // Server error
      expect(rpcError.message).toBe('Connection failed');
      expect(rpcError.data).toEqual({ retryable: true });
    });

    it('should map CircuitBreakerError to JSON-RPC server error', () => {
      const error = new CircuitBreakerError(30000, 'test-id');
      const rpcError = toMCPRPCError(error);
      
      expect(rpcError.code).toBe(-32000); // Server error
      expect(rpcError.message).toContain('Circuit breaker is OPEN');
      expect(rpcError.data).toEqual({ retryAfterMs: 30000 });
    });

    it('should map generic Error to JSON-RPC internal error', () => {
      const error = new Error('Something went wrong');
      const rpcError = toMCPRPCError(error);
      
      expect(rpcError.code).toBe(-32603); // Internal error
      expect(rpcError.message).toBeDefined();
    });

    it('should hide error details in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const error = new Error('Sensitive internal error');
      const rpcError = toMCPRPCError(error);
      
      expect(rpcError.code).toBe(-32603); // Internal error
      expect(rpcError.message).toBe('Internal error');
      expect(rpcError.data).toBeUndefined();
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should include error details in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const error = new Error('Debug error message');
      const rpcError = toMCPRPCError(error);
      
      expect(rpcError.code).toBe(-32603);
      expect(rpcError.message).toBe('Debug error message');
      expect(rpcError.data).toEqual({ originalMessage: 'Debug error message' });
      
      process.env.NODE_ENV = originalEnv;
    });
  });
});
