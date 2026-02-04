/**
 * HTTP client for communicating with the Godot bridge using undici
 */
import { Pool, request } from 'undici';
import { z } from 'zod';
import { logger, logError } from '../utils/logger.js';
import { generateCorrelationId } from '../utils/correlation-id.js';
import { TimeoutError, NetworkError, CircuitBreakerError, RpcError } from '../types/errors.js';
import type { JsonRpcRequest, BridgeHealth } from '../types/index.js';
import { EventEmitter } from 'node:events';

/**
 * Circuit breaker states
 */
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker events
 */
export enum CircuitBreakerEvent {
  STATE_CHANGE = 'circuit:state-change',
  OPENED = 'circuit:opened',
  HALF_OPENED = 'circuit:half-opened',
  CLOSED = 'circuit:closed',
  FAILURE = 'circuit:failure',
  SUCCESS = 'circuit:success',
}

/**
 * Retry strategy configuration
 */
interface RetryStrategy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  jitterFactor: number; // 0-1, amount of randomness to add
  retryableErrors: Set<string>;
}

/**
 * Connection pool configuration
 */
interface PoolConfig {
  connections: number;
  pipelining: number;
  keepAliveTimeout: number;
  keepAliveMaxTimeout: number;
}

/**
 * Circuit breaker metrics
 */
interface CircuitMetrics {
  totalOpens: number;
  totalHalfOpens: number;
  successfulRecoveries: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  currentFailureStreak: number;
  currentSuccessStreak: number;
  lastStateChange: Date;
}

/**
 * Pool health metrics
 */
interface PoolMetrics {
  activeConnections: number;
  queuedRequests: number;
  totalRequests: number;
  utilization: number; // 0-1
}

/**
 * JSON-RPC response schema validator
 */
const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional(),
    })
    .optional(),
});

/**
 * Configuration for the Godot bridge client
 */
interface GodotClientConfig {
  baseUrl: string;
  port: number;
  timeout: number;
  retryStrategy: RetryStrategy;
  poolConfig: PoolConfig;
  circuitBreaker: {
    failureThreshold: number; // Failures to open circuit
    successThreshold: number; // Successes in HALF_OPEN to close circuit
    timeout: number; // Time before OPEN → HALF_OPEN
  };
}

/**
 * Request options
 */
interface RequestOptions {
  correlationId?: string;
  timeout?: number;
  retryable?: boolean; // Override default retry behavior
}

/**
 * Client for communicating with the Godot bridge HTTP server
 */
export class GodotClient extends EventEmitter {
  private readonly config: GodotClientConfig;
  private readonly pool: Pool;
  private circuitState: CircuitState = CircuitState.CLOSED;
  private readonly metrics: CircuitMetrics;
  private requestIdCounter = 0;
  private readonly poolMetrics: PoolMetrics;
  private isClosing = false;

  constructor(config: Partial<GodotClientConfig> = {}) {
    super();

    this.config = {
      baseUrl: config.baseUrl || 'http://localhost',
      port: config.port || 7777,
      timeout: config.timeout || 5000,
      retryStrategy: {
        maxRetries: config.retryStrategy?.maxRetries ?? 3,
        baseDelay: config.retryStrategy?.baseDelay ?? 1000,
        maxDelay: config.retryStrategy?.maxDelay ?? 10000,
        jitterFactor: config.retryStrategy?.jitterFactor ?? 0.1,
        retryableErrors: config.retryStrategy?.retryableErrors ?? new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'NETWORK_ERROR']),
      },
      poolConfig: {
        connections: config.poolConfig?.connections ?? 10,
        pipelining: config.poolConfig?.pipelining ?? 1,
        keepAliveTimeout: config.poolConfig?.keepAliveTimeout ?? 30000,
        keepAliveMaxTimeout: config.poolConfig?.keepAliveMaxTimeout ?? 60000,
      },
      circuitBreaker: {
        failureThreshold: config.circuitBreaker?.failureThreshold ?? 5,
        successThreshold: config.circuitBreaker?.successThreshold ?? 3,
        timeout: config.circuitBreaker?.timeout ?? 30000,
      },
    };

    const url = `${this.config.baseUrl}:${this.config.port}`;
    this.pool = new Pool(url, {
      connections: this.config.poolConfig.connections,
      pipelining: this.config.poolConfig.pipelining,
      keepAliveTimeout: this.config.poolConfig.keepAliveTimeout,
      keepAliveMaxTimeout: this.config.poolConfig.keepAliveMaxTimeout,
    });

    this.metrics = {
      totalOpens: 0,
      totalHalfOpens: 0,
      successfulRecoveries: 0,
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      currentFailureStreak: 0,
      currentSuccessStreak: 0,
      lastStateChange: new Date(),
    };

    this.poolMetrics = {
      activeConnections: 0,
      queuedRequests: 0,
      totalRequests: 0,
      utilization: 0,
    };

    logger.info('GodotClient initialized', { url, config: this.getConfigSummary() });
  }

  /**
   * Get sanitized configuration summary for logging
   */
  private getConfigSummary(): Record<string, unknown> {
    return {
      timeout: this.config.timeout,
      maxRetries: this.config.retryStrategy.maxRetries,
      poolConnections: this.config.poolConfig.connections,
      circuitBreakerThreshold: this.config.circuitBreaker.failureThreshold,
    };
  }

  /**
   * Send a JSON-RPC request to the Godot bridge
   * @param method - RPC method name
   * @param params - Optional method parameters
   * @param options - Request options
   * @returns Promise resolving to the RPC response
   */
  async sendRequest<T = unknown>(
    method: string,
    params?: unknown,
    options: RequestOptions = {}
  ): Promise<T> {
    const correlationId = options.correlationId || generateCorrelationId();
    const startTime = Date.now();

    this.metrics.totalRequests++;
    this.poolMetrics.totalRequests++;

    logger.debug('Request initiated', {
      correlationId,
      method,
      params: this.sanitizeParams(params),
      circuitState: this.circuitState,
    });

    try {
      // Check circuit breaker state
      this.checkCircuitBreaker(correlationId);

      const rpcRequest: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: ++this.requestIdCounter,
        method,
        params,
      };

      // Execute request with retry logic
      const result = await this.executeWithRetry<T>(rpcRequest, correlationId, options);

      const duration = Date.now() - startTime;
      logger.info('Request completed', {
        correlationId,
        method,
        duration,
        circuitState: this.circuitState,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'Request failed',
        {
          correlationId,
          method,
          duration,
          circuitState: this.circuitState,
        }
      );
      throw error;
    }
  }

  /**
   * Check circuit breaker state and handle transitions
   * @throws {CircuitBreakerError} If circuit is OPEN and timeout not elapsed
   */
  private checkCircuitBreaker(correlationId?: string): void {
    if (this.circuitState === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - this.metrics.lastStateChange.getTime();
      if (timeSinceLastFailure > this.config.circuitBreaker.timeout) {
        this.transitionCircuit(CircuitState.HALF_OPEN);
      } else {
        const retryAfter = this.config.circuitBreaker.timeout - timeSinceLastFailure;
        throw new CircuitBreakerError(retryAfter, correlationId);
      }
    }
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(
    rpcRequest: JsonRpcRequest,
    correlationId: string,
    options: RequestOptions
  ): Promise<T> {
    const retryable = options.retryable ?? this.isIdempotent(rpcRequest.method);
    const maxRetries = retryable ? this.config.retryStrategy.maxRetries : 0;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.executeRequest<T>(rpcRequest, correlationId, options.timeout);
        this.onSuccess();
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry if circuit is open
        if (lastError instanceof CircuitBreakerError) {
          throw lastError;
        }

        // Check if error is retryable
        const isRetryable = this.isErrorRetryable(lastError);
        const isLastAttempt = attempt >= maxRetries;

        logger.warn('Request attempt failed', {
          correlationId,
          method: rpcRequest.method,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          error: lastError.message,
          retryable: isRetryable,
        });

        if (!isRetryable || isLastAttempt) {
          this.onFailure();
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateRetryDelay(attempt);
        await this.sleep(delay);
      }
    }

    this.onFailure();
    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * Execute a single HTTP request to the bridge
   */
  private async executeRequest<T>(
    rpcRequest: JsonRpcRequest,
    correlationId: string,
    timeoutOverride?: number
  ): Promise<T> {
    const timeout = timeoutOverride ?? this.config.timeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    this.poolMetrics.activeConnections++;
    this.updatePoolUtilization();

    try {
      const body = JSON.stringify(rpcRequest);

      const { statusCode, body: responseBody } = await request(
        `${this.config.baseUrl}:${this.config.port}/rpc`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(body)),
            'X-Correlation-ID': correlationId,
          },
          body,
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (statusCode !== 200) {
        throw new NetworkError(
          `HTTP error ${statusCode}`,
          correlationId,
          statusCode >= 500
        );
      }

      const responseText = await responseBody.text();
      const jsonResponse: unknown = JSON.parse(responseText);

      const validatedResponse = JsonRpcResponseSchema.parse(jsonResponse);

      if (validatedResponse.error) {
        throw new RpcError(
          validatedResponse.error.code,
          validatedResponse.error.message,
          correlationId,
          validatedResponse.error.data
        );
      }

      return validatedResponse.result as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if ((error as Error).name === 'AbortError') {
        throw new TimeoutError(`RPC request: ${rpcRequest.method}`, timeout, correlationId);
      }

      // Wrap network errors
      if (error instanceof Error) {
        const errorCode = (error as NodeJS.ErrnoException).code;
        const errorMessage = error.message;
        
        // Check error code or message for retryable errors
        if (errorCode && this.config.retryStrategy.retryableErrors.has(errorCode)) {
          throw new NetworkError(error.message, correlationId, true);
        }
        
        // Check message for known error patterns
        if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
          throw new NetworkError(error.message, correlationId, true);
        }
      }

      throw error;
    } finally {
      this.poolMetrics.activeConnections--;
      this.updatePoolUtilization();
    }
  }

  /**
   * Check the health of the Godot bridge
   * @returns Promise resolving to health status
   */
  async healthCheck(): Promise<BridgeHealth> {
    const correlationId = generateCorrelationId();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const { statusCode, body } = await request(
        `${this.config.baseUrl}:${this.config.port}/health`,
        {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'X-Correlation-ID': correlationId,
          },
        }
      );

      clearTimeout(timeoutId);

      if (statusCode !== 200) {
        return {
          status: 'unhealthy',
          port: this.config.port,
          uptime: 0,
          lastCheck: new Date(),
          error: `HTTP error ${statusCode}`,
        };
      }

      const health = (await body.json()) as BridgeHealth;
      return {
        ...health,
        lastCheck: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'Health check failed',
        { correlationId }
      );
      return {
        status: 'unhealthy',
        port: this.config.port,
        uptime: 0,
        lastCheck: new Date(),
        error: errorMessage,
      };
    }
  }

  /**
   * Get the bridge version information
   * @returns Promise resolving to version string
   */
  async getVersion(): Promise<string> {
    const correlationId = generateCorrelationId();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const { body } = await request(
        `${this.config.baseUrl}:${this.config.port}/version`,
        {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'X-Correlation-ID': correlationId,
          },
        }
      );

      clearTimeout(timeoutId);

      const data = (await body.json()) as { version: string };
      return data.version;
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'Version check failed',
        { correlationId }
      );
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Transition circuit breaker to new state
   */
  private transitionCircuit(newState: CircuitState): void {
    const oldState = this.circuitState;
    if (oldState === newState) {
      return;
    }

    this.circuitState = newState;
    this.metrics.lastStateChange = new Date();

    // Update metrics
    if (newState === CircuitState.OPEN) {
      this.metrics.totalOpens++;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.metrics.totalHalfOpens++;
    } else if (newState === CircuitState.CLOSED && oldState === CircuitState.HALF_OPEN) {
      this.metrics.successfulRecoveries++;
    }

    logger.info('Circuit breaker state transition', {
      oldState,
      newState,
      metrics: this.getCircuitMetrics(),
    });

    // Emit events
    this.emit(CircuitBreakerEvent.STATE_CHANGE, { oldState, newState, timestamp: new Date() });

    switch (newState) {
      case CircuitState.OPEN:
        this.emit(CircuitBreakerEvent.OPENED, { timestamp: new Date() });
        break;
      case CircuitState.HALF_OPEN:
        this.emit(CircuitBreakerEvent.HALF_OPENED, { timestamp: new Date() });
        break;
      case CircuitState.CLOSED:
        this.emit(CircuitBreakerEvent.CLOSED, { timestamp: new Date() });
        break;
    }
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    this.metrics.totalSuccesses++;
    this.metrics.currentSuccessStreak++;
    this.metrics.currentFailureStreak = 0;

    this.emit(CircuitBreakerEvent.SUCCESS, {
      successStreak: this.metrics.currentSuccessStreak,
      timestamp: new Date(),
    });

    if (this.circuitState === CircuitState.HALF_OPEN) {
      // Need consecutive successes to close circuit
      if (this.metrics.currentSuccessStreak >= this.config.circuitBreaker.successThreshold) {
        this.transitionCircuit(CircuitState.CLOSED);
      }
    } else if (this.circuitState === CircuitState.CLOSED) {
      // Reset success streak in closed state
      this.metrics.currentSuccessStreak = 0;
    }
  }

  /**
   * Handle failed request
   */
  private onFailure(): void {
    this.metrics.totalFailures++;
    this.metrics.currentFailureStreak++;
    this.metrics.currentSuccessStreak = 0;

    this.emit(CircuitBreakerEvent.FAILURE, {
      failureStreak: this.metrics.currentFailureStreak,
      timestamp: new Date(),
    });

    if (this.circuitState === CircuitState.HALF_OPEN) {
      // Single failure in HALF_OPEN reopens circuit
      this.transitionCircuit(CircuitState.OPEN);
    } else if (this.circuitState === CircuitState.CLOSED) {
      // Check if threshold reached to open circuit
      if (this.metrics.currentFailureStreak >= this.config.circuitBreaker.failureThreshold) {
        this.transitionCircuit(CircuitState.OPEN);
      }
    }
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.config.retryStrategy.baseDelay * Math.pow(2, attempt),
      this.config.retryStrategy.maxDelay
    );

    // Add jitter to prevent thundering herd
    const jitter = exponentialDelay * this.config.retryStrategy.jitterFactor * Math.random();

    return exponentialDelay + jitter;
  }

  /**
   * Check if request method is idempotent and safe to retry
   */
  private isIdempotent(method: string): boolean {
    // Most read operations are idempotent
    const idempotentMethods = new Set([
      'health',
      'version',
      'ping',
      'get_version',
      'list_projects',
      'analyze_project',
    ]);

    return idempotentMethods.has(method.toLowerCase());
  }

  /**
   * Check if error is retryable
   */
  private isErrorRetryable(error: Error): boolean {
    if (error instanceof NetworkError) {
      return error.retryable;
    }

    if (error instanceof TimeoutError) {
      return true;
    }

    if (error instanceof CircuitBreakerError) {
      return false;
    }

    const errorCode = (error as NodeJS.ErrnoException).code;
    if (errorCode) {
      return this.config.retryStrategy.retryableErrors.has(errorCode);
    }

    return false;
  }

  /**
   * Sanitize parameters for logging (remove sensitive data)
   */
  private sanitizeParams(params: unknown): unknown {
    if (!params || typeof params !== 'object') {
      return params;
    }

    const sensitivePatterns = ['password', 'token', 'secret', 'key', 'auth', 'credential'];
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitivePatterns.some(pattern => lowerKey.includes(pattern));
      
      if (isSensitive) {
        sanitized[key] = '***REDACTED***';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Update pool utilization metrics
   */
  private updatePoolUtilization(): void {
    this.poolMetrics.utilization =
      this.poolMetrics.activeConnections / this.config.poolConfig.connections;
  }

  /**
   * Sleep for a specified duration
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get circuit breaker metrics
   */
  getCircuitMetrics(): CircuitMetrics {
    return { ...this.metrics };
  }

  /**
   * Get pool health metrics
   */
  getPoolMetrics(): PoolMetrics {
    return { ...this.poolMetrics };
  }

  /**
   * Get current circuit state
   */
  getCircuitState(): CircuitState {
    return this.circuitState;
  }

  /**
   * Reset circuit breaker (for testing/emergency recovery)
   */
  resetCircuit(): void {
    logger.warn('Circuit breaker manually reset');
    this.circuitState = CircuitState.CLOSED;
    this.metrics.currentFailureStreak = 0;
    this.metrics.currentSuccessStreak = 0;
    this.metrics.lastStateChange = new Date();
  }

  /**
   * Close the client and cleanup resources
   */
  async close(): Promise<void> {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;

    logger.info('Closing GodotClient', {
      circuitState: this.circuitState,
      metrics: this.getCircuitMetrics(),
      poolMetrics: this.getPoolMetrics(),
    });

    try {
      // Wait for active connections to complete (with timeout)
      const closeTimeout = 5000;
      const startTime = Date.now();

      while (this.poolMetrics.activeConnections > 0 && Date.now() - startTime < closeTimeout) {
        await this.sleep(100);
      }

      if (this.poolMetrics.activeConnections > 0) {
        logger.warn('Forcing pool close with active connections', {
          activeConnections: this.poolMetrics.activeConnections,
        });
      }

      await this.pool.close();
      this.removeAllListeners();
      logger.info('GodotClient closed');
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'Error while closing GodotClient',
        {
          activeConnections: this.poolMetrics.activeConnections,
        }
      );
      // Still try to remove listeners even if pool close failed
      this.removeAllListeners();
      throw error;
    }
  }
}
