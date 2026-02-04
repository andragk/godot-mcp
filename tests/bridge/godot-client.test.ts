import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GodotClient, CircuitBreakerEvent } from '../../src/bridge/godot-client.js';
import { CircuitBreakerError, TimeoutError, NetworkError } from '../../src/types/errors.js';
import { logger } from '../../src/utils/logger.js';
import * as undici from 'undici';

// Mock logger to prevent console spam during tests
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  logError: vi.fn(),
}));

// Mock undici
vi.mock('undici', () => {
  const mockPool = vi.fn().mockImplementation(function(this: never) {
    return {
      close: vi.fn().mockResolvedValue(undefined),
    };
  });
  
  return {
    Pool: mockPool,
    request: vi.fn(),
  };
});

describe('GodotClient', () => {
  let client: GodotClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GodotClient({
      port: 7777,
      timeout: 1000,
      retryStrategy: {
        maxRetries: 2,
        baseDelay: 100,
        maxDelay: 1000,
        jitterFactor: 0.1,
        retryableErrors: new Set(['ECONNREFUSED', 'ETIMEDOUT']),
      },
      circuitBreaker: {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 5000,
      },
    });
  });

  afterEach(async () => {
    await client.close();
  });

  describe('initialization', () => {
    it('should create client with default configuration', () => {
      const defaultClient = new GodotClient();
      expect(defaultClient).toBeDefined();
      expect(logger.info).toHaveBeenCalledWith(
        'GodotClient initialized',
        expect.objectContaining({ url: expect.stringContaining('localhost:7777') })
      );
    });

    it('should create client with custom configuration', () => {
      const customClient = new GodotClient({
        port: 8888,
        timeout: 5000,
        poolConfig: {
          connections: 20,
          pipelining: 2,
          keepAliveTimeout: 60000,
          keepAliveMaxTimeout: 120000,
        },
      });
      expect(customClient).toBeDefined();
      expect(logger.info).toHaveBeenCalledWith(
        'GodotClient initialized',
        expect.objectContaining({ url: expect.stringContaining(':8888') })
      );
    });

    it('should initialize with correct default metrics', () => {
      const metrics = client.getCircuitMetrics();
      expect(metrics.totalOpens).toBe(0);
      expect(metrics.totalHalfOpens).toBe(0);
      expect(metrics.successfulRecoveries).toBe(0);
      expect(metrics.totalRequests).toBe(0);
    });
  });

  describe('circuit breaker', () => {
    it('should transition to OPEN after threshold failures', async () => {
      const requestMock = vi.mocked(undici.request);
      requestMock.mockRejectedValue(new Error('ECONNREFUSED'));

      const stateChangeListener = vi.fn();
      client.on(CircuitBreakerEvent.STATE_CHANGE, stateChangeListener);

      // Trigger failures to open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await client.sendRequest('test_method');
        } catch {
          // Expected failures
        }
      }

      expect(client.getCircuitState()).toBe('OPEN');
      expect(stateChangeListener).toHaveBeenCalled();
      const metrics = client.getCircuitMetrics();
      expect(metrics.totalOpens).toBe(1);
    });

    it('should throw CircuitBreakerError when OPEN', async () => {
      const requestMock = vi.mocked(undici.request);
      requestMock.mockRejectedValue(new Error('ECONNREFUSED'));

      // Trigger failures to open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await client.sendRequest('test_method');
        } catch {
          // Expected failures
        }
      }

      expect(client.getCircuitState()).toBe('OPEN');

      // Next request should immediately fail with CircuitBreakerError
      await expect(client.sendRequest('test_method')).rejects.toThrow(CircuitBreakerError);
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const requestMock = vi.mocked(undici.request);
      requestMock.mockRejectedValue(new Error('ECONNREFUSED'));

      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await client.sendRequest('test_method');
        } catch {
          // Expected
        }
      }

      expect(client.getCircuitState()).toBe('OPEN');

      // Mock successful response for half-open test
      requestMock.mockResolvedValueOnce({
        statusCode: 200,
        body: {
          text: vi.fn().mockResolvedValue(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: 'success',
          })),
        },
      } as never);

      // Wait for timeout and trigger transition
      await new Promise((resolve) => setTimeout(resolve, 5100));

      // Should transition to HALF_OPEN and allow request
      await client.sendRequest('test_method');
      expect(client.getCircuitState()).toBe('HALF_OPEN');
    }, 10000);

    it('should require consecutive successes to close from HALF_OPEN', async () => {
      const requestMock = vi.mocked(undici.request);

      // Open circuit
      requestMock.mockRejectedValue(new Error('ECONNREFUSED'));
      for (let i = 0; i < 3; i++) {
        try {
          await client.sendRequest('test_method');
        } catch {
          // Expected
        }
      }

      // Wait for HALF_OPEN transition
      await new Promise((resolve) => setTimeout(resolve, 5100));

      // Mock successful responses
      const successResponse = {
        statusCode: 200,
        body: {
          text: vi.fn().mockResolvedValue(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: 'success',
          })),
        },
      } as never;

      requestMock.mockResolvedValue(successResponse);

      // First success - should stay HALF_OPEN
      await client.sendRequest('test_method');
      expect(client.getCircuitState()).toBe('HALF_OPEN');

      // Second success - should close circuit (threshold is 2)
      await client.sendRequest('test_method');
      expect(client.getCircuitState()).toBe('CLOSED');

      const metrics = client.getCircuitMetrics();
      expect(metrics.successfulRecoveries).toBe(1);
    }, 10000);

    it('should reopen on failure in HALF_OPEN state', async () => {
      const requestMock = vi.mocked(undici.request);

      // Open circuit
      requestMock.mockRejectedValue(new Error('ECONNREFUSED'));
      for (let i = 0; i < 3; i++) {
        try {
          await client.sendRequest('test_method');
        } catch {
          // Expected
        }
      }

      // Wait for HALF_OPEN
      await new Promise((resolve) => setTimeout(resolve, 5100));

      // Mock one success, then failure
      requestMock
        .mockResolvedValueOnce({
          statusCode: 200,
          body: {
            text: vi.fn().mockResolvedValue(JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              result: 'success',
            })),
          },
        } as never)
        .mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await client.sendRequest('test_method');
      expect(client.getCircuitState()).toBe('HALF_OPEN');

      // Failure should reopen circuit
      try {
        await client.sendRequest('test_method');
      } catch {
        // Expected
      }

      expect(client.getCircuitState()).toBe('OPEN');
    }, 10000);

    it('should emit circuit breaker events', async () => {
      const requestMock = vi.mocked(undici.request);
      requestMock.mockRejectedValue(new Error('ECONNREFUSED'));

      const openedListener = vi.fn();
      const stateChangeListener = vi.fn();

      client.on(CircuitBreakerEvent.OPENED, openedListener);
      client.on(CircuitBreakerEvent.STATE_CHANGE, stateChangeListener);

      // Trigger failures
      for (let i = 0; i < 3; i++) {
        try {
          await client.sendRequest('test_method');
        } catch {
          // Expected
        }
      }

      expect(openedListener).toHaveBeenCalledWith(expect.objectContaining({
        timestamp: expect.any(Date),
      }));
      expect(stateChangeListener).toHaveBeenCalled();
    });
  });

  describe('request timeout', () => {
    it('should timeout request after specified duration', async () => {
      const requestMock = vi.mocked(undici.request);

      // Mock a hanging request that respects AbortSignal
      requestMock.mockImplementation(
        ((_url: never, options: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => {
              const error = new Error('AbortError');
              error.name = 'AbortError';
              reject(error);
            });
          })) as never
      );

      const timeoutClient = new GodotClient({ timeout: 100 });

      await expect(timeoutClient.sendRequest('test_method')).rejects.toThrow(TimeoutError);
      await timeoutClient.close();
    }, 10000);

    it('should include timeout duration in error', async () => {
      const requestMock = vi.mocked(undici.request);
      requestMock.mockImplementation(
        ((_url: never, options: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => {
              const error = new Error('AbortError');
              error.name = 'AbortError';
              reject(error);
            });
          })) as never
      );

      const timeoutClient = new GodotClient({ timeout: 100 });

      try {
        await timeoutClient.sendRequest('test_method');
        expect.fail('Should have thrown TimeoutError');
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        expect((error as TimeoutError).timeoutMs).toBe(100);
      } finally {
        await timeoutClient.close();
      }
    });
  });

  describe('retry logic', () => {
    it('should retry on retryable errors', async () => {
      const requestMock = vi.mocked(undici.request);

      // Create errors with code property
      const createTimeoutError = () => {
        const error = new Error('Connection timeout') as NodeJS.ErrnoException;
        error.code = 'ETIMEDOUT';
        return error;
      };

      let attemptCount = 0;
      // Fail once, succeed on second attempt
      requestMock.mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          return Promise.reject(createTimeoutError());
        }
        return Promise.resolve({
          statusCode: 200,
          body: {
            text: vi.fn().mockResolvedValue(JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              result: 'success',
            })),
          },
        } as never);
      });

      const result = await client.sendRequest('test_method', {}, { retryable: true });
      expect(result).toBe('success');
      // Should have retried and succeeded on 2nd attempt
      expect(attemptCount).toBe(2);
    });

    it('should use exponential backoff with jitter', async () => {
      const requestMock = vi.mocked(undici.request);
      
      const createTimeoutError = () => {
        const error = new Error('Connection timeout') as NodeJS.ErrnoException;
        error.code = 'ETIMEDOUT';
        return error;
      };
      
      let attemptCount = 0;
      const attemptTimes: number[] = [];
      requestMock.mockImplementation(() => {
        attemptCount++;
        attemptTimes.push(Date.now());
        if (attemptCount <= 2) {
          return Promise.reject(createTimeoutError());
        }
        return Promise.resolve({
          statusCode: 200,
          body: {
            text: vi.fn().mockResolvedValue(JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              result: 'success',
            })),
          },
        } as never);
      });

      await client.sendRequest('test_method', {}, { retryable: true });

      // Should have made 3 attempts
      expect(attemptTimes.length).toBe(3);
      
      // Check that there was a delay between attempts
      // First delay (between attempts 1 and 2)
      const firstDelay = attemptTimes[1]! - attemptTimes[0]!;
      // Second delay (between attempts 2 and 3)
      const secondDelay = attemptTimes[2]! - attemptTimes[1]!;

      // Base delay is 100ms, should grow exponentially
      expect(firstDelay).toBeGreaterThan(50); // At least some delay
      expect(secondDelay).toBeGreaterThan(150); // Should be roughly 2x the base
      expect(secondDelay).toBeGreaterThanOrEqual(firstDelay); // Should increase
    });

    it('should not retry non-idempotent operations by default', async () => {
      const requestMock = vi.mocked(undici.request);
      requestMock.mockRejectedValue(new Error('ETIMEDOUT'));

      try {
        // Non-idempotent method
        await client.sendRequest('execute_command', {}, { retryable: false });
      } catch {
        // Expected
      }

      // Should only attempt once
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it('should not retry when circuit is open', async () => {
      const requestMock = vi.mocked(undici.request);
      requestMock.mockRejectedValue(new Error('ECONNREFUSED'));

      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await client.sendRequest('test_method');
        } catch {
          // Expected
        }
      }

      expect(client.getCircuitState()).toBe('OPEN');

      // Clear mock calls
      requestMock.mockClear();

      // Try request - should fail immediately
      await expect(client.sendRequest('test_method')).rejects.toThrow(CircuitBreakerError);

      // Should not have called request (circuit open)
      expect(requestMock).not.toHaveBeenCalled();
    });
  });

  describe('logging', () => {
    it('should log requests with correlation ID', async () => {
      const requestMock = vi.mocked(undici.request);
      requestMock.mockResolvedValue({
        statusCode: 200,
        body: {
          text: vi.fn().mockResolvedValue(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: 'success',
          })),
        },
      } as never);

      await client.sendRequest('test_method', { param: 'value' });

      expect(logger.debug).toHaveBeenCalledWith(
        'Request initiated',
        expect.objectContaining({
          correlationId: expect.any(String),
          method: 'test_method',
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Request completed',
        expect.objectContaining({
          correlationId: expect.any(String),
          method: 'test_method',
          duration: expect.any(Number),
        })
      );
    });

    it('should sanitize sensitive parameters', async () => {
      const requestMock = vi.mocked(undici.request);
      requestMock.mockResolvedValue({
        statusCode: 200,
        body: {
          text: vi.fn().mockResolvedValue(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: 'success',
          })),
        },
      } as never);

      await client.sendRequest('test_method', {
        username: 'user',
        password: 'secret123',
        apiKey: 'key123',
      });

      expect(logger.debug).toHaveBeenCalledWith(
        'Request initiated',
        expect.objectContaining({
          params: {
            username: 'user',
            password: '***REDACTED***',
            apiKey: '***REDACTED***',
          },
        })
      );
    });

    it('should log response times for performance monitoring', async () => {
      const requestMock = vi.mocked(undici.request);
      requestMock.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  statusCode: 200,
                  body: {
                    text: vi.fn().mockResolvedValue(JSON.stringify({
                      jsonrpc: '2.0',
                      id: 1,
                      result: 'success',
                    })),
                  },
                } as never),
              50
            )
          )
      );

      await client.sendRequest('test_method');

      expect(logger.info).toHaveBeenCalledWith(
        'Request completed',
        expect.objectContaining({
          duration: expect.any(Number),
        })
      );
    });
  });

  describe('pool metrics', () => {
    it('should track pool utilization', () => {
      const metrics = client.getPoolMetrics();
      expect(metrics).toHaveProperty('activeConnections');
      expect(metrics).toHaveProperty('queuedRequests');
      expect(metrics).toHaveProperty('totalRequests');
      expect(metrics).toHaveProperty('utilization');
    });

    it('should update metrics on request', async () => {
      const requestMock = vi.mocked(undici.request);
      requestMock.mockResolvedValue({
        statusCode: 200,
        body: {
          text: vi.fn().mockResolvedValue(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: 'success',
          })),
        },
      } as never);

      const beforeMetrics = client.getPoolMetrics();
      await client.sendRequest('test_method');
      const afterMetrics = client.getPoolMetrics();

      expect(afterMetrics.totalRequests).toBeGreaterThan(beforeMetrics.totalRequests);
    });
  });

  describe('graceful shutdown', () => {
    it('should wait for active connections before closing', async () => {
      const requestMock = vi.mocked(undici.request);

      // Mock slow request
      requestMock.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  statusCode: 200,
                  body: {
                    text: vi.fn().mockResolvedValue(JSON.stringify({
                      jsonrpc: '2.0',
                      id: 1,
                      result: 'success',
                    })),
                  },
                } as never),
              100
            )
          )
      );

      // Start request
      const requestPromise = client.sendRequest('test_method');

      // Close should wait
      const closePromise = client.close();

      await Promise.all([requestPromise, closePromise]);

      // Check that close was logged (it will be one of the info calls)
      const closeCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0] === 'GodotClient closed'
      );
      expect(closeCalls.length).toBeGreaterThan(0);
    });
  });

  describe('healthCheck', () => {
    it('should check bridge health', async () => {
      const requestMock = vi.mocked(undici.request);
      requestMock.mockResolvedValue({
        statusCode: 200,
        body: {
          json: vi.fn().mockResolvedValue({
            status: 'healthy',
            port: 7777,
            uptime: 1000,
          }),
        },
      } as never);

      const health = await client.healthCheck();
      expect(health.status).toBe('healthy');
      expect(health.lastCheck).toBeInstanceOf(Date);
    });

    it('should return unhealthy on error', async () => {
      const requestMock = vi.mocked(undici.request);
      requestMock.mockRejectedValue(new Error('Connection failed'));

      const health = await client.healthCheck();
      expect(health.status).toBe('unhealthy');
    });
  });

  describe('resetCircuit', () => {
    it('should manually reset circuit breaker', async () => {
      const requestMock = vi.mocked(undici.request);
      requestMock.mockRejectedValue(new Error('ECONNREFUSED'));

      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await client.sendRequest('test_method');
        } catch {
          // Expected
        }
      }

      expect(client.getCircuitState()).toBe('OPEN');

      client.resetCircuit();

      expect(client.getCircuitState()).toBe('CLOSED');
      const metrics = client.getCircuitMetrics();
      expect(metrics.currentFailureStreak).toBe(0);
    });
  });
});
