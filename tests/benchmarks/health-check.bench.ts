/**
 * Health Check Endpoint Performance Benchmarks
 * Target: <10ms p99 latency
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GodotClient } from '../../src/bridge/godot-client.js';
import { benchmark, formatStats, warmup } from './utils.js';

describe('Health Check Performance', () => {
  let client: GodotClient;
  const TARGET_P99 = 10; // milliseconds
  const SAMPLES = 100;

  beforeAll(async () => {
    // Initialize client
    client = new GodotClient({
      port: 7777,
      timeout: 5000,
    });

    // Warmup: establish connection and prime caches
    console.log('Warming up health check...');
    await warmup(async () => {
      await client.healthCheck();
    }, 20);
  });

  afterAll(async () => {
    if (client) {
      await client.close();
    }
  });

  it(`should complete health check in <${TARGET_P99}ms (p99)`, async () => {
    console.log(`\nRunning ${SAMPLES} health check samples...`);

    const { durations, stats } = await benchmark(
      async () => {
        await client.healthCheck();
      },
      SAMPLES
    );

    console.log('Health Check Results:');
    console.log(formatStats(stats));

    // Assertions
    expect(stats.p99).toBeLessThan(TARGET_P99);
    expect(stats.mean).toBeLessThan(TARGET_P99 * 0.7); // Mean should be well below p99
    expect(durations.length).toBe(SAMPLES);
  }, 30000); // 30 second timeout for benchmark

  it('should have consistent latency (low variance)', async () => {
    const { durations, stats } = await benchmark(
      async () => {
        await client.healthCheck();
      },
      SAMPLES
    );

    // Check variance: p99 shouldn't be more than 3x median
    const variance = stats.p99 / stats.median;
    
    console.log(`\nLatency variance: ${variance.toFixed(2)}x (p99/median)`);
    expect(variance).toBeLessThan(3);
  }, 30000);

  it('should handle rapid consecutive health checks', async () => {
    const rapidSamples = 50;
    console.log(`\nRunning ${rapidSamples} rapid consecutive health checks...`);

    const start = performance.now();
    const promises = [];
    
    for (let i = 0; i < rapidSamples; i++) {
      promises.push(client.healthCheck());
    }

    await Promise.all(promises);
    const totalDuration = performance.now() - start;
    const avgDuration = totalDuration / rapidSamples;

    console.log(`Total time: ${totalDuration.toFixed(2)}ms`);
    console.log(`Average per check: ${avgDuration.toFixed(2)}ms`);
    console.log(`Throughput: ${(rapidSamples / (totalDuration / 1000)).toFixed(2)} checks/sec`);

    // Even with concurrency, average should be reasonable
    expect(avgDuration).toBeLessThan(TARGET_P99 * 2);
  }, 30000);

  it('should report accurate health status', async () => {
    // Verify health check returns expected structure
    const health = await client.healthCheck();

    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('port');
    expect(health).toHaveProperty('lastCheck');
    expect(['healthy', 'unhealthy', 'degraded']).toContain(health.status);
  });
});
