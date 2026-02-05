/**
 * SSE Message Delivery Performance Benchmarks
 * Target: <5ms latency from broadcast to client receipt
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SSEClientManager } from '../../src/presentation/sse-client-manager.js';
import { SSEHeartbeat } from '../../src/presentation/sse-heartbeat.js';
import { EventEmitter } from 'events';
import { Response } from 'express';
import { calculateStats, formatStats } from './utils.js';

describe('SSE Message Delivery Performance', () => {
  let clientManager: SSEClientManager;
  let heartbeat: SSEHeartbeat;
  const TARGET_LATENCY = 5; // milliseconds
  const SAMPLES = 100;

  // Mock Response class for testing
  class MockResponse extends EventEmitter {
    public writtenData: string[] = [];
    public statusCode = 200;
    public headersSent = false;

    write(data: string): boolean {
      this.writtenData.push(data);
      this.emit('data', data);
      return true;
    }

    setHeader(_name: string, _value: string | number): void {
      // Mock implementation
    }

    on(event: string, listener: (...args: any[]) => void): this {
      return super.on(event, listener);
    }

    once(event: string, listener: (...args: any[]) => void): this {
      return super.once(event, listener);
    }

    emit(event: string, ...args: any[]): boolean {
      return super.emit(event, ...args);
    }
  }

  beforeAll(() => {
    clientManager = new SSEClientManager();
    heartbeat = new SSEHeartbeat({ interval: 30000 });
  });

  afterAll(() => {
    if (heartbeat) {
      heartbeat.stop();
    }
  });

  it(`should deliver messages in <${TARGET_LATENCY}ms (p99)`, async () => {
    console.log(`\nMeasuring SSE message delivery latency (${SAMPLES} samples)...`);

    const latencies: number[] = [];
    const mockRes = new MockResponse() as unknown as Response;
    const clientId = 'bench-client-1';

    // Add client to manager
    clientManager.addClient(clientId, mockRes);

    // Measure broadcast latency
    for (let i = 0; i < SAMPLES; i++) {
      const receivePromise = new Promise<number>((resolve) => {
        const startTime = performance.now();
        mockRes.once('data', () => {
          const latency = performance.now() - startTime;
          resolve(latency);
        });
      });

      // Broadcast message
      clientManager.broadcast({ type: 'info', data: { index: i, timestamp: Date.now() } });

      const latency = await receivePromise;
      latencies.push(latency);
    }

    const stats = calculateStats(latencies);
    console.log('SSE Delivery Results:');
    console.log(formatStats(stats));

    // Cleanup
    clientManager.removeClient(clientId);

    // Assertions
    expect(stats.p99).toBeLessThan(TARGET_LATENCY);
    expect(stats.mean).toBeLessThan(TARGET_LATENCY * 0.6);
  });

  it('should handle multiple concurrent clients efficiently', async () => {
    const clientCount = 50;
    console.log(`\nBroadcasting to ${clientCount} concurrent clients...`);

    const mockClients: Array<{ id: string; res: MockResponse }> = [];

    // Create mock clients
    for (let i = 0; i < clientCount; i++) {
      const mockRes = new MockResponse();
      const clientId = `bench-client-${i}`;
      clientManager.addClient(clientId, mockRes as unknown as Response);
      mockClients.push({ id: clientId, res: mockRes });
    }

    const latencies: number[][] = [];
    for (let i = 0; i < clientCount; i++) {
      latencies.push([]);
    }

    // Measure broadcast to all clients
    for (let msgIndex = 0; msgIndex < 20; msgIndex++) {
      const broadcastStart = performance.now();
      const receivePromises = mockClients.map((client, i) => {
        return new Promise<number>((resolve) => {
          const startTime = performance.now();
          client.res.once('data', () => {
            const latency = performance.now() - startTime;
            latencies[i].push(latency);
            resolve(latency);
          });
        });
      });

      // Broadcast to all clients
      clientManager.broadcast({ type: 'info', data: { index: msgIndex } });

      await Promise.all(receivePromises);
      const broadcastDuration = performance.now() - broadcastStart;

      // Broadcast to all clients should be fast
      expect(broadcastDuration).toBeLessThan(TARGET_LATENCY * clientCount * 0.5);
    }

    // Calculate per-client statistics
    const allLatencies = latencies.flat();
    const stats = calculateStats(allLatencies);

    console.log(`Client count: ${clientCount}`);
    console.log(`Total messages: ${allLatencies.length}`);
    console.log(formatStats(stats));

    // Cleanup
    mockClients.forEach(client => {
      clientManager.removeClient(client.id);
    });

    // Performance should still be good with many clients
    expect(stats.p99).toBeLessThan(TARGET_LATENCY * 2);
  });

  it('should maintain performance with rapid broadcasts', async () => {
    const rapidBroadcasts = 100;
    console.log(`\nSending ${rapidBroadcasts} rapid broadcasts...`);

    const mockRes = new MockResponse() as unknown as Response;
    const clientId = 'bench-client-rapid';
    clientManager.addClient(clientId, mockRes);

    let receivedCount = 0;
    mockRes.on('data', () => {
      receivedCount++;
    });

    const start = performance.now();

    for (let i = 0; i < rapidBroadcasts; i++) {
      clientManager.broadcast({ type: 'info', data: { index: i } });
    }

    // Wait for all messages to be received
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (receivedCount >= rapidBroadcasts) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 10);
    });

    const totalDuration = performance.now() - start;
    const avgDuration = totalDuration / rapidBroadcasts;

    console.log(`Total time: ${totalDuration.toFixed(2)}ms`);
    console.log(`Average per broadcast: ${avgDuration.toFixed(2)}ms`);
    console.log(`Throughput: ${(rapidBroadcasts / (totalDuration / 1000)).toFixed(2)} msgs/sec`);

    clientManager.removeClient(clientId);

    expect(receivedCount).toBe(rapidBroadcasts);
    expect(avgDuration).toBeLessThan(TARGET_LATENCY);
  });

  it('should efficiently manage client connections', () => {
    console.log('\nBenchmarking client connection management...');

    const operations = 1000;
    const mockClients: string[] = [];

    // Measure add operations
    const addStart = performance.now();
    for (let i = 0; i < operations; i++) {
      const mockRes = new MockResponse() as unknown as Response;
      const clientId = `bench-client-${i}`;
      clientManager.addClient(clientId, mockRes);
      mockClients.push(clientId);
    }
    const addDuration = performance.now() - addStart;
    const addAvg = addDuration / operations;

    console.log(`Add ${operations} clients: ${addDuration.toFixed(2)}ms (${addAvg.toFixed(3)}ms avg)`);

    // Measure broadcast with many clients
    const broadcastStart = performance.now();
    clientManager.broadcast({ type: 'info', data: { data: 'benchmark' } });
    const broadcastDuration = performance.now() - broadcastStart;

    console.log(`Broadcast to ${operations} clients: ${broadcastDuration.toFixed(2)}ms`);

    // Measure remove operations
    const removeStart = performance.now();
    mockClients.forEach(clientId => {
      clientManager.removeClient(clientId);
    });
    const removeDuration = performance.now() - removeStart;
    const removeAvg = removeDuration / operations;

    console.log(`Remove ${operations} clients: ${removeDuration.toFixed(2)}ms (${removeAvg.toFixed(3)}ms avg)`);

    // Operations should be efficient
    expect(addAvg).toBeLessThan(1); // <1ms per add
    expect(removeAvg).toBeLessThan(1); // <1ms per remove
    expect(broadcastDuration).toBeLessThan(operations * 0.1); // <0.1ms per client for broadcast
  });

  it('should handle heartbeat broadcasts efficiently', () => {
    console.log('\nBenchmarking heartbeat broadcasts...');

    const mockRes = new MockResponse() as unknown as Response;
    const clientId = 'bench-client-heartbeat';
    clientManager.addClient(clientId, mockRes);

    let heartbeatCount = 0;
    mockRes.on('data', (data: string) => {
      if (data.includes('heartbeat')) {
        heartbeatCount++;
      }
    });

    // Start heartbeat (interval configured in constructor)
    heartbeat.start();

    // Wait for several heartbeats
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        heartbeat.stop();
        clientManager.removeClient(clientId);

        console.log(`Received ${heartbeatCount} heartbeats in 1 second`);
        expect(heartbeatCount).toBeGreaterThan(5); // Should get ~8-10 heartbeats
        resolve();
      }, 1000);
    });
  });
});
