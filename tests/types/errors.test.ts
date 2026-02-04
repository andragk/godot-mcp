/**
 * Tests for structured error types
 */
import { describe, it, expect } from 'vitest';
import {
  MCPError,
  ValidationError,
  NetworkError,
  ToolNotFoundError,
  InternalError,
  TimeoutError,
  toMCPError,
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
});
