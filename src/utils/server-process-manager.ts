/**
 * MCP Server Process Manager
 * Manages the lifecycle of the MCP server process
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { logger, logError } from '../utils/logger.js';
import { EventEmitter } from 'node:events';

export type ServerState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export interface ServerProcessInfo {
  state: ServerState;
  pid?: number;
  startedAt?: Date;
  stoppedAt?: Date;
  uptime?: number;
  restartCount: number;
  lastError?: string;
}

/**
 * Events emitted by the process manager
 */
export enum ServerLifecycleEvent {
  STARTED = 'server:started',
  STOPPED = 'server:stopped',
  ERROR = 'server:error',
  OUTPUT = 'server:output',
}

/**
 * Process manager for MCP server
 */
export class MCPServerProcessManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private state: ServerState = 'stopped';
  private startedAt: Date | null = null;
  private stoppedAt: Date | null = null;
  private restartCount = 0;
  private lastError: string | null = null;
  private isRestarting = false;
  private startInProgress = false;

  /**
   * Start the MCP server process
   */
  async start(): Promise<void> {
    if (this.state === 'running' || this.startInProgress) {
      throw new Error(`Cannot start server: current state is ${this.state}`);
    }

    if (this.state === 'starting') {
      throw new Error('Server is already starting');
    }

    this.startInProgress = true;
    this.state = 'starting';
    logger.info('Starting MCP server process');

    try {
      // Spawn the MCP server process
      this.process = spawn('node', ['dist/index.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV || 'production',
        },
      });

      if (!this.process.pid) {
        throw new Error('Failed to start process: no PID assigned');
      }

      logger.info('MCP server process spawned', { pid: this.process.pid });

      // Setup process event handlers
      this.setupProcessHandlers();

      // Wait for server to be ready (simple timeout-based approach)
      await this.waitForReady();

      this.state = 'running';
      this.startedAt = new Date();
      this.stoppedAt = null;
      this.lastError = null;
      this.startInProgress = false;

      this.emit(ServerLifecycleEvent.STARTED, {
        pid: this.process.pid,
        startedAt: this.startedAt,
      });

      logger.info('MCP server started successfully', {
        pid: this.process.pid,
        restartCount: this.restartCount,
      });
    } catch (error) {
      this.startInProgress = false;
      this.state = 'error';
      this.lastError = error instanceof Error ? error.message : String(error);

      logError(
        error instanceof Error ? error : new Error(String(error)),
        'Failed to start MCP server'
      );

      this.emit(ServerLifecycleEvent.ERROR, { error: this.lastError });
      throw error;
    }
  }

  /**
   * Stop the MCP server process
   */
  async stop(force = false): Promise<void> {
    if (this.state === 'stopped') {
      logger.warn('Server is already stopped');
      return;
    }

    if (this.state === 'stopping' && !force) {
      throw new Error('Server is already stopping');
    }

    this.state = 'stopping';
    logger.info('Stopping MCP server process', { force });

    if (!this.process || !this.process.pid) {
      this.state = 'stopped';
      return;
    }

    try {
      if (force) {
        // Force kill
        this.process.kill('SIGKILL');
        logger.info('Sent SIGKILL to MCP server', { pid: this.process.pid });
      } else {
        // Graceful shutdown
        this.process.kill('SIGTERM');
        logger.info('Sent SIGTERM to MCP server', { pid: this.process.pid });

        // Wait for graceful shutdown with timeout
        await this.waitForExit(5000);
      }

      this.state = 'stopped';
      this.stoppedAt = new Date();
      this.process = null;

      this.emit(ServerLifecycleEvent.STOPPED, {
        stoppedAt: this.stoppedAt,
        force,
      });

      logger.info('MCP server stopped', { force });
    } catch (error) {
      this.state = 'error';
      this.lastError = error instanceof Error ? error.message : String(error);

      logError(
        error instanceof Error ? error : new Error(String(error)),
        'Failed to stop MCP server'
      );

      this.emit(ServerLifecycleEvent.ERROR, { error: this.lastError });
      throw error;
    }
  }

  /**
   * Restart the MCP server
   */
  async restart(): Promise<void> {
    if (this.isRestarting) {
      throw new Error('Server is already restarting');
    }

    this.isRestarting = true;
    logger.info('Restarting MCP server');

    try {
      if (this.state === 'running' || this.state === 'starting') {
        await this.stop();
      }

      await this.start();
      this.restartCount++;

      logger.info('MCP server restarted successfully', {
        restartCount: this.restartCount,
      });
    } finally {
      this.isRestarting = false;
    }
  }

  /**
   * Get current server process information
   */
  getInfo(): ServerProcessInfo {
    const uptime =
      this.state === 'running' && this.startedAt
        ? Math.floor((Date.now() - this.startedAt.getTime()) / 1000)
        : undefined;

    return {
      state: this.state,
      pid: this.process?.pid,
      startedAt: this.startedAt || undefined,
      stoppedAt: this.stoppedAt || undefined,
      uptime,
      restartCount: this.restartCount,
      lastError: this.lastError || undefined,
    };
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.state === 'running';
  }

  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(): void {
    if (!this.process) return;

    // Handle stdout
    this.process.stdout?.on('data', (data: Buffer) => {
      const output = data.toString().trim();
      logger.debug('MCP server stdout', { output });
      this.emit(ServerLifecycleEvent.OUTPUT, { type: 'stdout', data: output });
    });

    // Handle stderr
    this.process.stderr?.on('data', (data: Buffer) => {
      const output = data.toString().trim();
      logger.warn('MCP server stderr', { output });
      this.emit(ServerLifecycleEvent.OUTPUT, { type: 'stderr', data: output });
    });

    // Handle process exit
    this.process.on('exit', (code: number | null, signal: string | null) => {
      logger.info('MCP server process exited', { code, signal });

      if (this.state !== 'stopping') {
        // Unexpected exit
        this.state = 'error';
        this.lastError = `Process exited unexpectedly with code ${code}, signal ${signal}`;
        this.emit(ServerLifecycleEvent.ERROR, { error: this.lastError });
      } else {
        this.state = 'stopped';
        this.emit(ServerLifecycleEvent.STOPPED, { code, signal });
      }

      this.process = null;
      this.stoppedAt = new Date();
    });

    // Handle process errors
    this.process.on('error', (error: Error) => {
      this.state = 'error';
      this.lastError = error.message;

      logError(error, 'MCP server process error');
      this.emit(ServerLifecycleEvent.ERROR, { error: error.message });
    });
  }

  /**
   * Wait for server to be ready
   */
  private async waitForReady(): Promise<void> {
    // Simple timeout-based wait
    // In production, you'd check for a health endpoint or log message
    return new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }

  /**
   * Wait for process to exit
   */
  private async waitForExit(timeoutMs: number): Promise<void> {
    if (!this.process) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Process did not exit within ${timeoutMs}ms`));
      }, timeoutMs);

      this.process!.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}
