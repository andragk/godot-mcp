/**
 * Tool Execution Performance Benchmarks
 * Target: <50ms p99 latency for read operations
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GodotClient } from '../../src/bridge/godot-client.js';
import { EditorControlTools } from '../../src/tools/editor-control.js';
import { benchmark, formatStats, warmup } from './utils.js';

describe('Tool Execution Performance', () => {
  let client: GodotClient;
  let tools: EditorControlTools;
  const TARGET_P99 = 50; // milliseconds
  const SAMPLES = 100;

  beforeAll(async () => {
    client = new GodotClient({
      port: 7777,
      timeout: 5000,
    });

    tools = new EditorControlTools(client);

    // Warmup: establish connections and prime caches
    console.log('Warming up tool executions...');
    await warmup(async () => {
      try {
        await client.healthCheck();
      } catch (error) {
        // Ignore errors during warmup
      }
    }, 20);
  });

  afterAll(async () => {
    if (client) {
      await client.close();
    }
  });

  it(`should execute health check in <${TARGET_P99}ms (p99)`, async () => {
    console.log(`\nRunning ${SAMPLES} health check executions...`);

    const { durations, stats } = await benchmark(
      async () => {
        await client.healthCheck();
      },
      SAMPLES
    );

    console.log('Health Check Results:');
    console.log(formatStats(stats));

    expect(stats.p99).toBeLessThan(TARGET_P99);
    expect(stats.mean).toBeLessThan(TARGET_P99 * 0.5);
  }, 30000);

  it(`should execute getVersion tool in <${TARGET_P99}ms (p99)`, async () => {
    console.log(`\nRunning ${SAMPLES} getVersion tool executions...`);

    const { durations, stats } = await benchmark(
      async () => {
        await tools.getVersion({});
      },
      SAMPLES
    );

    console.log('GetVersion Tool Results:');
    console.log(formatStats(stats));

    expect(stats.p99).toBeLessThan(TARGET_P99);
    expect(stats.mean).toBeLessThan(TARGET_P99 * 0.5);
  }, 30000);

  it('should handle rapid consecutive tool executions', async () => {
    const rapidSamples = 50;
    console.log(`\nRunning ${rapidSamples} rapid consecutive tool executions...`);

    const start = performance.now();
    
    for (let i = 0; i < rapidSamples; i++) {
      await client.healthCheck();
    }

    const totalDuration = performance.now() - start;
    const avgDuration = totalDuration / rapidSamples;

    console.log(`Total time: ${totalDuration.toFixed(2)}ms`);
    console.log(`Average per execution: ${avgDuration.toFixed(2)}ms`);
    console.log(`Throughput: ${(rapidSamples / (totalDuration / 1000)).toFixed(2)} calls/sec`);

    expect(avgDuration).toBeLessThan(TARGET_P99);
  }, 30000);

  it('should handle concurrent tool executions', async () => {
    const concurrentTools = 20;
    console.log(`\nRunning ${concurrentTools} concurrent tool executions...`);

    const start = performance.now();
    const promises = [];

    for (let i = 0; i < concurrentTools; i++) {
      promises.push(client.healthCheck());
    }

    await Promise.all(promises);
    const totalDuration = performance.now() - start;
    const avgDuration = totalDuration / concurrentTools;

    console.log(`Total time: ${totalDuration.toFixed(2)}ms`);
    console.log(`Average per execution: ${avgDuration.toFixed(2)}ms`);

    // Concurrent execution should benefit from connection pooling
    expect(avgDuration).toBeLessThan(TARGET_P99 * 1.5);
  }, 30000);

  it('should compare read vs. write tool performance', async () => {
    console.log('\nComparing read vs. write tool performance...');

    // Benchmark read operation (health check)
    const { stats: readStats } = await benchmark(
      async () => {
        await client.healthCheck();
      },
      50
    );

    console.log('Read operation (health check):');
    console.log(formatStats(readStats));

    // Note: Write operations might not be available for benchmarking
    // without actual Godot editor running, so this is aspirational

    // Read operations should be fast
    expect(readStats.p99).toBeLessThan(TARGET_P99);
  }, 30000);

  it('should maintain consistent performance across tool types', async () => {
    console.log('\nBenchmarking different tool types...');

    const toolBenchmarks = [];

    // Health Check
    const healthBench = await benchmark(async () => { await client.healthCheck(); }, 50);
    toolBenchmarks.push({ name: 'healthCheck', stats: healthBench.stats });

    // GetVersion
    const versionBench = await benchmark(async () => { await tools.getVersion({}); }, 50);
    toolBenchmarks.push({ name: 'getVersion', stats: versionBench.stats });

    // Display results
    for (const bench of toolBenchmarks) {
      console.log(`\n${bench.name}:`);
      console.log(formatStats(bench.stats));
    }

    // All tools should meet performance targets
    for (const bench of toolBenchmarks) {
      expect(bench.stats.p99).toBeLessThan(TARGET_P99);
    }

    // Variance between tools should be reasonable
    const p99Values = toolBenchmarks.map(b => b.stats.p99);
    const maxP99 = Math.max(...p99Values);
    const minP99 = Math.min(...p99Values);
    const variance = maxP99 / minP99;

    console.log(`\nP99 variance across tools: ${variance.toFixed(2)}x`);
    expect(variance).toBeLessThan(3); // Tools shouldn't vary by more than 3x
  }, 60000);
});
