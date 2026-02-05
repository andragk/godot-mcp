/**
 * SSE Heartbeat Manager
 * Sends periodic keep-alive messages to maintain SSE connections
 */
import { logger } from '../utils/logger.js';

/**
 * Heartbeat callback function type
 */
export type HeartbeatCallback = () => void;

/**
 * SSE Heartbeat configuration
 */
export interface SSEHeartbeatConfig {
  /**
   * Interval between heartbeats in milliseconds
   * @default 30000 (30 seconds)
   */
  interval?: number;

  /**
   * Custom heartbeat message
   * @default ': heartbeat\n\n'
   */
  message?: string;
}

/**
 * Manages periodic heartbeat for SSE connections
 */
export class SSEHeartbeat {
  private readonly interval: number;
  private readonly message: string;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private heartbeatCount = 0;
  private readonly callbacks: Set<HeartbeatCallback> = new Set();

  constructor(config: SSEHeartbeatConfig = {}) {
    this.interval = config.interval ?? 30000; // 30 seconds default
    this.message = config.message ?? ': heartbeat\n\n';

    if (this.interval < 1000) {
      throw new Error('Heartbeat interval must be at least 1000ms');
    }
  }

  /**
   * Subscribe to heartbeat events
   */
  subscribe(callback: HeartbeatCallback): void {
    this.callbacks.add(callback);
    
    logger.debug('Heartbeat subscriber added', {
      service: 'web-server',
      totalSubscribers: this.callbacks.size
    });
  }

  /**
   * Unsubscribe from heartbeat events
   */
  unsubscribe(callback: HeartbeatCallback): void {
    this.callbacks.delete(callback);
    
    logger.debug('Heartbeat subscriber removed', {
      service: 'web-server',
      totalSubscribers: this.callbacks.size
    });
  }

  /**
   * Start the heartbeat interval
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Heartbeat already running', {
        service: 'web-server'
      });
      return;
    }

    this.isRunning = true;
    this.heartbeatCount = 0;

    this.timer = setInterval(() => {
      this.sendHeartbeat();
    }, this.interval);

    logger.info('SSE heartbeat started', {
      service: 'web-server',
      interval: `${this.interval}ms`,
      subscribers: this.callbacks.size
    });
  }

  /**
   * Stop the heartbeat interval
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.isRunning = false;

    logger.info('SSE heartbeat stopped', {
      service: 'web-server',
      totalHeartbeatsSent: this.heartbeatCount
    });
  }

  /**
   * Send heartbeat to all subscribers
   */
  private sendHeartbeat(): void {
    this.heartbeatCount++;

    if (this.callbacks.size === 0) {
      logger.debug('Heartbeat tick (no subscribers)', {
        service: 'web-server',
        count: this.heartbeatCount
      });
      return;
    }

    logger.debug('Sending heartbeat', {
      service: 'web-server',
      subscribers: this.callbacks.size,
      count: this.heartbeatCount
    });

    for (const callback of this.callbacks) {
      try {
        callback();
      } catch (error) {
        logger.error('Heartbeat callback error', {
          service: 'web-server',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Get heartbeat statistics
   */
  getStats(): {
    isRunning: boolean;
    interval: number;
    heartbeatsSent: number;
    subscribers: number;
  } {
    return {
      isRunning: this.isRunning,
      interval: this.interval,
      heartbeatsSent: this.heartbeatCount,
      subscribers: this.callbacks.size,
    };
  }

  /**
   * Get the heartbeat message
   */
  getMessage(): string {
    return this.message;
  }
}
