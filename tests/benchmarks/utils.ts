/**
 * Performance Benchmark Utilities
 * Statistical analysis and timing helpers
 */

/**
 * Calculate percentile from array of numbers
 * @param arr Array of numbers (will be sorted)
 * @param p Percentile (0-100)
 * @returns Value at percentile
 */
export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) {
    throw new Error('Cannot calculate percentile of empty array');
  }
  
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calculate multiple percentiles
 */
export function percentiles(arr: number[], ps: number[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const p of ps) {
    result[`p${p}`] = percentile(arr, p);
  }
  return result;
}

/**
 * Calculate basic statistics
 */
export interface Stats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p50: number;
  p95: number;
  p99: number;
  samples: number;
}

export function calculateStats(arr: number[]): Stats {
  if (arr.length === 0) {
    throw new Error('Cannot calculate stats of empty array');
  }

  const sorted = [...arr].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    median: percentile(sorted, 50),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    samples: sorted.length,
  };
}

/**
 * Format duration in appropriate unit
 */
export function formatDuration(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(2)}μs`;
  } else if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  } else {
    return `${(ms / 1000).toFixed(2)}s`;
  }
}

/**
 * Format stats for display
 */
export function formatStats(stats: Stats): string {
  return [
    `Samples: ${stats.samples}`,
    `Min: ${formatDuration(stats.min)}`,
    `Mean: ${formatDuration(stats.mean)}`,
    `Median: ${formatDuration(stats.median)}`,
    `P95: ${formatDuration(stats.p95)}`,
    `P99: ${formatDuration(stats.p99)}`,
    `Max: ${formatDuration(stats.max)}`,
  ].join(' | ');
}

/**
 * Measure async function execution time
 */
export async function measure<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { result, duration };
}

/**
 * Run benchmark with multiple samples
 */
export async function benchmark(
  fn: () => Promise<void>,
  samples: number
): Promise<{ durations: number[]; stats: Stats }> {
  const durations: number[] = [];

  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    await fn();
    const duration = performance.now() - start;
    durations.push(duration);
  }

  const stats = calculateStats(durations);
  return { durations, stats };
}

/**
 * Warmup function (run once before benchmarking)
 */
export async function warmup(fn: () => Promise<void>, iterations = 10): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
}
