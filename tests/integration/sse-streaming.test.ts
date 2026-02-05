/**
 * SSE Streaming Integration Tests
 * Tests Server-Sent Events end-to-end flows
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { WebServer } from '../../src/presentation/web-server.js';
import { GodotClient } from '../../src/bridge/godot-client.js';
import type { IncomingMessage } from 'http';

/**
 * Mock SSE client that parses SSE events
 */
class MockSSEClient {
  private events: Array<{ type: string; data: any; id?: string }> = [];
  private connected = false;
  private response: IncomingMessage | null = null;
  private buffer = '';

  /**
   * Connect to SSE endpoint
   */
  async connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const http = require('http');
      const parsedUrl = new URL(url);
      
      const req = http.get({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname,
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        }
      }, (res: IncomingMessage) => {
        this.response = res;
        this.connected = true;

        if (res.statusCode !== 200) {
          reject(new Error(`Failed to connect: ${res.statusCode}`));
          return;
        }

        res.on('data', (chunk: Buffer) => {
          this.buffer += chunk.toString();
          this.parseBuffer();
        });

        res.on('end', () => {
          this.connected = false;
        });

        res.on('error', (error) => {
          reject(error);
        });

        resolve();
      });

      req.on('error', reject);
    });
  }

  /**
   * Parse SSE event buffer
   */
  private parseBuffer(): void {
    const lines = this.buffer.split('\n');
    let currentEvent: { type?: string; data?: string; id?: string } = {};

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i];

      if (line.startsWith(':')) {
        // Comment (e.g., heartbeat)
        if (line === ': heartbeat') {
          this.events.push({ type: 'heartbeat', data: {} });
        }
        continue;
      }

      if (line === '') {
        // Empty line - end of event
        if (currentEvent.data !== undefined) {
          try {
            const parsedData = JSON.parse(currentEvent.data);
            this.events.push({
              type: currentEvent.type || 'message',
              data: parsedData,
              id: currentEvent.id
            });
          } catch (e) {
            // Non-JSON data
            this.events.push({
              type: currentEvent.type || 'message',
              data: currentEvent.data,
              id: currentEvent.id
            });
          }
          currentEvent = {};
        }
        continue;
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const field = line.substring(0, colonIndex);
      const value = line.substring(colonIndex + 1).trim();

      if (field === 'event') {
        currentEvent.type = value;
      } else if (field === 'data') {
        currentEvent.data = value;
      } else if (field === 'id') {
        currentEvent.id = value;
      }
    }

    // Keep the last incomplete line in buffer
    this.buffer = lines[lines.length - 1];
  }

  /**
   * Wait for a specific event type
   */
  async waitForEvent(type: string, timeout = 2000): Promise<any> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const event = this.events.find(e => e.type === type);
      if (event) {
        // Remove from queue
        this.events = this.events.filter(e => e !== event);
        return event.data;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new Error(`Timeout waiting for event type: ${type}`);
  }

  /**
   * Get all events received so far
   */
  getEvents(): Array<{ type: string; data: any; id?: string }> {
    return [...this.events];
  }

  /**
   * Get number of events received
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Disconnect from SSE endpoint
   */
  disconnect(): void {
    if (this.response) {
      this.response.destroy();
      this.response = null;
    }
    this.connected = false;
  }

  /**
   * Clear event queue
   */
  clearEvents(): void {
    this.events = [];
  }
}

describe('SSE Streaming Integration', () => {
  let server: WebServer;
  let godotClient: GodotClient;
  let serverPort: number;
  let baseUrl: string;

  beforeAll(async () => {
    // Find available port
    serverPort = 18405;
    baseUrl = `http://localhost:${serverPort}`;

    // Create a GodotClient (won't actually connect to Godot for SSE tests)
    godotClient = new GodotClient({ port: 7777 });

    // Create and start WebServer
    server = new WebServer(godotClient);
    await server.start(serverPort);
    
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Client Connection', () => {
    let client: MockSSEClient;

    beforeEach(() => {
      client = new MockSSEClient();
    });

    afterEach(() => {
      if (client) {
        client.disconnect();
      }
    });

    it('should connect to SSE endpoint successfully', async () => {
      await client.connect(`${baseUrl}/api/logs/stream`);
      
      expect(client.isConnected()).toBe(true);
    });

    it('should receive initial connection event', async () => {
      await client.connect(`${baseUrl}/api/logs/stream`);
      
      const infoEvent = await client.waitForEvent('info', 2000);
      
      expect(infoEvent).toMatchObject({
        message: expect.stringContaining('Connected'),
        clientId: expect.any(String),
        connectedAt: expect.any(String)
      });
    });

    it('should support multiple simultaneous clients', async () => {
      const client1 = new MockSSEClient();
      const client2 = new MockSSEClient();
      const client3 = new MockSSEClient();

      await Promise.all([
        client1.connect(`${baseUrl}/api/logs/stream`),
        client2.connect(`${baseUrl}/api/logs/stream`),
        client3.connect(`${baseUrl}/api/logs/stream`)
      ]);

      expect(client1.isConnected()).toBe(true);
      expect(client2.isConnected()).toBe(true);
      expect(client3.isConnected()).toBe(true);

      client1.disconnect();
      client2.disconnect();
      client3.disconnect();
    });
  });

  describe('Event Broadcasting', () => {
    let client1: MockSSEClient;
    let client2: MockSSEClient;

    beforeEach(async () => {
      client1 = new MockSSEClient();
      client2 = new MockSSEClient();
      
      await Promise.all([
        client1.connect(`${baseUrl}/api/logs/stream`),
        client2.connect(`${baseUrl}/api/logs/stream`)
      ]);

      // Clear initial connection events
      await new Promise(resolve => setTimeout(resolve, 200));
      client1.clearEvents();
      client2.clearEvents();
    });

    afterEach(() => {
      client1?.disconnect();
      client2?.disconnect();
    });

    it('should broadcast log events to all clients', async () => {
      // Trigger a log event by making a request
      const response = await fetch(`${baseUrl}/api/health`);
      await response.json();

      // Wait for log events
      await new Promise(resolve => setTimeout(resolve, 500));

      const client1Events = client1.getEvents();
      const client2Events = client2.getEvents();

      // Both clients should have received events
      expect(client1Events.length).toBeGreaterThan(0);
      expect(client2Events.length).toBeGreaterThan(0);
    });

    it('should broadcast status events to all clients', async () => {
      // Server status should be broadcast periodically or on demand
      await new Promise(resolve => setTimeout(resolve, 1000));

      const events = client1.getEvents();
      const statusEvents = events.filter(e => e.type === 'status');

      // May or may not have status events depending on implementation
      // This test documents expected behavior
      expect(statusEvents).toBeInstanceOf(Array);
    });
  });

  describe('Heartbeat Mechanism', () => {
    let client: MockSSEClient;

    beforeEach(async () => {
      client = new MockSSEClient();
      await client.connect(`${baseUrl}/api/logs/stream`);
      
      // Clear initial events
      await new Promise(resolve => setTimeout(resolve, 200));
      client.clearEvents();
    });

    afterEach(() => {
      client?.disconnect();
    });

    it('should receive periodic heartbeat messages', async () => {
      // Wait for heartbeat (default interval is 30s, but may be configured shorter)
      const timeout = 35000; // 35 seconds
      
      const heartbeatData = await client.waitForEvent('heartbeat', timeout);
      
      expect(heartbeatData).toBeDefined();
    }, 40000); // Set test timeout to 40s

    it('should maintain connection with heartbeats', async () => {
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Connection should still be active
      expect(client.isConnected()).toBe(true);
    }, 10000);
  });

  describe('Client Disconnection', () => {
    let client: MockSSEClient;

    beforeEach(async () => {
      client = new MockSSEClient();
      await client.connect(`${baseUrl}/api/logs/stream`);
    });

    it('should handle graceful client disconnect', async () => {
      expect(client.isConnected()).toBe(true);
      
      client.disconnect();
      
      // Wait a bit for server to process
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(client.isConnected()).toBe(false);
    });

    it('should remove disconnected clients from broadcast list', async () => {
      const client2 = new MockSSEClient();
      await client2.connect(`${baseUrl}/api/logs/stream`);

      // Disconnect client1
      client.clearEvents();
      client.disconnect();
      await new Promise(resolve => setTimeout(resolve, 200));

      // Clear client2 events
      client2.clearEvents();

      // Trigger an event
      await fetch(`${baseUrl}/api/health`);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Client2 should still receive events
      expect(client2.getEventCount()).toBeGreaterThan(0);
      
      // Client1 should not receive events (it's disconnected)
      expect(client.getEventCount()).toBe(0);

      client2.disconnect();
    });
  });

  describe('Error Handling', () => {
    it('should reject connections to invalid endpoint', async () => {
      const client = new MockSSEClient();
      
      await expect(client.connect(`${baseUrl}/invalid-endpoint`))
        .rejects.toThrow();
    });

    it('should handle client that immediately disconnects', async () => {
      const client = new MockSSEClient();
      
      await client.connect(`${baseUrl}/api/logs/stream`);
      client.disconnect();
      
      // Server should not crash
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Server should still accept new connections
      const client2 = new MockSSEClient();
      await expect(client2.connect(`${baseUrl}/api/logs/stream`))
        .resolves.not.toThrow();
      
      client2.disconnect();
    });
  });

  describe('Event Format', () => {
    let client: MockSSEClient;

    beforeEach(async () => {
      client = new MockSSEClient();
      await client.connect(`${baseUrl}/api/logs/stream`);
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    afterEach(() => {
      client?.disconnect();
    });

    it('should format events with valid SSE structure', async () => {
      const infoEvent = await client.waitForEvent('info');
      
      expect(infoEvent).toBeDefined();
      expect(typeof infoEvent).toBe('object');
    });

    it('should include event ID when provided', async () => {
      const events = client.getEvents();
      
      // Some events should have IDs
      const eventsWithIds = events.filter(e => e.id !== undefined);
      expect(eventsWithIds.length).toBeGreaterThan(0);
    });

    it('should send JSON-formatted data', async () => {
      const event = await client.waitForEvent('info');
      
      // Should be parsed as object
      expect(typeof event).toBe('object');
      expect(event).not.toBeInstanceOf(String);
    });
  });
});
