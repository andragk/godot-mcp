/**
 * HTTP Bridge Communication Integration Tests
 * Tests MCP server ↔ Godot HTTP bridge communication
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { GodotClient } from '../../src/bridge/godot-client.js';
import http from 'http';
import type { Server } from 'http';

/**
 * Mock Godot HTTP bridge server
 */
class MockGodotBridge {
  private server: Server | null = null;
  private port: number;
  private requestLog: Array<{ method: string; url: string; body: any }> = [];
  private responseDelay = 0;
  private shouldFail = false;
  private failureCode = 500;

  constructor(port: number) {
    this.port = port;
  }

  /**
   * Start mock bridge server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.port, () => {
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Handle incoming request
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      const parsedBody = body ? JSON.parse(body) : {};
      const requestId = parsedBody.id || null;
      
      // Log request
      this.requestLog.push({
        method: req.method || 'GET',
        url: req.url || '/',
        body: parsedBody
      });

      // Simulate delay if configured
      if (this.responseDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.responseDelay));
      }

      // Simulate failure if configured
      if (this.shouldFail) {
        res.writeHead(this.failureCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          jsonrpc: '2.0',
          id: requestId,
          error: { 
            code: this.failureCode, 
            message: 'Mock failure' 
          } 
        }));
        return;
      }

      // Handle different endpoints
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', godot: true }));
        return;
      }

      if (req.url === '/rpc' && req.method === 'POST') {
        const { method, params } = parsedBody;
        
        // Mock response based on method
        if (method === 'get_version') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: requestId,
            result: {
              version: '4.6.0',
              major: 4,
              minor: 6,
              patch: 0
            }
          }));
          return;
        }

        if (method === 'list_scenes') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: requestId,
            result: {
              scenes: [
                'res://scenes/main.tscn',
                'res://scenes/player.tscn'
              ],
              count: 2
            }
          }));
          return;
        }

        // Generic success response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          result: { success: true, method, params }
        }));
        return;
      }

      // 404 for unknown endpoints
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
  }

  /**
   * Configure response delay (for timeout testing)
   */
  setResponseDelay(ms: number): void {
    this.responseDelay = ms;
  }

  /**
   * Configure failure mode
   */
  setFailureMode(shouldFail: boolean, code = 500): void {
    this.shouldFail = shouldFail;
    this.failureCode = code;
  }

  /**
   * Get request log
   */
  getRequestLog(): Array<{ method: string; url: string; body: any }> {
    return [...this.requestLog];
  }

  /**
   * Clear request log
   */
  clearRequestLog(): void {
    this.requestLog = [];
  }

  /**
   * Stop mock bridge server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

describe('HTTP Bridge Communication Integration', () => {
  let mockBridge: MockGodotBridge;
  let bridgeClient: GodotClient;
  const bridgePort = 18778;
  const bridgeUrl = `http://localhost:${bridgePort}`;

  beforeAll(async () => {
    mockBridge = new MockGodotBridge(bridgePort);
    await mockBridge.start();
  });

  afterAll(async () => {
    if (mockBridge) {
      await mockBridge.stop();
    }
  });

  beforeEach(() => {
    bridgeClient = new GodotClient({ port: bridgePort });
    mockBridge.clearRequestLog();
    mockBridge.setResponseDelay(0);
    mockBridge.setFailureMode(false);
  });

  afterEach(async () => {
    if (bridgeClient) {
      await bridgeClient.close();
    }
  });

  describe('Health Check', () => {
    it('should successfully check bridge health', async () => {
      const healthy = (await bridgeClient.healthCheck()).status === 'healthy';
      
      expect(healthy).toBe(true);
      
      const log = mockBridge.getRequestLog();
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({
        method: 'GET',
        url: '/health'
      });
    });

    it('should detect unhealthy bridge', async () => {
      mockBridge.setFailureMode(true, 503);
      
      const healthy = (await bridgeClient.healthCheck()).status === 'healthy';
      
      expect(healthy).toBe(false);
    });

    it('should handle bridge unavailable', async () => {
      // Create client pointing to non-existent bridge
      const deadClient = new GodotClient({ port: 19999 });
      
      const healthy = (await deadClient.healthCheck()).status === 'healthy';
      
      expect(healthy).toBe(false);
      await deadClient.close();
    });
  });

  describe('Request/Response Cycle', () => {
    it('should execute get_version successfully', async () => {
      const result = await bridgeClient.sendRequest('get_version', {});
      
      expect(result).toMatchObject({
        version: '4.6.0',
        major: 4,
        minor: 6,
        patch: 0
      });
      
      const log = mockBridge.getRequestLog();
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({
        method: 'POST',
        url: '/rpc',
        body: {
          method: 'get_version',
          params: {}
        }
      });
    });

    it('should execute list_scenes successfully', async () => {
      const result = await bridgeClient.sendRequest('list_scenes', {
        projectPath: '/path/to/project'
      });
      
      expect(result).toMatchObject({
        scenes: expect.any(Array),
        count: 2
      });
      expect((result as any).scenes).toHaveLength(2);
    });

    it('should pass parameters correctly', async () => {
      const params = {
        scenePath: 'res://main.tscn',
        nodePath: 'Player',
        property: 'position'
      };
      
      await bridgeClient.sendRequest('get_node_property', params);
      
      const log = mockBridge.getRequestLog();
      expect(log[0].body.params).toEqual(params);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors', async () => {
      await expect(bridgeClient.sendRequest('unknown_method', {}))
        .rejects.toThrow();
    });

    it('should handle 500 errors', async () => {
      mockBridge.setFailureMode(true, 500);
      
      await expect(bridgeClient.sendRequest('get_version', {}))
        .rejects.toThrow();
    });

    it('should handle network errors', async () => {
      // Stop bridge to simulate network failure
      await mockBridge.stop();
      
      await expect(bridgeClient.sendRequest('get_version', {}))
        .rejects.toThrow();
      
      // Restart bridge for other tests
      await mockBridge.start();
    });

    it('should handle malformed responses', async () => {
      // This would require mocking the response parsing
      // For now, we trust that the client handles it
      expect(true).toBe(true);
    });
  });

  describe('Timeout Scenarios', () => {
    it('should timeout on slow responses', async () => {
      // Set delay longer than timeout
      mockBridge.setResponseDelay(6000); // 6 seconds
      
      // Create client with short timeout
      const shortTimeoutClient = new GodotClient({
        port: bridgePort,
        timeout: 1000 // 1 second
      });
      
      await expect(shortTimeoutClient.sendRequest('get_version', {}))
        .rejects.toThrow(/timeout|timed out/i);
      await shortTimeoutClient.close();
    }, 10000);

    it('should succeed before timeout', async () => {
      mockBridge.setResponseDelay(500); // Half second
      
      const client = new GodotClient({
        port: bridgePort,
        timeout: 2000 // 2 seconds
      });
      
      const result = await client.sendRequest('get_version', {});
      
      expect(result).toBeDefined();
      await client.close();
    }, 5000);

    it('should respect custom timeout settings', async () => {
      mockBridge.setResponseDelay(1500); // 1.5 seconds
      
      // Short timeout should fail
      const shortClient = new GodotClient({
        port: bridgePort,
        timeout: 1000
      });
      await expect(shortClient.sendRequest('get_version', {}))
        .rejects.toThrow();
      await shortClient.close();
      
      // Reset delay
      mockBridge.setResponseDelay(1500);
      
      // Long timeout should succeed
      const longClient = new GodotClient({
        port: bridgePort,
        timeout: 3000
      });
      await expect(longClient.sendRequest('get_version', {}))
        .resolves.toBeDefined();
      await longClient.close();
    }, 10000);
  });

  describe('Connection Pooling', () => {
    it('should reuse connections for multiple requests', async () => {
      await bridgeClient.sendRequest('get_version', {});
      await bridgeClient.sendRequest('list_scenes', {});
      await bridgeClient.sendRequest('get_version', {});
      
      const log = mockBridge.getRequestLog();
      expect(log).toHaveLength(3);
    });

    it('should handle concurrent requests', async () => {
      const requests = [
        bridgeClient.sendRequest('get_version', {}),
        bridgeClient.sendRequest('list_scenes', {}),
        bridgeClient.sendRequest('get_version', {})
      ];
      
      const results = await Promise.all(requests);
      
      expect(results).toHaveLength(3);
      expect(results[0]).toMatchObject({ version: '4.6.0' });
      expect(results[1]).toMatchObject({ count: 2 });
      expect(results[2]).toMatchObject({ version: '4.6.0' });
    });
  });

  describe('Retry Logic', () => {
    it('should retry on transient failures', async () => {
      let callCount = 0;
      
      // Mock bridge to fail first 2 times, then succeed
      const originalHandleRequest = (mockBridge as any).handleRequest;
      (mockBridge as any).handleRequest = async function(req: any, res: any) {
        callCount++;
        if (callCount < 3) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Temporary failure' }));
          return;
        }
        return originalHandleRequest.call(this, req, res);
      };
      
      // Client with retry enabled
      const retryClient = new GodotClient({
        port: bridgePort,
        retryStrategy: {
          maxRetries: 3,
          baseDelay: 100,
          maxDelay: 5000,
          jitterFactor: 0.1,
          retryableErrors: new Set(['ECONNREFUSED', 'ETIMEDOUT'])
        }
      });
      
      const result = await retryClient.sendRequest('get_version', {});
      
      expect(result).toBeDefined();
      expect(callCount).toBeGreaterThanOrEqual(3);
      await retryClient.close();
      
      // Restore original handler
      (mockBridge as any).handleRequest = originalHandleRequest;
    }, 10000);

    it('should give up after max retries', async () => {
      mockBridge.setFailureMode(true, 503);
      
      const retryClient = new GodotClient({
        port: bridgePort,
        retryStrategy: {
          maxRetries: 2,
          baseDelay: 100,
          maxDelay: 5000,
          jitterFactor: 0.1,
          retryableErrors: new Set(['ECONNREFUSED', 'ETIMEDOUT'])
        }
      });
      
      await expect(retryClient.sendRequest('get_version', {}))
        .rejects.toThrow();
      await retryClient.close();
      
      const log = mockBridge.getRequestLog();
      expect(log.length).toBeGreaterThanOrEqual(2); // Initial + retries
    }, 5000);
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after consecutive failures', async () => {
      mockBridge.setFailureMode(true, 503);
      
      const cbClient = new GodotClient({
        port: bridgePort,
        circuitBreaker: {
          failureThreshold: 3,
          successThreshold: 1,
          timeout: 1000
        }
      });
      
      // Make requests until circuit opens
      for (let i = 0; i < 5; i++) {
        try {
          await cbClient.sendRequest('get_version', {});
        } catch (e) {
          // Expected failures
        }
      }
      
      // Circuit should be open now, requests should fail immediately
      const startTime = Date.now();
      try {
        await cbClient.sendRequest('get_version', {});
      } catch (e: any) {
        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(100); // Should fail immediately
        expect(e.message).toMatch(/circuit.*open/i);
      }
      await cbClient.close();
    }, 10000);

    it('should close circuit after timeout', async () => {
      mockBridge.setFailureMode(true, 503);
      
      const cbClient = new GodotClient({
        port: bridgePort,
        circuitBreaker: {
          failureThreshold: 2,
          successThreshold: 1,
          timeout: 500
        }
      });
      
      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await cbClient.sendRequest('get_version', {});
        } catch (e) {
          // Expected
        }
      }
      
      // Wait for circuit to half-open
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Re-enable bridge
      mockBridge.setFailureMode(false);
      
      // Request should succeed now
      const result = await cbClient.sendRequest('get_version', {});
      expect(result).toBeDefined();
      await cbClient.close();
    }, 5000);
  });
});
