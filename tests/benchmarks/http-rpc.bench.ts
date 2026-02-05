/**
 * HTTP RPC Performance Benchmarks
 * Target: <20ms p99 latency for localhost roundtrip
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GodotClient } from '../../src/bridge/godot-client.js';
import { benchmark, formatStats, warmup } from './utils.js';

describe('HTTP RPC Performance', () => {
  let client: GodotClient;
  const TARGET_P99 = 20; // milliseconds
  const SAMPLES = 100;

  beforeAll(async () => {
    client = new GodotClient({
      port: 7777,
      timeout: 5000,
    });

    // Warmup: establish connection pool and prime caches
    console.log('Warming up HTTP RPC...');
    await warmup(async () => {
      try {
        await client.sendRequest('ping');
      } catch (error) {
        // Ignore errors during warmup (bridge might not be running)
      }
    }, 20);
  });

  afterAll(async () => {
    if (client) {
      await client.close();
    }
  });

  it(`should complete RPC roundtrip in <${TARGET_P99}ms (p99)`, async () => {
    console.log(`\nRunning ${SAMPLES} RPC roundtrip samples...`);

    const { durations, stats } = await benchmark(
      async () => {
        await client.sendRequest('ping');
      },
      SAMPLES
    );

    console.log('HTTP RPC Results:');
    console.log(formatStats(stats));

    // Assertions
    expect(stats.p99).toBeLessThan(TARGET_P99);
    expect(stats.mean).toBeLessThan(TARGET_P99 * 0.6);
    expect(durations.length).toBe(SAMPLES);
  }, 30000);

  it('should have efficient connection pooling', async () => {
    // First request might be slower (connection establishment)
    const firstRequest = performance.now();
    await client.sendRequest('ping');
    const firstDuration = performance.now() - firstRequest;

    // Subsequent requests should reuse connection
    const { stats } = await benchmark(
      async () => {
        await client.sendRequest('ping');
      },
      50
    );

    console.log(`\nFirst request: ${firstDuration.toFixed(2)}ms`);
    console.log(`Pooled average: ${stats.mean.toFixed(2)}ms`);

    // Pooled requests should be faster than first (connection reuse)
    expect(stats.mean).toBeLessThan(firstDuration);
  }, 30000);

  it('should handle concurrent RPC calls efficiently', async () => {
    const concurrentCalls = 50;
    console.log(`\nRunning ${concurrentCalls} concurrent RPC calls...`);

    const start = performance.now();
    const promises = [];

    for (let i = 0; i < concurrentCalls; i++) {
      promises.push(client.sendRequest('ping'));
    }

    const results = await Promise.all(promises);
    const totalDuration = performance.now() - start;
    const avgDuration = totalDuration / concurrentCalls;

    console.log(`Total time: ${totalDuration.toFixed(2)}ms`);
    console.log(`Average per call: ${avgDuration.toFixed(2)}ms`);
    console.log(`Throughput: ${(concurrentCalls / (totalDuration / 1000)).toFixed(2)} calls/sec`);

    // All calls should succeed
    expect(results.length).toBe(concurrentCalls);
    
    // Average should still be reasonable with concurrency
    expect(avgDuration).toBeLessThan(TARGET_P99 * 2);
  }, 30000);

  it('should handle requests with parameters efficiently', async () => {
    const params = {
      arg1: 'test',
      arg2: 123,
      arg3: { nested: 'value' },
    };

    const { stats } = await benchmark(
      async () => {
        await client.sendRequest('test_method', params);
      },
      SAMPLES
    );

    console.log('\nRPC with parameters:');
    console.log(formatStats(stats));

    // Parameters shouldn't significantly impact latency
    expect(stats.p99).toBeLessThan(TARGET_P99 * 1.5);
  }, 30000);

  it('should maintain performance under sustained load', async () => {
    // Run longer test to check for performance degradation
    const sustainedSamples = 200;
    console.log(`\nRunning sustained load test (${sustainedSamples} samples)...`);

    const durations: number[] = [];

    for (let i = 0; i < sustainedSamples; i++) {
      const start = performance.now();
      await client.sendRequest('ping');
      durations.push(performance.now() - start);
    }

    // Split into first half and second half
    const firstHalf = durations.slice(0, Math.floor(sustainedSamples / 2));
    const secondHalf = durations.slice(Math.floor(sustainedSamples / 2));

    const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    console.log(`First half average: ${firstHalfAvg.toFixed(2)}ms`);
    console.log(`Second half average: ${secondHalfAvg.toFixed(2)}ms`);

    // Performance shouldn't degrade significantly over time
    const degradation = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;
    console.log(`Performance change: ${(degradation * 100).toFixed(2)}%`);

    expect(Math.abs(degradation)).toBeLessThan(0.2); // Less than 20% degradation
  }, 60000); // 60 second timeout for sustained test
});
