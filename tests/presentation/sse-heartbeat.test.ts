/**
 * Tests for SSEHeartbeat class
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SSEHeartbeat } from '../../src/presentation/sse-heartbeat.js';

describe('SSEHeartbeat', () => {
  let heartbeat: SSEHeartbeat;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (heartbeat) {
      heartbeat.stop();
    }
    vi.restoreAllMocks();
  });

  describe('construction', () => {
    it('should create heartbeat with default interval', () => {
      heartbeat = new SSEHeartbeat();
      const stats = heartbeat.getStats();
      
      expect(stats.interval).toBe(30000); // 30 seconds default
      expect(stats.isRunning).toBe(false);
      expect(stats.heartbeatsSent).toBe(0);
      expect(stats.subscribers).toBe(0);
    });

    it('should create heartbeat with custom interval', () => {
      heartbeat = new SSEHeartbeat({ interval: 15000 });
      const stats = heartbeat.getStats();
      
      expect(stats.interval).toBe(15000);
    });

    it('should throw error for interval below 1000ms', () => {
      expect(() => new SSEHeartbeat({ interval: 500 })).toThrow('Heartbeat interval must be at least 1000ms');
    });
  });

  describe('subscribe/unsubscribe', () => {
    beforeEach(() => {
      heartbeat = new SSEHeartbeat();
    });

    it('should add subscriber', () => {
      const callback = vi.fn();
      heartbeat.subscribe(callback);
      
      const stats = heartbeat.getStats();
      expect(stats.subscribers).toBe(1);
    });

    it('should add multiple subscribers', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      heartbeat.subscribe(callback1);
      heartbeat.subscribe(callback2);
      
      const stats = heartbeat.getStats();
      expect(stats.subscribers).toBe(2);
    });

    it('should not add duplicate subscriber', () => {
      const callback = vi.fn();
      
      heartbeat.subscribe(callback);
      heartbeat.subscribe(callback); // Add same callback again
      
      const stats = heartbeat.getStats();
      expect(stats.subscribers).toBe(1);
    });

    it('should remove subscriber', () => {
      const callback = vi.fn();
      
      heartbeat.subscribe(callback);
      expect(heartbeat.getStats().subscribers).toBe(1);
      
      heartbeat.unsubscribe(callback);
      expect(heartbeat.getStats().subscribers).toBe(0);
    });

    it('should handle unsubscribe of non-existent callback', () => {
      const callback = vi.fn();
      
      // Should not throw
      expect(() => heartbeat.unsubscribe(callback)).not.toThrow();
      expect(heartbeat.getStats().subscribers).toBe(0);
    });
  });

  describe('start/stop', () => {
    beforeEach(() => {
      heartbeat = new SSEHeartbeat({ interval: 1000 });
    });

    it('should start heartbeat', () => {
      heartbeat.start();
      
      const stats = heartbeat.getStats();
      expect(stats.isRunning).toBe(true);
    });

    it('should not start if already running', () => {
      heartbeat.start();
      const firstStart = heartbeat.getStats().isRunning;
      
      heartbeat.start(); // Try to start again
      const secondStart = heartbeat.getStats().isRunning;
      
      expect(firstStart).toBe(true);
      expect(secondStart).toBe(true);
    });

    it('should stop heartbeat', () => {
      heartbeat.start();
      expect(heartbeat.getStats().isRunning).toBe(true);
      
      heartbeat.stop();
      expect(heartbeat.getStats().isRunning).toBe(false);
    });

    it('should handle stop when not running', () => {
      expect(() => heartbeat.stop()).not.toThrow();
      expect(heartbeat.getStats().isRunning).toBe(false);
    });

    it('should call subscribers on heartbeat interval', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      heartbeat.subscribe(callback1);
      heartbeat.subscribe(callback2);
      heartbeat.start();
      
      // Fast-forward time by interval
      vi.advanceTimersByTime(1000);
      
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      
      // Fast-forward again
      vi.advanceTimersByTime(1000);
      
      expect(callback1).toHaveBeenCalledTimes(2);
      expect(callback2).toHaveBeenCalledTimes(2);
    });

    it('should increment heartbeats sent counter', () => {
      const callback = vi.fn();
      heartbeat.subscribe(callback);
      heartbeat.start();
      
      expect(heartbeat.getStats().heartbeatsSent).toBe(0);
      
      vi.advanceTimersByTime(1000);
      expect(heartbeat.getStats().heartbeatsSent).toBe(1);
      
      vi.advanceTimersByTime(1000);
      expect(heartbeat.getStats().heartbeatsSent).toBe(2);
    });

    it('should not call unsubscribed callbacks', () => {
      const callback = vi.fn();
      
      heartbeat.subscribe(callback);
      heartbeat.start();
      
      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1);
      
      heartbeat.unsubscribe(callback);
      
      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1); // Still only 1
    });

    it('should handle callback errors gracefully', () => {
      const failingCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const workingCallback = vi.fn();
      
      heartbeat.subscribe(failingCallback);
      heartbeat.subscribe(workingCallback);
      heartbeat.start();
      
      // Should not throw and should call both callbacks
      expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
      
      expect(failingCallback).toHaveBeenCalledTimes(1);
      expect(workingCallback).toHaveBeenCalledTimes(1);
    });

    it('should clear interval on stop', () => {
      const callback = vi.fn();
      heartbeat.subscribe(callback);
      heartbeat.start();
      
      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1);
      
      heartbeat.stop();
      
      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1); // No additional calls
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      heartbeat = new SSEHeartbeat({ interval: 2000 });
    });

    it('should return accurate statistics', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      heartbeat.subscribe(callback1);
      heartbeat.subscribe(callback2);
      heartbeat.start();
      
      const stats = heartbeat.getStats();
      
      expect(stats).toEqual({
        isRunning: true,
        interval: 2000,
        heartbeatsSent: 0,
        subscribers: 2
      });
    });

    it('should update statistics after heartbeats', () => {
      const callback = vi.fn();
      heartbeat.subscribe(callback);
      heartbeat.start();
      
      vi.advanceTimersByTime(4000); // 2 heartbeats
      
      const stats = heartbeat.getStats();
      expect(stats.heartbeatsSent).toBe(2);
    });

    it('should reflect stopped state', () => {
      heartbeat.start();
      heartbeat.stop();
      
      const stats = heartbeat.getStats();
      expect(stats.isRunning).toBe(false);
    });
  });
});
