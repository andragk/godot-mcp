/**
 * HTTP client for communicating with the Godot bridge using undici
 */
import { Pool, request } from 'undici';
import { z } from 'zod';
import { logger, logError } from '../utils/logger.js';
import type { JsonRpcRequest, BridgeHealth } from '../types/index.js';

/**
 * Circuit breaker states
 */
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
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
  maxRetries: number;
  retryDelay: number;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
}

/**
 * Client for communicating with the Godot bridge HTTP server
 */
export class GodotClient {
  private readonly config: GodotClientConfig;
  private readonly pool: Pool;
  private circuitState: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private requestIdCounter = 0;

  constructor(config: Partial<GodotClientConfig> = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost',
      port: config.port || 7777,
      timeout: config.timeout || 5000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: config.circuitBreakerTimeout || 30000,
    };

    const url = `${this.config.baseUrl}:${this.config.port}`;
    this.pool = new Pool(url, {
      connections: 10,
      pipelining: 1,
    });

    logger.info('GodotClient initialized', { url });
  }

  /**
   * Send a JSON-RPC request to the Godot bridge
   * @param method - RPC method name
   * @param params - Optional method parameters
   * @returns Promise resolving to the RPC response
   */
  async sendRequest<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.circuitState === CircuitState.OPEN) {
      const now = Date.now();
      if (now - this.lastFailureTime > this.config.circuitBreakerTimeout) {
        logger.info('Circuit breaker transitioning to HALF_OPEN');
        this.circuitState = CircuitState.HALF_OPEN;
      } else {
        throw new Error('Circuit breaker is OPEN - bridge unavailable');
      }
    }

    const rpcRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: ++this.requestIdCounter,
      method,
      params,
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.executeRequest<T>(rpcRequest);
        this.onSuccess();
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`Request attempt ${attempt + 1} failed`, {
          method,
          error: lastError.message,
        });

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    this.onFailure();
    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * Execute a single HTTP request to the bridge
   * @param rpcRequest - JSON-RPC request object
   * @returns Promise resolving to the response result
   */
  private async executeRequest<T>(rpcRequest: JsonRpcRequest): Promise<T> {
    const body = JSON.stringify(rpcRequest);

    const { statusCode, body: responseBody } = await request(
      `${this.config.baseUrl}:${this.config.port}/rpc`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(body)),
        },
        body,
        bodyTimeout: this.config.timeout,
        headersTimeout: this.config.timeout,
      }
    );

    if (statusCode !== 200) {
      throw new Error(`HTTP error ${statusCode}`);
    }

    const responseText = await responseBody.text();
    const jsonResponse: unknown = JSON.parse(responseText);

    const validatedResponse = JsonRpcResponseSchema.parse(jsonResponse);

    if (validatedResponse.error) {
      throw new Error(
        `RPC error ${validatedResponse.error.code}: ${validatedResponse.error.message}`
      );
    }

    return validatedResponse.result as T;
  }

  /**
   * Check the health of the Godot bridge
   * @returns Promise resolving to health status
   */
  async healthCheck(): Promise<BridgeHealth> {
    try {
      const { statusCode, body } = await request(
        `${this.config.baseUrl}:${this.config.port}/health`,
        {
          method: 'GET',
          headersTimeout: this.config.timeout,
        }
      );

      if (statusCode !== 200) {
        return {
          status: 'unhealthy',
          port: this.config.port,
          uptime: 0,
          lastCheck: new Date(),
        };
      }

      const health = (await body.json()) as BridgeHealth;
      return {
        ...health,
        lastCheck: new Date(),
      };
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'Health check failed');
      return {
        status: 'unhealthy',
        port: this.config.port,
        uptime: 0,
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Get the bridge version information
   * @returns Promise resolving to version string
   */
  async getVersion(): Promise<string> {
    try {
      const { body } = await request(
        `${this.config.baseUrl}:${this.config.port}/version`,
        {
          method: 'GET',
          headersTimeout: this.config.timeout,
        }
      );

      const data = (await body.json()) as { version: string };
      return data.version;
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'Version check failed');
      return 'unknown';
    }
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    if (this.circuitState === CircuitState.HALF_OPEN) {
      logger.info('Circuit breaker transitioning to CLOSED');
      this.circuitState = CircuitState.CLOSED;
    }
    this.failureCount = 0;
  }

  /**
   * Handle failed request
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.circuitBreakerThreshold) {
      logger.error('Circuit breaker transitioning to OPEN', {
        failureCount: this.failureCount,
      });
      this.circuitState = CircuitState.OPEN;
    }
  }

  /**
   * Sleep for a specified duration
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Close the client and cleanup resources
   */
  async close(): Promise<void> {
    await this.pool.close();
    logger.info('GodotClient closed');
  }
}
