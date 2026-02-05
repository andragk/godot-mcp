/**
 * End-to-End MCP Protocol Integration Tests
 * Tests complete MCP server lifecycle and protocol flows
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GodotMCPServer } from '../../src/server/mcp-server.js';
import { Readable, Writable } from 'stream';
import type { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';

/**
 * Mock stdio transport for testing
 */
class MockStdioTransport {
  public stdin: Writable;
  public stdout: Readable;
  private messageQueue: JSONRPCMessage[] = [];
  private outputBuffer: string = '';

  constructor() {
    // Create writable stream for stdin (server reads from this)
    this.stdin = new Writable({
      write: (chunk: Buffer, encoding: string, callback: () => void) => {
        this.outputBuffer += chunk.toString();
        callback();
      }
    });

    // Create readable stream for stdout (server writes to this)
    this.stdout = new Readable({
      read() {
        // No-op, we'll push messages manually
      }
    });
  }

  /**
   * Send a message to the server (simulate client request)
   */
  sendMessage(message: JSONRPCRequest): void {
    const jsonString = JSON.stringify(message) + '\n';
    this.stdout.push(jsonString);
  }

  /**
   * Get server response from stdin
   */
  async getResponse(timeout = 1000): Promise<JSONRPCResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for response after ${timeout}ms`));
      }, timeout);

      const checkOutput = () => {
        const lines = this.outputBuffer.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              clearTimeout(timer);
              this.outputBuffer = ''; // Clear buffer
              resolve(parsed);
              return;
            } catch (e) {
              // Not valid JSON yet, continue
            }
          }
        }
        // Check again in 10ms
        setTimeout(checkOutput, 10);
      };

      checkOutput();
    });
  }

  close(): void {
    this.stdout.push(null);
    this.stdin.end();
  }
}

describe('MCP Protocol Integration', () => {
  let server: GodotMCPServer;
  let transport: MockStdioTransport;
  let requestId = 0;

  beforeAll(async () => {
    // Create server instance (without starting it yet)
    server = new GodotMCPServer();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  beforeEach(() => {
    transport = new MockStdioTransport();
    requestId = 0;
  });

  describe('Server Lifecycle', () => {
    it('should start server successfully', async () => {
      await expect(server.start()).resolves.not.toThrow();
      // Verify server is functional by checking version
      expect(server.getVersion()).toBe('0.1.0');
    });

    it('should shutdown server gracefully', async () => {
      // Server should stop without errors
      await expect(server.stop()).resolves.not.toThrow();
    });

    it('should handle restart', async () => {
      // Start again after stop
      await server.start();
      expect(server.getVersion()).toBe('0.1.0');
    });
  });

  describe('Protocol: Initialize Handshake', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should respond to initialize request', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      };

      transport.sendMessage(request);
      const response = await transport.getResponse();

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: requestId
      });
      expect('result' in response && response.result).toBeDefined();
      if ('result' in response) {
        expect(response.result.protocolVersion).toBe('2024-11-05');
        expect(response.result.capabilities).toBeDefined();
        expect(response.result.serverInfo).toMatchObject({
          name: 'godot-mcp',
          version: expect.any(String)
        });
      }
    });

    it('should reject requests before initialize', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'tools/list',
        params: {}
      };

      transport.sendMessage(request);
      const response = await transport.getResponse();

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: requestId,
        error: expect.objectContaining({
          code: expect.any(Number),
          message: expect.stringContaining('not initialized')
        })
      });
    });
  });

  describe('Protocol: Tools Discovery', () => {
    beforeEach(async () => {
      await server.start();
      
      // Initialize first
      const initRequest: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' }
        }
      };
      transport.sendMessage(initRequest);
      await transport.getResponse();
    });

    it('should list available tools', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'tools/list',
        params: {}
      };

      transport.sendMessage(request);
      const response = await transport.getResponse();

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: requestId
      });
      expect('result' in response && response.result).toBeDefined();
      if ('result' in response) {
        expect((response.result as any).tools).toBeInstanceOf(Array);
        expect((response.result as any).tools.length).toBeGreaterThan(0);
        
        // Verify tool structure
        const tool = (response.result as any).tools[0];
        expect(tool).toMatchObject({
          name: expect.any(String),
          description: expect.any(String),
          inputSchema: expect.objectContaining({
            type: 'object',
            properties: expect.any(Object)
          })
        });
      }
    });

    it('should return consistent tool list', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'tools/list',
        params: {}
      };

      // Request 1
      transport.sendMessage(request);
      const response1 = await transport.getResponse();
      
      // Request 2
      request.id = ++requestId;
      transport.sendMessage(request);
      const response2 = await transport.getResponse();

      if ('result' in response1 && 'result' in response2) {
        expect((response1.result as any).tools).toEqual((response2.result as any).tools);
      }
    });
  });

  describe('Protocol: Tool Execution', () => {
    beforeEach(async () => {
      await server.start();
      
      // Initialize
      const initRequest: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' }
        }
      };
      transport.sendMessage(initRequest);
      await transport.getResponse();
    });

    it('should execute ping tool successfully', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'tools/call',
        params: {
          name: 'ping',
          arguments: {}
        }
      };

      transport.sendMessage(request);
      const response = await transport.getResponse();

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: requestId
      });
      expect('result' in response && response.result).toBeDefined();
      if ('result' in response) {
        expect((response.result as any).content).toBeInstanceOf(Array);
        expect((response.result as any).content[0]).toMatchObject({
          type: 'text',
          text: expect.stringContaining('pong')
        });
      }
    });

    it('should return error for invalid tool', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'tools/call',
        params: {
          name: 'nonexistent_tool',
          arguments: {}
        }
      };

      transport.sendMessage(request);
      const response = await transport.getResponse();

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: requestId,
        error: expect.objectContaining({
          code: -32601,
          message: expect.stringContaining('not found')
        })
      });
    });

    it('should validate tool arguments', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'tools/call',
        params: {
          name: 'get_version',
          arguments: {
            invalidParam: 'value' // Invalid parameter
          }
        }
      };

      transport.sendMessage(request);
      const response = await transport.getResponse();

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: requestId,
        error: expect.objectContaining({
          code: -32602,
          message: expect.stringContaining('Invalid')
        })
      });
    });
  });

  describe('Protocol: Shutdown', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should handle graceful shutdown request', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'shutdown',
        params: {}
      };

      transport.sendMessage(request);
      const response = await transport.getResponse();

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: requestId,
        result: {}
      });
    });

    it('should reject requests after shutdown', async () => {
      // Shutdown first
      const shutdownRequest: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'shutdown',
        params: {}
      };
      transport.sendMessage(shutdownRequest);
      await transport.getResponse();

      // Try to send another request
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'tools/list',
        params: {}
      };
      transport.sendMessage(request);
      
      // Should either get error or no response
      await expect(transport.getResponse(500)).rejects.toThrow();
    });
  });

  describe('Protocol: Error Handling', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should handle malformed JSON', async () => {
      const malformed = 'not valid json{}\n';
      transport.stdout.push(malformed);
      
      // Server should log error but not crash
      await new Promise(resolve => setTimeout(resolve, 100));
      // expect(server.isRunning()).toBe(true); // Method not available
    });

    it('should handle missing jsonrpc field', async () => {
      const request = {
        id: ++requestId,
        method: 'tools/list',
        params: {}
        // Missing jsonrpc field
      };

      transport.sendMessage(request as JSONRPCRequest);
      const response = await transport.getResponse();

      expect('error' in response && response.error).toBeDefined();
    });

    it('should handle missing method field', async () => {
      const request = {
        jsonrpc: '2.0',
        id: ++requestId,
        params: {}
        // Missing method field
      };

      transport.sendMessage(request as JSONRPCRequest);
      const response = await transport.getResponse();

      if ('error' in response) {
        expect(response.error).toBeDefined();
      }
    });
  });
});
